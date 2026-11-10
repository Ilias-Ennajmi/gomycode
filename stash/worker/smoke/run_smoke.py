"""Local smoke test of the whole chain, with no real service:

    phone (SQL as `authenticated`) → Postgres triggers queue a job → POST /run on the real worker app
    (uvicorn) with the Vault token → every call through the proxy routes (fake_supabase.py, real HTTP)
    → the real schema with all migrations → files in "Storage" → rows the app would read.

Needs a local Postgres with the Stash migrations (see worker/README.md, "Smoke test") and
`pip install -r requirements-dev.txt "psycopg[binary]"`.

    python smoke/run_smoke.py --dsn "host=/path/to/sock port=55447 user=postgres dbname=stash_w7" [--real-url URL]

Step 1 tries a real public link with the real network (expected to be refused on a machine
without internet: the save must still end `ready`). The later steps replace only the platform
(oEmbed + yt-dlp) with fixtures; everything else is the real code path.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
import psycopg
import uvicorn
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fake_supabase import make_app  # noqa: E402

from stash_worker import media, providers  # noqa: E402
from stash_worker.app import app as worker_app  # noqa: E402

OK, BAD = "  ok  ", " FAIL "
failures: list[str] = []


def check(label: str, cond: bool, detail: object = "") -> None:
    print(f"[{OK if cond else BAD}] {label}" + (f"  ({detail})" if detail != "" else ""))
    if not cond:
        failures.append(label)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve(app, port: int) -> None:
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            return
        except OSError:
            time.sleep(0.05)
    raise SystemExit("server did not start")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsn", required=True)
    ap.add_argument("--real-url", default="https://www.tiktok.com/@scout2015/video/6718335390845095173")
    args = ap.parse_args()

    os.environ.setdefault("NO_PROXY", "127.0.0.1,localhost")  # the local servers are reached directly
    storage = Path(tempfile.mkdtemp(prefix="stash-smoke-storage-"))
    supa_port, worker_port = free_port(), free_port()
    supa_url = f"http://127.0.0.1:{supa_port}"
    fake = make_app(args.dsn, storage, supa_url)
    serve(fake, supa_port)
    os.environ["SUPABASE_URL"] = supa_url
    serve(worker_app, worker_port)
    providers.Gemini.base = supa_url  # "Gemini" is the fake's /v1beta route
    worker = httpx.Client(base_url=f"http://127.0.0.1:{worker_port}", timeout=300, trust_env=False)

    db = psycopg.connect(args.dsn, row_factory=dict_row, autocommit=True)

    def q(text: str, *a):
        cur = db.execute(text, a)
        return cur.fetchall() if cur.description else []

    def one(text: str, *a):
        rows = q(text, *a)
        return rows[0] if rows else None

    # --- a clean identity: one owner device, one stranger -----------------------------------
    q("delete from auth.users where email like 'smoke-%%'")
    q("delete from stash.media_trash")
    q("delete from vault.secrets where name in ('stash_gemini_api_key', 'stash_owner_ids', 'stash_worker_url')")
    q("delete from stash.config where key like '%%_model'")
    owner = one("insert into auth.users (email) values ('smoke-owner') returning id")["id"]
    stranger = one("insert into auth.users (email) values ('smoke-stranger') returning id")["id"]
    q("select vault.create_secret(%s, 'stash_owner_ids')", str(owner))
    token = one("select decrypted_secret as t from vault.decrypted_secrets where name = 'stash_worker_token'")["t"]

    def as_phone(user, statement: str, *a):
        """Runs one statement the way the app would: role authenticated, the device's JWT claims."""
        with psycopg.connect(args.dsn, row_factory=dict_row) as conn:
            conn.execute("select set_config('request.jwt.claim.sub', %s, false), set_config('request.jwt.claim.role', 'authenticated', false)", (str(user),))
            conn.execute("set role authenticated")
            cur = conn.execute(statement, a)
            out = cur.fetchall() if cur.description else []
            conn.commit()
            return out

    def save(user, url: str, platform: str) -> str:
        return as_phone(user, "insert into stash.saves (source_url, platform) values (%s, %s) returning id", url, platform)[0]["id"]

    def run(expect: dict | None = None) -> dict:
        r = worker.post("/run", headers={"x-stash-worker-token": token})
        check(f"POST /run → 200 {r.text}", r.status_code == 200 and (expect is None or all(r.json()[k] == v for k, v in expect.items())))
        return r.json()

    def row(save_id) -> dict:
        return one("select * from stash.saves where id = %s", save_id)

    print("\n== 0. health and the token")
    h = worker.get("/health").json()
    check("GET /health", h["ok"] and h["supabase_url_set"] and h["yt_dlp"], h)
    check("GET /", worker.get("/").json() == {"ok": True, "supabase_url_set": True})
    check("POST /run without a token → 401", worker.post("/run").status_code == 401)
    check("POST /run with a wrong token → 401 (the proxy refused it)",
          worker.post("/run", headers={"x-stash-worker-token": "f" * 64}).status_code == 401)
    check("POST /run with a prefix of the token → 401",
          worker.post("/run", headers={"x-stash-worker-token": token[:40]}).status_code == 401)

    print(f"\n== 1. a real public link with the real network, no AI key: {args.real_url}")
    s1 = save(owner, args.real_url, "tiktok")
    check("the insert queued an ingest job", one("select count(*) n from stash.jobs where save_id = %s and state = 'queued'", s1)["n"] == 1)
    t0 = time.time()
    run({"done": 1, "failed": 0})
    r = row(s1)
    print(f"       took {time.time() - t0:.1f}s · title={r['title']!r} thumb={r['thumb_path']!r} video_state={r['video_state']} playback={r['playback']}")
    check("the save is ready", r["status"] == "ready" and r["process_step"] == "ready" and r["error"] is None)
    check("ai_state = no_key", r["ai_state"] == "no_key")
    check("playback is set (embed player from the id in the link)", r["playback"] in ("video", "embed") and (r["embed_url"] or "").startswith("https://www.tiktok.com/player/v1/"))
    real_download = r["video_state"] == "stored"
    real_metadata = bool(r["title"] and r["thumb_path"])
    print(f"       real metadata fetched: {real_metadata} · real video downloaded: {real_download}")

    # From here the platform is a fixture; the rest is the real code.
    clip = storage / "fixture.mp4"
    clip.write_bytes(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + os.urandom(300_000))
    order: list[str] = []
    real_update = None

    def fake_metadata(url, platform=None, get=None):
        order.append("metadata")
        platform = platform or media.detect_platform(url)
        if platform == "web":
            return media.Meta(title="Decoy pricing, explained", creator="The Pricing Blog", caption="Why three tiers sell.",
                              article="Decoy pricing, explained\nAdd a decoy tier so the middle plan looks like the deal.", found=True)
        return media.Meta(title="3 pricing tricks", creator="@chef", caption="3 pricing tricks that work #pricing",
                          thumb_url="https://cdn.example/thumb.jpg", embed_url=media.embed_url_for(platform, url), found=True)

    def fake_download(url, workdir, *, max_seconds, max_bytes, cookies_b64=""):
        order.append("download")
        out = Path(workdir) / "video.mp4"
        out.write_bytes(clip.read_bytes())
        return media.Download(out, out.stat().st_size, {"duration": 31.4, "description": "3 pricing tricks that work #pricing"})

    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new("RGB", (1080, 1920), (198, 255, 52)).save(buf, "JPEG")
    media.metadata, media.download = fake_metadata, fake_download
    media.fetch_image = lambda url, get=None: buf.getvalue()
    media.youtube_captions = lambda url, get=None: {"segments": [{"start": 0.0, "end": 4.0, "text": "Add a decoy tier so the middle plan looks like the deal."}],
                                                    "language": "en", "info": {"duration": 212, "description": "A talk about pricing."}}

    print("\n== 2. TikTok with the platform as a fixture, still no AI key")
    s2 = save(owner, "https://www.tiktok.com/@chef/video/7234567890123456789", "tiktok")
    fake.state.log.clear()
    run({"done": 1})
    r = row(s2)
    check("ready, ai_state = no_key", r["status"] == "ready" and r["ai_state"] == "no_key")
    check("title, creator, caption, duration", r["title"] == "3 pricing tricks" and r["creator_handle"] == "@chef" and float(r["duration_s"]) == 31.4)
    check("thumbnail in stash-thumbs (re-encoded JPEG ≤ 720 px)", (storage / "stash-thumbs" / f"{owner}/{s2}.jpg").exists())
    check("video stored: path, bytes, state, playback agree", r["video_path"] == f"{owner}/{s2}.mp4" and r["video_state"] == "stored"
          and r["playback"] == "video" and r["video_bytes"] == clip.stat().st_size == (storage / "stash-video" / r["video_path"]).stat().st_size)
    check("embed_url passed the database check", r["embed_url"] == "https://www.tiktok.com/player/v1/7234567890123456789")
    check("metadata came before the download", order[:2] == ["metadata", "download"], order)
    log = fake.state.log
    i_evict, i_sign = log.index(("POST", "/rest/rpc/evict_videos")), [i for i, c in enumerate(log) if c == ("POST", "/storage/sign-upload")]
    check("evict_videos ran before the video upload was signed", i_evict < i_sign[-1], f"evict at {i_evict}, sign at {i_sign}")
    check("an embedding was stored without any AI key", one("select model, array_length(vector, 1) n from stash.embeddings where save_id = %s", s2) == {"model": "gte-small", "n": 384})
    check("no insights yet", one("select count(*) n from stash.insights where save_id = %s", s2)["n"] == 0)

    print("\n== 3. the owner adds the one key; the sweep re-queues insights; nothing is downloaded again")
    q("select vault.create_secret('smoke-gemini-key', 'stash_gemini_api_key')")
    q("insert into stash.config (key, value) values ('gemini_fast_model', 'smoke-fast'), ('gemini_smart_model', 'smoke-smart') on conflict (key) do update set value = excluded.value")
    q("select stash.sweep()")
    queued = q("select save_id, payload from stash.jobs where state = 'queued' and type = 'reprocess'")
    check("sweep queued reprocess {mode: insights} for the no_key saves", {j["save_id"] for j in queued} == {s1, s2} and all(j["payload"] == {"mode": "insights"} for j in queued), len(queued))
    order.clear()
    run({"done": 2, "failed": 0})
    r = row(s2)
    check("ai_state = done, still ready, no platform call", r["ai_state"] == "done" and r["status"] == "ready" and order == [], order)
    ins = one("select title, key_idea, tags from stash.insights where save_id = %s", s2)
    check("insights filled through the Gemini REST path", ins and ins["key_idea"].startswith("Add a decoy tier") and ins["tags"] == ["pricing", "marketing"], ins)
    tr = one("select full_text, jsonb_array_length(segments) n from stash.transcripts where save_id = %s", s2)
    check("transcript from the stored MP4 (sent inline to the model)", tr and tr["n"] == 2 and any(c["media"] == ["video/mp4"] for c in fake.state.gemini_calls), tr)
    hl = q("select text, start_s, source from stash.highlights where save_id = %s", s2)
    check("one AI highlight: the line that is really in the transcript, with its time", len(hl) == 1 and float(hl[0]["start_s"]) == 3.2 and hl[0]["source"] == "ai", hl)
    check("a recall card", one("select count(*) n from stash.cards where save_id = %s", s2)["n"] == 1)
    used = {(u["kind"], u["provider"]) for u in q("select kind, provider from stash.usage where save_id = %s", s2)}
    check("usage rows carry the provider", {("transcribe", "gemini"), ("understand", "gemini"), ("embed", "supabase")} <= used, used)
    check("model ids came from stash.config", {c["model"] for c in fake.state.gemini_calls} == {"smoke-fast"})

    print("\n== 4. YouTube (embed only, captions), a web article, and a stranger's save")
    s3 = save(owner, "https://youtu.be/dQw4w9WgXcQ", "youtube")
    s4 = save(owner, "https://blog.example.com/decoy", "web")
    s5 = save(stranger, "https://www.tiktok.com/@chef/video/7234567890123456780", "tiktok")
    order.clear()
    run({"done": 3, "failed": 0})
    r3, r4, r5 = row(s3), row(s4), row(s5)
    check("youtube: embed player, no download, captions as transcript, insights", r3["playback"] == "embed" and r3["video_state"] == "none"
          and r3["embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" and r3["ai_state"] == "done" and float(r3["duration_s"]) == 212)
    check("web: link, article text in transcripts, insights", r4["playback"] == "link" and r4["embed_url"] is None and r4["ai_state"] == "done"
          and one("select full_text from stash.transcripts where save_id = %s", s4)["full_text"].startswith("Decoy pricing, explained"))
    check("stranger: ready with title and embed, not_owner, no video, no AI", r5["status"] == "ready" and r5["ai_state"] == "not_owner"
          and r5["video_state"] == "none" and r5["playback"] == "embed" and r5["title"] and order.count("download") == 0, order)

    print("\n== 5. ask")
    ask_id = as_phone(owner, "insert into stash.asks (question) values ('How should I price my plans? decoy tier') returning id")[0]["id"]
    forged = as_phone(stranger, "insert into stash.asks (question) values ('decoy tier pricing') returning id")[0]["id"]
    run()
    a = one("select * from stash.asks where id = %s", ask_id)
    ready_ids = {x["id"] for x in q("select id from stash.saves where user_id = %s", owner)}
    check("answer with citations from the owner's own saves", a["status"] == "ready" and a["answer"].startswith("Add a decoy tier")
          and len(a["cited_save_ids"]) == 1 and set(a["cited_save_ids"]) <= ready_ids, a["cited_save_ids"])
    f = one("select status, error, answer from stash.asks where id = %s", forged)
    check("a stranger's question gets no AI answer", f["status"] in ("failed", "ready") and (f["error"] == "not_owner" or f["answer"] == "Nothing in your saves about that yet."), f)

    print("\n== 6. weekly backup, retention")
    for d in ("2026-01-04", "2026-01-11", "2026-01-18", "2026-01-25", "2026-02-01"):
        q("insert into stash.backups (user_id, path, created_at) values (%s, %s, %s)", owner, f"{owner}/backups/{d}.json", f"{d}T04:41:00Z")
    check("queue_backups() queued one job for the owner", one("select stash.queue_backups() as n")["n"] == 1)
    out = run({"failed": 0})
    backups = q("select path, bytes, saves from stash.backups where user_id = %s order by created_at desc", owner)
    check("4 backups kept, newest is today's", len(backups) == 4 and backups[0]["saves"] == 4, [b["path"][-15:] for b in backups])
    doc = json.loads((storage / "stash-exports" / backups[0]["path"]).read_text())
    check("the file holds the owner's tables", doc["version"] == 1 and len(doc["tables"]["saves"]) == 4 and len(doc["tables"]["asks"]) == 1
          and str(stranger) not in json.dumps(doc), sorted(doc["tables"]))
    check("the two old backup files were queued and removed in the same run", out["trashed"] == 2, out)

    print("\n== 7. retention: a full bucket evicts the oldest video before the next upload")
    q("update stash.config set value = '50' where key = 'video_cap_mb'")
    q("update stash.saves set video_bytes = 53000000 where id = %s", s2)  # pretend it is 53 MB
    s6 = save(owner, "https://www.tiktok.com/@chef/video/7234567890123456781", "tiktok")
    run({"done": 1})
    r2, r6 = row(s2), row(s6)
    check("the old save fell back to its embed player", r2["video_state"] == "evicted" and r2["video_path"] is None and r2["playback"] == "embed")
    check("the new save has its video", r6["video_state"] == "stored" and r6["playback"] == "video")

    print("\n== 8. deleting a save removes its files (media_trash → /storage/remove)")
    as_phone(owner, "delete from stash.saves where id = %s", s6)
    pending = one("select count(*) n from stash.media_trash")["n"]
    out = run()
    check("trash emptied", out["trashed"] == pending and one("select count(*) n from stash.media_trash")["n"] == 0, out)
    check("the files are gone", not (storage / "stash-video" / f"{owner}/{s6}.mp4").exists() and not (storage / "stash-video" / f"{owner}/{s2}.mp4").exists())

    print("\n== result")
    print(f"real network from this machine: metadata {'worked' if real_metadata else 'was refused'}, video download {'worked' if real_download else 'was refused'}")
    print("FAILED: " + "; ".join(failures) if failures else "all checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
