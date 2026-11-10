"""Galaxy layout (deterministic, seeded), labels (one AI call + fallback) and the job."""

from __future__ import annotations

import numpy as np
import pytest

from stash_worker import ai, galaxy, pipeline
from stash_worker.rules import InsightError

from test_pipeline import OWNER, FakeSupa, cfg


def blobs(seed=1, per=6, dims=32):
    """Three well-separated topics of `per` saves each."""
    rng = np.random.default_rng(seed)
    centres = np.eye(dims)[:3] * 5
    ids, vecs, truth = [], [], []
    for t, c in enumerate(centres):
        for i in range(per):
            ids.append(f"s{t}-{i}")
            vecs.append((c + rng.normal(0, 0.3, dims)).tolist())
            truth.append(t)
    return ids, vecs, truth


def test_choose_k():
    assert galaxy.choose_k(1) == 1 and galaxy.choose_k(3) == 1
    assert galaxy.choose_k(5) == 2
    assert galaxy.choose_k(18) == 3
    assert galaxy.choose_k(200) == 10
    assert galaxy.choose_k(10_000) == 12


def test_layout_is_deterministic_and_separates_topics():
    ids, vecs, truth = blobs()
    a = galaxy.layout(ids, vecs)
    b = galaxy.layout(ids, vecs)
    assert np.array_equal(a.labels, b.labels) and np.allclose(a.xy, b.xy) and np.allclose(a.centers, b.centers)
    assert len(a.sizes) == 3 and sorted(a.sizes) == [6, 6, 6]
    # Each true topic lands in exactly one cluster.
    for t in range(3):
        assert len({int(a.labels[i]) for i, tt in enumerate(truth) if tt == t}) == 1
    assert np.abs(a.xy).max() <= 1.0
    # Members sit closer to their own centre than to any other.
    for i, c in enumerate(a.labels):
        d = np.linalg.norm(a.centers - a.xy[i], axis=1)
        assert d.argmin() == c


def test_layout_handles_tiny_libraries():
    one = galaxy.layout(["a"], [[1.0, 0.0]])
    assert one.labels.tolist() == [0] and one.sizes == [1] and np.allclose(one.xy, 0)
    empty = galaxy.layout([], [])
    assert empty.sizes == [] and empty.xy.shape == (0, 2)


def test_parse_vector():
    assert galaxy.parse_vector("[0.5,1,-2]") == [0.5, 1.0, -2.0]
    assert galaxy.parse_vector([1, 2]) == [1.0, 2.0]
    assert galaxy.parse_vector("nope") is None and galaxy.parse_vector(None) is None


def test_fallback_label_is_the_top_tag():
    members = {0: [{"tags": ["pricing", "saas"]}, {"tags": ["pricing"]}], 1: [{"tags": []}], 2: [{}]}
    assert galaxy.fallback_labels(members) == {0: "Pricing", 1: "Group 2", 2: "Group 3"}


def test_labels_are_cleaned_and_validated():
    out = galaxy.normalize_labels({"labels": [{"cluster": 0, "label": "pricing psychology tricks for saas founders."},
                                              {"cluster": 9, "label": "Ghost"}, {"cluster": "1", "label": "Cafés"}]},
                                  [0, 1])
    assert out == {0: "Pricing psychology tricks for", 1: "Cafés"}
    with pytest.raises(InsightError):
        galaxy.normalize_labels({"labels": [{"cluster": 5, "label": "x"}]}, [0])


def test_label_clusters_uses_one_call_and_falls_back(monkeypatch):
    calls = []

    def fake_call(client, **kw):
        calls.append(kw)
        return kw["validate"]({"labels": [{"cluster": 0, "label": "Pricing psychology"}]}), 400, 30

    monkeypatch.setattr(ai, "_client", lambda c: None)
    monkeypatch.setattr(ai, "call_tool", fake_call)
    members = {0: [{"tags": ["pricing"], "key_idea": "Add a decoy tier."}], 1: [{"tags": ["coffee"]}]}
    got = galaxy.label_clusters(cfg(), members, allow_ai=True)
    assert len(calls) == 1 and "Group 0" in calls[0]["content"] and "Add a decoy tier." in calls[0]["content"]
    assert got.labels == {0: "Pricing psychology", 1: "Coffee"} and got.ai and got.usd > 0
    # No AI (over budget or not set up): no call, tag labels.
    calls.clear()
    assert galaxy.label_clusters(cfg(), members, allow_ai=False).labels == {0: "Pricing", 1: "Coffee"}
    assert galaxy.label_clusters(cfg(anthropic_key=""), members, allow_ai=True).labels == {0: "Pricing", 1: "Coffee"}
    assert not calls


def test_label_clusters_survives_an_unusable_answer(monkeypatch):
    def bad(client, **kw):
        err = InsightError("no label_clusters call")
        err.tokens = (300, 10)
        raise err

    monkeypatch.setattr(ai, "_client", lambda c: None)
    monkeypatch.setattr(ai, "call_tool", bad)
    got = galaxy.label_clusters(cfg(), {0: [{"tags": ["food"]}]}, allow_ai=True)
    assert got.labels == {0: "Food"} and not got.ai and got.input_tokens == 300


class GalaxySupa(FakeSupa):
    def __init__(self):
        super().__init__()
        self.tables.update({"galaxy_points": [], "galaxy_clusters": [], "galaxy_layouts": []})


@pytest.fixture()
def db():
    d = GalaxySupa()
    d.tables["settings"] = [{"user_id": OWNER, "monthly_budget_usd": 5}]
    ids, vecs, truth = blobs(per=6)  # 18 saves → k = 3
    tags = ["pricing", "coffee", "workout"]
    d.tables["embeddings"] = [{"save_id": i, "user_id": OWNER, "vector": "[" + ",".join(f"{x:.4f}" for x in v) + "]"}
                              for i, v in zip(ids, vecs)]
    d.tables["insights"] = [{"save_id": i, "user_id": OWNER, "key_idea": f"idea {i}", "tags": [tags[t]]}
                            for i, t in zip(ids, truth)]
    d.tables["galaxy_points"] = [{"save_id": "old", "user_id": OWNER, "x": 0, "y": 0, "cluster": 0}]
    return d


JOB = {"id": "g1", "type": "galaxy", "user_id": OWNER, "attempts": 1}


def test_galaxy_job_replaces_the_layout(db, monkeypatch):
    monkeypatch.setattr(galaxy, "label_clusters",
                        lambda c, members, allow_ai: galaxy.Labels(galaxy.fallback_labels(members), 100, 10, 0.0002, True))
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(), JOB) == "galaxy"
    pts = db.tables["galaxy_points"]
    assert len(pts) == 18 and "old" not in {p["save_id"] for p in pts}
    clusters = db.tables["galaxy_clusters"]
    assert sorted(c["label"] for c in clusters) == ["Coffee", "Pricing", "Workout"]
    assert sum(c["size"] for c in clusters) == 18
    # Every save sits in the cluster whose label is its tag.
    by_cluster = {c["cluster"]: c["label"] for c in clusters}
    tag = {r["save_id"]: r["tags"][0] for r in db.tables["insights"]}
    assert all(by_cluster[p["cluster"]].lower() == tag[p["save_id"]] for p in pts)
    assert db.tables["galaxy_layouts"][0]["points"] == 18
    assert db.tables["usage"][0]["kind"] == "galaxy"
    assert db.tables["jobs"][0]["state"] == "done"


def test_galaxy_over_budget_still_lays_out_without_ai(db, monkeypatch):
    seen = {}

    def spy(c, members, allow_ai):
        seen["allow_ai"] = allow_ai
        return galaxy.Labels(galaxy.fallback_labels(members))

    monkeypatch.setattr(galaxy, "label_clusters", spy)
    db.tables["usage"] = [{"user_id": OWNER, "usd": 9, "created_at": "9999-01-01T00:00:00+00:00"}]
    assert pipeline.process_job(db, cfg(), JOB) == "galaxy"
    assert seen["allow_ai"] is False and len(db.tables["galaxy_points"]) == 18
    assert len(db.tables["usage"]) == 1  # nothing new logged


def test_galaxy_for_a_stranger_is_refused(db):
    db.tables["jobs"] = [dict(JOB, state="running")]
    assert pipeline.process_job(db, cfg(owner_user_ids=frozenset({"x"})), JOB) == "not_owner"
    assert db.tables["galaxy_points"][0]["save_id"] == "old"


def test_label_prompt_lists_each_group():
    text = galaxy.label_prompt({1: [{"tags": ["a"], "key_idea": "k"}], 0: [{"tags": ["b"]}]})
    assert text.index("Group 0") < text.index("Group 1") and "Tags: a" in text


def test_layout_seed_matters_only_for_ties():
    ids, vecs, _ = blobs(seed=3)
    assert np.array_equal(galaxy.layout(ids, vecs, seed=1).labels, galaxy.layout(ids, vecs, seed=99).labels)
