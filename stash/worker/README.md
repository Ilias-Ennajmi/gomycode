# Stash worker

Turns a shared link into something you can watch and search:
download (yt-dlp) → 720p MP4 (ffmpeg) → video and thumbnail to Supabase Storage →
transcript (Groq Whisper) → key idea, takeaways, tags, places, recall cards (Groq) → filed into a Space →
embedding for search by meaning (Voyage, optional).

**Everything is free, with no card anywhere:** it runs on GitHub Actions (free minutes for a public
repository), stores videos in the Supabase free tier, and uses Groq's free tier for the AI.

How it starts: when a save is queued, the database calls GitHub's API (`stash.wake_worker`, through
`pg_net`) to start the **Stash worker** workflow (`.github/workflows/stash-worker.yml`). The run
works through the queue and exits. A `pg_cron` sweep every minute restarts anything left behind (at
most every 3 minutes, never while a run is busy).

Each step degrades gracefully, so the app keeps working while something is missing:

| Missing | What happens |
| --- | --- |
| A stored video (too big, or cleared to stay under the quota) | It plays from the original post (embed) |
| Groq key or summary model | Save is ready with caption + thumbnail, no transcript or summary |
| Voyage key | Search by words only, no "related saves" |
| Owner ids | Nothing is processed (strangers can't use your free quota) |
| Groq's daily limit reached | The save waits and is retried 20 minutes later |

## Where the settings live

GitHub holds **one** secret; everything else sits in Supabase Vault and the worker reads it with
`stash.worker_config()` (service key only).

| Setting | Where |
| --- | --- |
| `STASH_SUPABASE_SERVICE_ROLE_KEY` | GitHub → repo Settings → Secrets and variables → Actions. Value: Supabase → Project Settings → API keys → legacy `service_role` |
| `stash_groq_api_key` | Vault. console.groq.com → API Keys (free) |
| `stash_groq_insights_model` | Vault. The Groq model id that writes summaries (it must support tool calling) |
| `stash_owner_user_ids` | Vault. Stash → You → "Device id" on your phone (comma-separate several devices) |
| `stash_voyage_api_key` | Vault, optional. dash.voyageai.com. Also set `VOYAGE_API_KEY` in Vercel for search |
| `stash_instagram_cookies_b64` | Vault, optional. Only if Instagram starts refusing downloads: a Netscape cookies.txt, base64-encoded |
| `stash_worker_url` | Vault. `https://api.github.com/repos/Ilias-Ennajmi/gomycode/actions/workflows/stash-worker.yml/dispatches` |
| `stash_worker_secret` | Vault. A fine-grained GitHub token: this repository only, permission **Actions: Read and write** |

Add a Vault value in the Supabase SQL editor:

```sql
select vault.create_secret('<value>', 'stash_groq_api_key');
-- change one later:
select vault.update_secret((select id from vault.secrets where name = 'stash_groq_api_key'), '<new value>');
```

Optional tuning through the workflow's `env`: `VIDEO_QUOTA_MB` (default 800 of the free 1 GB),
`VIDEO_MAX_MB` (45; longer videos aren't copied), `MAX_VIDEO_SECONDS` (600), `RUN_BUDGET_SECONDS`.
When the quota is reached, archived videos are cleared first, then watched ones, oldest first; Kept
saves go last.

## Check it

- GitHub → Actions → **Stash worker** → *Run workflow* starts a run by hand. Its log prints which
  features are on (never their values) and a summary such as `{"ready": 2}`.
- Supabase: `select state, error, count(*) from stash.jobs group by 1, 2;`

## Develop

```bash
cd stash/worker
pip install -r requirements.txt pytest
python -m pytest            # rules, ffmpeg steps and the job flow (no network)
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python -m stash_worker   # process the queue once
```

`app.py` + `Dockerfile` remain for hosting it as an HTTP service instead (then `stash_worker_url` is
that service's URL and `stash_worker_secret` its `WORKER_SECRET`).
