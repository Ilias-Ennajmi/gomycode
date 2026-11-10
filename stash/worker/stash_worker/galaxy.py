"""Galaxy lens: the owner's saves as dots, grouped by meaning and labelled by topic.

`galaxy` jobs are queued by the database once 5+ new embeddings arrived since the
last layout. The layout is plain Python (no numpy: the function bundle stays small) and
deterministic (fixed seed). 2 000 saves x 384 dims lay out in a few seconds.

1. Unit-normalise the embeddings (cosine distance ≈ Euclidean distance).
2. k-means with k = round(sqrt(n / 2)) clamped to 2..12 (1 below 4 saves), k-means++ seeding.
3. PCA to 2D (power iteration) for positions; each dot sits near its cluster's centre (members
   pulled in), so groups read as groups on a phone screen. Coordinates fit in -1..1.
4. One fast-model call labels every cluster with 2–4 words from its members' tags and
   key ideas. Without the model, over budget, or on a bad answer, a cluster is
   labelled with its most common tag.
"""

from __future__ import annotations

import json
import math
import random
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from operator import mul
from typing import Any

from .rules import InsightError

SEED = 7
MAX_K = 12
PULL = 0.45  # how far members are pulled toward their cluster centre (0 = PCA as is, 1 = all on the centre)

Vec = list[float]

try:  # Python 3.12+: a C loop
    _dot = math.sumprod  # type: ignore[attr-defined]
except AttributeError:  # pragma: no cover - 3.11
    def _dot(a: Vec, b: Vec) -> float:
        return sum(map(mul, a, b))


@dataclass
class Layout:
    ids: list[str]
    xy: list[list[float]]       # n x 2, in -1..1
    labels: list[int]           # cluster index per save
    centers: list[list[float]]  # k x 2, in -1..1
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


def _mean(rows: list[Vec]) -> Vec:
    n = len(rows)
    return [sum(col) / n for col in zip(*rows)]


def _kmeans(x: list[Vec], k: int, rng: random.Random, iters: int = 60) -> list[int]:
    n = len(x)
    if k <= 1:
        return [0] * n
    xx = [_dot(v, v) for v in x]

    def dist_to(c: Vec) -> list[float]:
        cc = _dot(c, c)
        return [max(0.0, xx[i] - 2 * _dot(x[i], c) + cc) for i in range(n)]

    # k-means++ seeding
    centers = [list(x[rng.randrange(n)])]
    d2 = dist_to(centers[0])
    for _ in range(1, k):
        total = sum(d2)
        if total <= 0:
            centers.append(list(x[rng.randrange(n)]))
        else:
            r, acc, pick = rng.random() * total, 0.0, n - 1
            for i, d in enumerate(d2):
                acc += d
                if acc >= r:
                    pick = i
                    break
            centers.append(list(x[pick]))
        d2 = [min(a, b) for a, b in zip(d2, dist_to(centers[-1]))]

    labels = [0] * n
    for it in range(iters):
        dists = [dist_to(c) for c in centers]           # k x n
        new = [min(range(k), key=lambda j: dists[j][i]) for i in range(n)]
        if it and new == labels:
            break
        labels = new
        nearest = [dists[labels[i]][i] for i in range(n)]
        for j in range(k):
            members = [x[i] for i in range(n) if labels[i] == j]
            # An empty cluster takes the point farthest from its centre.
            centers[j] = _mean(members) if members else list(x[max(range(n), key=nearest.__getitem__)])
    return _renumber(labels)


def _renumber(labels: list[int]) -> list[int]:
    """Clusters numbered by size (largest = 0), ties by first member: stable ids for the same data."""
    counts = Counter(labels)
    first = {lab: labels.index(lab) for lab in counts}
    order = sorted(counts, key=lambda lab: (-counts[lab], first[lab]))
    mapping = {old: new for new, old in enumerate(order)}
    return [mapping[lab] for lab in labels]


def _pca2(x: list[Vec], rng: random.Random, iters: int = 80) -> list[list[float]]:
    """The two main directions by power iteration on the centred data (never builds a d x d matrix)."""
    n = len(x)
    if n == 1:
        return [[0.0, 0.0]]
    mean = _mean(x)
    rows = [[a - m for a, m in zip(v, mean)] for v in x]
    cols = [list(c) for c in zip(*rows)]
    d = len(cols)
    comps: list[Vec] = []
    for _ in range(2):
        v = [rng.uniform(-1, 1) for _ in range(d)]
        for _ in range(iters):
            for c in comps:  # stay orthogonal to the directions already found
                proj = _dot(v, c)
                v = [a - proj * b for a, b in zip(v, c)]
            u = [_dot(r, v) for r in rows]
            w = [_dot(col, u) for col in cols]
            norm = math.sqrt(_dot(w, w))
            if norm < 1e-12:
                w = [0.0] * d
                break
            w = [a / norm for a in w]
            done = 1 - abs(_dot(w, v) / (math.sqrt(_dot(v, v)) or 1.0)) < 1e-10
            v = w
            if done:
                break
        else:
            w = v
        # Signs are arbitrary: make the largest loading of each component positive.
        if w and w[max(range(d), key=lambda i: abs(w[i]))] < 0:
            w = [-a for a in w]
        comps.append(w)
    return [[_dot(r, comps[0]), _dot(r, comps[1])] for r in rows]


def layout(ids: list[str], vectors: list[list[float]], seed: int = SEED) -> Layout:
    if not ids:
        return Layout([], [], [], [], [])
    x = []
    for v in vectors:
        norm = math.sqrt(_dot(v, v)) or 1.0
        x.append([a / norm for a in v])
    rng = random.Random(seed)
    labels = _kmeans(x, choose_k(len(ids)), rng)
    p = _pca2(x, random.Random(seed))
    k = max(labels) + 1

    def centres(points: list[list[float]]) -> list[list[float]]:
        return [_mean([points[i] for i in range(len(points)) if labels[i] == j]) for j in range(k)]

    c = centres(p)
    xy = [[c[lab][0] + (pt[0] - c[lab][0]) * (1 - PULL), c[lab][1] + (pt[1] - c[lab][1]) * (1 - PULL)]
          for pt, lab in zip(p, labels)]
    scale = max((abs(a) for pt in xy for a in pt), default=0.0) or 1.0
    xy = [[pt[0] / scale * 0.92, pt[1] / scale * 0.92] for pt in xy]  # margin so dots and labels stay in view
    return Layout(ids, xy, labels, centres(xy), [labels.count(j) for j in range(k)])


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
    provider: str = ""


def label_clusters(cfg: Any, members: dict[int, list[dict[str, Any]]], allow_ai: bool) -> Labels:
    """One call for every cluster; missing or unusable labels fall back to the top tag."""
    fallback = fallback_labels(members)
    if not allow_ai or not cfg.has_ai or not members:
        return Labels(fallback)
    from . import ai  # lazy

    try:
        r = ai.structured(cfg, "fast", system=LABEL_SYSTEM, tool=LABEL_TOOL, content=label_prompt(members),
                          max_tokens=400, validate=lambda raw: normalize_labels(raw, list(members)))
    except InsightError as exc:
        tokens = getattr(exc, "tokens", (0, 0))
        return Labels(fallback, tokens[0], tokens[1], getattr(exc, "usd", 0.0), provider=getattr(exc, "provider", ""))
    except (ai.ProviderError, ai.NoProvider):  # the provider is down: tag labels, no spend
        return Labels(fallback)
    return Labels({c: r.value.get(c, fallback[c]) for c in members}, r.input_tokens, r.output_tokens, r.usd,
                  ai=True, provider=r.provider)


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
    for sid, c in zip(lay.ids, lay.labels):
        members.setdefault(int(c), []).append(ins.get(sid, {}))

    # Over budget: still lay out, with tag labels and no spend.
    labels = label_clusters(cfg, members, allow_ai=refused is None)
    if labels.input_tokens or labels.output_tokens:
        _log_usage(supa, [{"user_id": user_id, "kind": "galaxy", "provider": labels.provider or None,
                           "input_tokens": labels.input_tokens,
                           "output_tokens": labels.output_tokens, "usd": labels.usd}])

    supa.delete("galaxy_points", {"user_id": f"eq.{user_id}"})
    supa.delete("galaxy_clusters", {"user_id": f"eq.{user_id}"})
    if lay.ids:
        supa.insert("galaxy_points", [
            {"save_id": sid, "user_id": user_id, "x": round(float(x), 4), "y": round(float(y), 4), "cluster": int(c)}
            for sid, (x, y), c in zip(lay.ids, lay.xy, lay.labels)])
        supa.insert("galaxy_clusters", [
            {"user_id": user_id, "cluster": c, "label": labels.labels.get(c, f"Group {c + 1}"),
             "cx": round(float(lay.centers[c][0]), 4), "cy": round(float(lay.centers[c][1]), 4), "size": lay.sizes[c]}
            for c in range(len(lay.sizes))])
    # Last, so the phone (listening to this row) reloads a complete layout.
    supa.insert("galaxy_layouts", {"user_id": user_id, "built_at": started, "points": len(lay.ids)}, upsert_on="user_id")
    _finish_job(supa, job, "done")
    return "galaxy"
