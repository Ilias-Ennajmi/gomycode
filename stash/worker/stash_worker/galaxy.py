"""Galaxy lens: the owner's saves as dots, grouped by meaning and labelled by topic.

`galaxy` jobs are queued by the database once 5+ new embeddings arrived since the
last layout. The layout itself is pure numpy and deterministic (fixed seed):

1. Unit-normalise the embeddings (cosine distance ≈ Euclidean distance).
2. k-means with k = round(sqrt(n / 2)) clamped to 2..12 (1 below 4 saves), k-means++ seeding.
3. PCA to 2D for positions; each dot sits near its cluster's centre (members pulled
   in), so groups read as groups on a phone screen. Coordinates fit in -1..1.
4. One fast-model call labels every cluster with 2–4 words from its members' tags and
   key ideas. Without the model, over budget, or on a bad answer, a cluster is
   labelled with its most common tag.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np

from .rules import InsightError, claude_cost

SEED = 7
MAX_K = 12
PULL = 0.45  # how far members are pulled toward their cluster centre (0 = PCA as is, 1 = all on the centre)


@dataclass
class Layout:
    ids: list[str]
    xy: np.ndarray          # (n, 2) in -1..1
    labels: np.ndarray      # (n,) cluster index
    centers: np.ndarray     # (k, 2) in -1..1
    sizes: list[int]


def choose_k(n: int) -> int:
    if n < 4:
        return 1
    return int(max(2, min(MAX_K, round(math.sqrt(n / 2)), n)))


def parse_vector(v: Any) -> list[float] | None:
    """PostgREST returns pgvector as a string like "[0.1,0.2]"."""
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return None
    if isinstance(v, list) and v and all(isinstance(x, (int, float)) for x in v):
        return [float(x) for x in v]
    return None


def _kmeans(x: np.ndarray, k: int, rng: np.random.Generator, iters: int = 60) -> np.ndarray:
    n = x.shape[0]
    if k <= 1:
        return np.zeros(n, dtype=int)
    # k-means++ seeding
    centers = [x[rng.integers(n)]]
    for _ in range(1, k):
        d2 = np.min(((x[:, None, :] - np.array(centers)[None, :, :]) ** 2).sum(-1), axis=1)
        total = d2.sum()
        if total <= 0:
            centers.append(x[rng.integers(n)])
            continue
        centers.append(x[rng.choice(n, p=d2 / total)])
    c = np.array(centers)
    labels = np.zeros(n, dtype=int)
    for i in range(iters):
        dist = ((x[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        new = dist.argmin(axis=1)
        if i and np.array_equal(new, labels):
            break
        labels = new
        for j in range(k):
            members = x[labels == j]
            # An empty cluster takes the point farthest from its centre.
            c[j] = members.mean(axis=0) if len(members) else x[dist.min(axis=1).argmax()]
    return _renumber(labels)


def _renumber(labels: np.ndarray) -> np.ndarray:
    """Clusters numbered by size (largest = 0), ties by first member: stable ids for the same data."""
    counts = Counter(labels.tolist())
    first = {lab: int(np.argmax(labels == lab)) for lab in counts}
    order = sorted(counts, key=lambda lab: (-counts[lab], first[lab]))
    mapping = {old: new for new, old in enumerate(order)}
    return np.array([mapping[lab] for lab in labels.tolist()], dtype=int)


def _pca2(x: np.ndarray) -> np.ndarray:
    n = x.shape[0]
    if n == 1:
        return np.zeros((1, 2))
    centred = x - x.mean(axis=0)
    _, _, vt = np.linalg.svd(centred, full_matrices=False)
    comps = vt[:2]
    # SVD signs are arbitrary: make the largest loading of each component positive.
    for i in range(comps.shape[0]):
        if comps[i, np.argmax(np.abs(comps[i]))] < 0:
            comps[i] = -comps[i]
    out = centred @ comps.T
    if out.shape[1] == 1:
        out = np.hstack([out, np.zeros((n, 1))])
    return out


def layout(ids: list[str], vectors: list[list[float]], seed: int = SEED) -> Layout:
    if not ids:
        return Layout([], np.zeros((0, 2)), np.zeros(0, dtype=int), np.zeros((0, 2)), [])
    x = np.asarray(vectors, dtype=float)
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    x = x / np.where(norms == 0, 1, norms)
    rng = np.random.default_rng(seed)
    k = choose_k(len(ids))
    labels = _kmeans(x, k, rng)
    p = _pca2(x)
    k = int(labels.max()) + 1
    centers = np.array([p[labels == j].mean(axis=0) for j in range(k)])
    xy = centers[labels] + (p - centers[labels]) * (1 - PULL)
    scale = float(np.abs(xy).max()) or 1.0
    xy = xy / scale * 0.92  # margin so dots and labels stay inside the view
    centers = np.array([xy[labels == j].mean(axis=0) for j in range(k)])
    return Layout(ids, xy, labels, centers, [int((labels == j).sum()) for j in range(k)])


# --- Labels ------------------------------------------------------------------------------

def top_tag(tags: list[list[str]]) -> str | None:
    counts = Counter(t.strip().lower() for ts in tags for t in (ts or []) if t and t.strip())
    if not counts:
        return None
    best = max(counts.items(), key=lambda kv: (kv[1], -len(kv[0]), [-ord(c) for c in kv[0]]))[0]
    return best[:1].upper() + best[1:]


def fallback_labels(members: dict[int, list[dict[str, Any]]]) -> dict[int, str]:
    return {c: top_tag([m.get("tags") or [] for m in ms]) or f"Group {c + 1}" for c, ms in members.items()}


def clean_label(value: Any) -> str | None:
    """2–4 words, no trailing punctuation, sentence case. None when unusable."""
    if not isinstance(value, str):
        return None
    words = value.replace("\n", " ").strip().strip(".:;,!").split()
    if not words:
        return None
    words = words[:4]
    label = " ".join(words)[:40].strip()
    return label[:1].upper() + label[1:] if label else None


def normalize_labels(raw: Any, clusters: list[int]) -> dict[int, str]:
    if not isinstance(raw, dict) or not isinstance(raw.get("labels"), list):
        raise InsightError("labels missing")
    out: dict[int, str] = {}
    for item in raw["labels"]:
        if not isinstance(item, dict):
            continue
        try:
            c = int(item.get("cluster"))
        except (TypeError, ValueError):
            continue
        label = clean_label(item.get("label"))
        if c in clusters and label and c not in out:
            out[c] = label
    if not out:
        raise InsightError("no usable label")
    return out


LABEL_SYSTEM = """You name groups of saved videos for their owner's "Galaxy" map.
Each group lists its members' tags and key ideas. Give each group a label of 2 to 4 words, in English,
that says what the group is about (for example "Pricing psychology", "Casablanca cafés", "Home workouts").
Labels must differ from each other. No punctuation, no emoji."""

LABEL_TOOL = {
    "name": "label_clusters",
    "description": "Store one short topic label per group.",
    "input_schema": {
        "type": "object",
        "properties": {
            "labels": {
                "type": "array",
                "items": {"type": "object",
                          "properties": {"cluster": {"type": "integer"}, "label": {"type": "string"}},
                          "required": ["cluster", "label"]},
            },
        },
        "required": ["labels"],
    },
}


def label_prompt(members: dict[int, list[dict[str, Any]]]) -> str:
    parts = []
    for c, ms in sorted(members.items()):
        tags = Counter(t for m in ms for t in (m.get("tags") or []))
        ideas = [m["key_idea"] for m in ms if m.get("key_idea")][:6]
        parts.append(f"Group {c} ({len(ms)} saves)\nTags: {', '.join(t for t, _ in tags.most_common(10)) or '(none)'}\n"
                     + "\n".join(f"- {i}" for i in ideas))
    return "\n\n".join(parts)[:20000]


@dataclass
class Labels:
    labels: dict[int, str]
    input_tokens: int = 0
    output_tokens: int = 0
    usd: float = 0.0
    ai: bool = False


def label_clusters(cfg: Any, members: dict[int, list[dict[str, Any]]], allow_ai: bool) -> Labels:
    """One call for every cluster; missing or unusable labels fall back to the top tag."""
    fallback = fallback_labels(members)
    if not allow_ai or not cfg.has_claude or not members:
        return Labels(fallback)
    from . import ai  # lazy: keeps this module importable without the SDK

    try:
        got, t_in, t_out = ai.call_tool(ai._client(cfg), model=cfg.fast_model, system=LABEL_SYSTEM, tool=LABEL_TOOL,
                                        content=label_prompt(members), max_tokens=400,
                                        validate=lambda raw: normalize_labels(raw, list(members)))
    except InsightError as exc:
        tokens = getattr(exc, "tokens", (0, 0))
        return Labels(fallback, tokens[0], tokens[1], claude_cost(tokens[0], tokens[1], cfg.fast_usd_in, cfg.fast_usd_out))
    return Labels({c: got.get(c, fallback[c]) for c in members}, t_in, t_out,
                  claude_cost(t_in, t_out, cfg.fast_usd_in, cfg.fast_usd_out), ai=True)


# --- Job ---------------------------------------------------------------------------------

PAGE = 1000


def _all(supa: Any, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = supa.select(table, {**params, "limit": str(PAGE), "offset": str(offset)})
        rows += page
        if len(page) < PAGE:
            return rows
        offset += PAGE


def process_galaxy(supa: Any, cfg: Any, job: dict[str, Any], gate) -> str:
    """Lays out the owner's Galaxy and replaces their points and clusters."""
    from .pipeline import _finish_job, _log_usage  # circular at import time

    user_id = job.get("user_id")
    if not user_id:
        _finish_job(supa, job, "failed", "no user")
        return "failed"
    refused = gate(supa, cfg, user_id)
    if refused == "not_owner":
        _finish_job(supa, job, "failed", refused)
        return refused

    started = datetime.now(timezone.utc).isoformat()  # embeddings after this count toward the next layout
    emb = _all(supa, "embeddings", {"select": "save_id,vector", "user_id": f"eq.{user_id}", "order": "save_id"})
    ids, vectors = [], []
    for r in emb:
        v = parse_vector(r.get("vector"))
        if v:
            ids.append(r["save_id"])
            vectors.append(v)
    if vectors and len({len(v) for v in vectors}) > 1:  # mixed models: keep the most common size
        size = Counter(len(v) for v in vectors).most_common(1)[0][0]
        keep = [i for i, v in enumerate(vectors) if len(v) == size]
        ids, vectors = [ids[i] for i in keep], [vectors[i] for i in keep]

    lay = layout(ids, vectors)
    ins = {r["save_id"]: r for r in _all(supa, "insights", {"select": "save_id,key_idea,tags", "user_id": f"eq.{user_id}"})}
    members: dict[int, list[dict[str, Any]]] = {}
    for sid, c in zip(lay.ids, lay.labels.tolist()):
        members.setdefault(int(c), []).append(ins.get(sid, {}))

    # Over budget: still lay out, with tag labels and no spend.
    labels = label_clusters(cfg, members, allow_ai=refused is None)
    if labels.input_tokens or labels.output_tokens:
        _log_usage(supa, [{"user_id": user_id, "kind": "galaxy", "input_tokens": labels.input_tokens,
                           "output_tokens": labels.output_tokens, "usd": labels.usd}])

    supa.delete("galaxy_points", {"user_id": f"eq.{user_id}"})
    supa.delete("galaxy_clusters", {"user_id": f"eq.{user_id}"})
    if lay.ids:
        supa.insert("galaxy_points", [
            {"save_id": sid, "user_id": user_id, "x": round(float(x), 4), "y": round(float(y), 4), "cluster": int(c)}
            for sid, (x, y), c in zip(lay.ids, lay.xy.tolist(), lay.labels.tolist())])
        supa.insert("galaxy_clusters", [
            {"user_id": user_id, "cluster": c, "label": labels.labels.get(c, f"Group {c + 1}"),
             "cx": round(float(lay.centers[c][0]), 4), "cy": round(float(lay.centers[c][1]), 4), "size": lay.sizes[c]}
            for c in range(len(lay.sizes))])
    # Last, so the phone (listening to this row) reloads a complete layout.
    supa.insert("galaxy_layouts", {"user_id": user_id, "built_at": started, "points": len(lay.ids)}, upsert_on="user_id")
    _finish_job(supa, job, "done")
    return "galaxy"
