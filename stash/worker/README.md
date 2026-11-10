# Stash worker

Turns a saved link into a title, a thumbnail, a video (or an embed player), a transcript, insights
and an embedding. Also answers questions, grades recall answers, writes syntheses, exports,
the Galaxy layout and a weekly backup. Contract: `docs/CONTRACT_0007.md`.

It costs nothing to run and holds **no secret**:

```
Postgres (trigger / cron) ──POST /run + x-stash-worker-token──► this worker (one Vercel function, 300 s)
                                                                    │ every Supabase call
                                                                    ▼
                                      Edge Function stash-worker-proxy (has the service key natively)
```

The worker's only setting is `SUPABASE_URL` (not secret). The token arrives with each wake-up, is
shown to the proxy, and lives in memory for that request. API keys and model ids come from
`worker_config()` (Vault + `stash.config`) through the proxy. Nothing is read from a file.

## What is in here

| path | what |
|---|---|
| `api/index.py`, `vercel.json` | Vercel entry: every path is rewritten to the one function; `maxDuration` 300, `fluid` on |
| `requirements.txt` | what Vercel installs: about **66 MB** unpacked (limit 250). No ffmpeg, numpy, cloud or AI SDKs |
| `stash_worker/app.py` | `GET /`, `GET /health`, `POST /run` |
| `stash_worker/proxy.py` | the client for `stash-worker-proxy` (replaces direct Supabase access) |
| `stash_worker/providers.py`, `ai.py` | Gemini, Claude, Groq over plain HTTPS behind one seam; prompts and schemas |
| `stash_worker/media.py` | oEmbed / Open Graph metadata, the embed players, yt-dlp (one progressive MP4), captions, article text, the guarded fetch |
| `stash_worker/pipeline.py` | the run loop and the ingest / reprocess / grade / synthesize jobs |
| `stash_worker/deadline.py` | how long this run may still take; read by every slow step (see "Time limit" below) |
| `stash_worker/ask.py`, `backup.py`, `exports.py`, `galaxy.py`, `geocode.py` | the other jobs |
| `tests/` | `pytest` (247 tests, no network) |
| `smoke/` | a local end-to-end run against a real Postgres with the migrations (not deployed) |
| `../supabase/functions/` | the three Edge Functions and their Deno tests |

## Deploy (orchestrator)

Order matters: database, functions, worker, then the SQL that points the database at the worker.

### 1. Database

Apply `supabase/migrations/0007_free_pipeline.sql` (after 0001–0006).

### 2. Edge Functions

From `stash/` (`supabase link --project-ref <ref>` once):

```bash
supabase functions deploy stash-worker-proxy --no-verify-jwt
supabase functions deploy stash-embed
supabase functions deploy stash-recovery --no-verify-jwt
```

| function | verify_jwt | why |
|---|---|---|
| `stash-worker-proxy` | **false** | the worker has no JWT; the function checks the wake-up token on every request |
| `stash-embed` | **true** | called by the signed-in phone |
| `stash-recovery` | **false** | `restore` comes from a phone with no session; `create` checks the JWT itself |

The same values are in `supabase/config.toml`. With the Supabase MCP `deploy_edge_function`, pass the
same `verify_jwt` and include the files under `supabase/functions/_shared/` that each function imports
(`http.ts`, `clients.ts`, `embed.ts`, `auth.ts`, `proxy_rules.ts`, `recovery_code.ts`) plus the
function's own `index.ts` and `handler.ts`. No function secret has to be set: `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

Project settings the recovery flow relies on (Dashboard → Authentication):

- Sign-in providers → **Email: enabled** (it is by default). Recovery signs in with a synthetic
  email and a password derived from the code. No mail is ever sent.
- Password requirements at the default (minimum length ≤ 43, no "symbols required" rule): the derived
  password is 43 characters of `A–Z a–z 0–9 - _`.
- Anonymous sign-ins stay enabled (the app's normal identity).

### 3. Vercel project

| setting | value |
|---|---|
| Root Directory | `stash/worker` |
| Framework Preset | **Other** (`vercel.json` also says `"framework": null`) |
| Build / Output / Install commands | leave empty (Vercel installs `requirements.txt` itself) |
| Environment variables | `SUPABASE_URL` = `https://<project-ref>.supabase.co` — the only one, not secret |
| Python | 3.12 (`.python-version`) |
| Function max duration | 300 s (`maxDuration` in `vercel.json`), which needs **Fluid compute**: `vercel.json` sets `"fluid": true`, so it does not depend on the project's setting. See "Time limit" below |
| Deployment Protection | must not cover the production domain (the default "Standard Protection" does not) |

Check: `curl https://<worker>.vercel.app/health` → `{"ok":true,"supabase_url_set":true,"python":"3.12.x","yt_dlp":"…"}`
and `curl -X POST https://<worker>.vercel.app/run` → `401`.

### 4. Point the database at the worker and set the config rows (SQL editor)

```sql
-- where the wake-ups go (base URL, no path). Wake-ups are skipped until this exists.
select vault.create_secret('https://<worker>.vercel.app', 'stash_worker_url');

-- who may use AI and video storage: the device id shown in Settings → Processing (comma-separated)
select vault.create_secret('<device uuid>[,<device uuid>…]', 'stash_owner_ids');
-- (if the secret already exists: select vault.update_secret(id, '<ids>') from vault.secrets where name = 'stash_owner_ids';)

-- model ids live here and only here. Take the current ids from the provider's model list.
insert into stash.config (key, value) values
  ('gemini_fast_model',  '<fast model id>'),    -- understand, vision, transcription, grade, ask
  ('gemini_smart_model', '<smart model id>')    -- synthesize, export text (optional: falls back to fast)
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Optional rows, same statement shape: `claude_fast_model`, `claude_smart_model`, `groq_transcribe_model`
(each provider also needs its Vault key), `ai_provider`, `transcribe_provider`, `youtube_download` (`on`),
`video_cap_mb`, `video_max_mb`, `max_video_seconds`, `backup_keep`, `run_budget_seconds`, `geocode` (`off`),
and prices for the cost guard in USD per million tokens: `price_<gemini|claude>_<fast|smart>_<in|out>`
(no row = 0, right for a free tier), `price_groq_audio_hour`.

A provider is used only when its key **and** its model id exist. Until then saves end `ready` with
`ai_state = 'no_key'`, and the minute sweep fills their insights once both are there.

### 5. The owner's one step

Supabase Dashboard → Project Settings → Vault → **New secret**: name `stash_gemini_api_key`, value the
Google AI Studio key. (Or `select vault.create_secret('<key>', 'stash_gemini_api_key');`.)

### 6. Keep-alive

`.github/workflows/stash-keepalive.yml` (repo root) calls the public RPC `stash.vapid_public_key()` twice a
week. Set two repository **variables** (Settings → Secrets and variables → Actions → Variables):
`STASH_SUPABASE_URL` and `STASH_SUPABASE_PUBLISHABLE_KEY`. Both are public values, and none is committed
in this repository, which is why they are variables. Unset → the job warns and does nothing.

### 7. After deploying: acceptance checks to run on the live project

```bash
# proxy: wrong token
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/functions/v1/stash-worker-proxy/config" -H 'x-stash-worker-token: 0000000000000000000000000000000000000000' # 401
# embed: 384 numbers (ACCESS = a device session token)
curl -s -X POST "$SUPABASE_URL/functions/v1/stash-embed" -H "Authorization: Bearer $ACCESS" -H "apikey: $ANON" -H 'content-type: application/json' -d '{"input":"pricing"}' | head -c 120
```

Then save one TikTok link in the app before the key is added (expect: title and thumbnail within
seconds, `ready`, `ai_state = no_key`), add the key, and wait a minute or two for the insights.

## Time limit

Vercel stops a function at its maximum duration without warning. What the Vercel documentation says
(checked through the Vercel documentation search, November 2026):

- `maxDuration` for a Python function is set in `vercel.json` under `functions`, keyed by the entry file.
- Fluid compute is on by default for projects created since 23 April 2025, and `"fluid": true` in
  `vercel.json` turns it on for a deployment whatever the project setting says.
- **Not confirmed from the documentation here:** the per-plan numbers. The limits page itself could not be
  opened from the build machine and the search index returned only configuration examples. The design
  assumes what Vercel has published for Hobby: 300 s (default and maximum) with Fluid compute, 60 s at
  most without it. **Check at the first deploy:** if Vercel refuses `maxDuration: 300` for the plan, the
  deploy is refused with a message about the allowed duration. Then put the allowed number in `vercel.json` and
  in the config row `worker_max_seconds` (same value in both), nothing else changes:
  `insert into stash.config (key, value) values ('worker_max_seconds', '60') on conflict (key) do update set value = excluded.value;`

How the worker stays inside it (all in `deadline.py`, set once per `/run`):

| | |
|---|---|
| deadline | `worker_max_seconds` − 15 s (285 s by default: `HARD_LIMIT_S`) |
| new job claimed | only with ≥ 90 s left (and inside `run_budget_seconds`) |
| video download | started only with ≥ 60 s left; yt-dlp is cancelled from its progress hook with < 25 s left |
| transcription | started only with ≥ 60 s left; insights only with ≥ 40 s left |
| provider calls, Storage `PUT` | timeouts cut to the time left; no retry that could not finish |

A step skipped for time, or refused by a busy provider (HTTP 429 / 503 / 529), sets
`ai_state = 'retry'`: the save still ends `ready`, and the minute sweep queues
`reprocess {"mode":"insights"}` for it (10 minutes apart, at most 8 tries a day). If the function is
killed anyway, the sweep frees the job after 7 minutes; after four such timeouts it fails the job and
the save (`Processing timed out. Tap Retry.`) instead of leaving it in `processing`.

## What yt-dlp and the guarded fetch may reach

- A platform is recognised by its exact host or a subdomain (`instagram.com`, `instagr.am`,
  `tiktok.com`, `youtube.com`, `youtu.be`), never by a name that merely ends the same way.
- yt-dlp is started only for an `https` address on such a host. YouTube is rebuilt from the video id
  (`https://www.youtube.com/watch?v=<id>`), with `noplaylist` and `playlist_items: "1"`. Each call
  passes `allowed_extractors` with that platform's extractor only, so the generic extractor (which
  would fetch any address) is not loaded at all.
- `safe_get` resolves a name once, refuses it unless every address is public, and connects to that
  address (the name stays in `Host` and as the TLS server name, so the certificate is still checked
  against it). A DNS answer that changes between the check and the connection cannot redirect it.
- Thumbnails over 40 megapixels are refused from the image header, before decoding.

## Routes

| | |
|---|---|
| `GET /` | `{"ok": true, "supabase_url_set": bool}` |
| `GET /health` | the same plus `python` and `yt_dlp` versions. Works with nothing configured; no secret, no outbound call |
| `POST /run` | header `x-stash-worker-token`. Missing or shorter than 32 → `401`; the proxy refusing it → `401`; no `SUPABASE_URL` → `503`; proxy unreachable → `502`. Answers `{"done", "failed", "requeued", "trashed"}` |

## Tests

```bash
cd stash/worker
python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
pytest                       # 247 tests, no network (a real HTTP call fails the test)

cd ../supabase/functions     # Edge Functions: type-check and tests
DENO_NO_PACKAGE_JSON=1 deno check stash-worker-proxy/index.ts stash-embed/index.ts stash-recovery/index.ts
DENO_NO_PACKAGE_JSON=1 deno test _tests
```

`DENO_NO_PACKAGE_JSON=1` is required: without it Deno finds the app's `package.json` one level up,
expects the imports in its `node_modules` and fails with "Could not find a matching package".

`tests/test_proxy_app.py` compares the document colours in `render.py` with the light theme in
`styles/tokens.css` and fails when they drift.

### Smoke test (local, no real service)

`smoke/run_smoke.py` starts the real worker app and a stand-in for Supabase (`smoke/fake_supabase.py`:
the proxy's routes over real HTTP, backed by a local Postgres with every migration applied, a folder
as Storage, and a tiny Gemini). It inserts saves and asks as the phone would, calls `/run` with the
Vault token, and checks the rows.

```bash
pip install -r requirements-dev.txt "psycopg[binary]"
python smoke/run_smoke.py --dsn "host=<socket dir> port=<port> user=postgres dbname=<db with the migrations>"
```

The database needs the stubs the architect's scripts use for `auth`, `vault`, `cron`, `net`, `storage`
and `extensions.vector`. Step 1 tries a real public link over the real network; the later steps
replace only the platform (oEmbed + yt-dlp) with fixtures.

## Notes for docs/PROGRESS.md (0007, worker and backend)

Done:

- Worker packaged for Vercel's Python runtime. Dependencies measured with `pip install -t`: 66 MB
  (pillow 21, yt-dlp 12, lxml 12, pydantic 9, reportlab 6). ffmpeg, numpy, boto3 and the AI SDKs are gone.
- Galaxy is plain Python now (k-means + PCA by power iteration): 300 saves in 0.8 s, 2 000 in 9 s on
  Python 3.11; faster on 3.12 (`math.sumprod`). Same k, same labels-by-size, deterministic.
- All Supabase access goes through `stash-worker-proxy`; files go straight to Storage with signed URLs.
- Providers: Gemini (understand, vision, transcription from the MP4 or a voice note, a YouTube URL
  watched directly when there are no captions, grade, synthesize, ask, brief), Claude (text and
  vision), Groq (transcription). REST only. One retry on an unusable answer; retries on 429/5xx.
- Ingest per the contract. Extras: Gemini also describes what a video shows (helps music-only reels);
  the thumbnail is re-encoded to a ≤ 720 px JPEG; AI highlights are kept only when the quoted line
  really is in the transcript, caption or article; the platform is read from the address, not the row.
- Jobs: ingest, reprocess (full and `{"mode":"insights"}`), grade, synthesize (Space and tag), export,
  galaxy, ask, backup, trash (50 per run).
- Edge Functions with Deno tests (24) for the allowlist, the token check, rate limits and the code
  derivation.
- Smoke run against a real Postgres with all migrations: all checks pass.
- Review fixes (see "Time limit" and "What yt-dlp and the guarded fetch may reach" above): the run
  deadline and `ai_state = 'retry'`; strict platform hosts and one extractor per platform; the fetch
  pinned to the checked address; the 40-megapixel cap; `stash-recovery` `create` answers with a fresh
  session; restore is limited by `cf-connecting-ip` / the last forwarded hop and by a global bucket
  (600 an hour); `stash-embed` has a global bucket (3000 a minute); the proxy refuses any `select`
  with a double quote.

Decisions and deviations from the contract (each small; say if you want it the other way):

1. yt-dlp format is `best[ext=mp4][vcodec!=?none][acodec!=?none]` (with `?`). Measured: the contract's
   `!=` refuses a direct MP4 whose codecs are not announced ("Requested format is not available").
   Still one file, no merge. Sort `vcodec:h264, res:720` keeps files small and playable everywhere.
2. `stash-worker-proxy` answers `OPTIONS` with 204 and **no** CORS headers (nothing in a browser calls
   it). `stash-embed` and `stash-recovery` send the contract's CORS headers.
3. The proxy also checks embedded resources in `select` (`saves?select=*,config(*)` → 403). Without it
   the table allowlist could be read around.
4. `stash-embed` verifies the token inside the function too (`auth.getClaims`, falling back to
   `getUser`) and refuses anon / service keys, so a wrong `verify_jwt` setting cannot open it.
5. Ask: not an owner → `failed` with `error = 'not_owner'`; over budget → `'over_budget'`; provider
   error → `'ai_error'`. `'no_ai'` is only "no key / model id", as the contract says.
6. A save with nothing to read at all (no caption, title, transcript) gets `ai_state = 'failed'`
   instead of asking a model to invent a summary.
7. Storage trouble while uploading the video → `video_state = 'none'` (embed or link), not `blocked`:
   the platform did not refuse it. The save still ends `ready`.
8. The article's title is put on the first line of `transcripts.full_text` ("title + main text").
9. `worker/pyproject.toml` became `pytest.ini`, so Vercel cannot mistake it for the dependency list.
10. Dead links: YouTube is dead on oEmbed 404/410 alone (its watch page answers 200 for removed
    videos). TikTok: oEmbed 400/404/410 **and** the page 404/410. Instagram and web: the page.

Not verified from this machine (no route to these hosts here):

- A real Vercel deploy (the layout follows the current docs: `api/index.py` with an `app`, `functions`
  keyed by that file, `framework: null`).
- Real TikTok / Instagram / YouTube fetches: oEmbed, yt-dlp from a Vercel address, YouTube captions.
  Expect Instagram and YouTube to refuse datacentre addresses often; that path ends in the embed
  player and caption-only insights by design.
- The real Gemini, Claude and Groq APIs (request shapes follow their REST documentation and are
  pinned by tests; if Gemini rejects the response schema the call is repeated without it).
- `Supabase.ai.Session('gte-small')` and Storage signed uploads on the hosted project (the code
  follows the current Supabase docs: `createSignedUploadUrl(path, {upsert: true})`, then `PUT` with
  `Content-Type` and `x-upsert`).
- Recovery on a real project. The docs say `auth.admin.updateUserById` applies changes directly with
  no confirmation flow and accepts `email`, `password`, `email_confirm`; they do not say what it does
  to an **anonymous** user. Check once after deploy: `create`, then `restore` in a clean browser
  profile returns the same `user_id`. If Auth refuses the `.invalid` address the function answers
  `500 auth_update_failed` (and logs the Auth error code); the domain is one constant in
  `supabase/functions/_shared/recovery_code.ts`.
- `gte-small` is trained on English text; French and Arabic queries will match less well by meaning
  (word search is unaffected).

Migration notes:

- Tag syntheses are now also considered when insights arrive late (trigger `on_insights_tags`).
- `sweep()` re-queues `no_key` / `retry` saves 5 at a time per minute; with a large backlog that is
  slow but safe.
- Making or rotating a recovery code signs the owner's other phones out (Auth ends a user's sessions
  when the password changes). The phone that made the code gets a new session in the same answer.
