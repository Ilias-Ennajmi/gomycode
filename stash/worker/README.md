# Stash worker

Turns a shared link into something you can watch and search:
download (yt-dlp) → 720p MP4 (ffmpeg) → video to Cloudflare R2, thumbnail to Supabase Storage →
transcript (Groq) → key idea, takeaways, tags, places, recall cards (Claude) → filed into a Space →
embedding for search (Voyage).

It runs on Google Cloud Run and sleeps when idle. Supabase wakes it: a new job calls `POST /run`
through `pg_net`, and a `pg_cron` sweep calls it every minute for anything left behind.

Each step degrades gracefully, so the app keeps working while keys are missing:

| Missing | What happens |
| --- | --- |
| R2 keys | Video plays from the original post (embed); thumbnail and AI still work |
| `ANTHROPIC_API_KEY` / `CLAUDE_FAST_MODEL` | Save is ready with caption + thumbnail, no summary |
| `GROQ_API_KEY` | No transcript; the AI reads the caption only |
| `VOYAGE_API_KEY` | Search by words only, no "related saves" |
| `OWNER_USER_IDS` | Nothing is processed (strangers can't spend your budget) |

## Environment

| Variable | Where it comes from |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys (secret) |
| `WORKER_SECRET` | Any long random string; also stored in Supabase Vault (below) |
| `OWNER_USER_IDS` | Stash → You → "Device id" on your phone (comma-separate several devices) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `CLAUDE_FAST_MODEL` | The model id you choose for per-save processing |
| `CLAUDE_FAST_USD_PER_MTOK_IN` / `_OUT` | That model's price per million tokens (cost guard; default 1 / 5) |
| `GROQ_API_KEY` | console.groq.com (free tier) |
| `VOYAGE_API_KEY` | dash.voyageai.com (free tokens) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare → R2 (below) |
| `INSTAGRAM_COOKIES_B64` | Optional. Only if Instagram starts refusing downloads: a Netscape cookies.txt, base64-encoded |

## Set up (once)

1. **Cloudflare R2:** create a bucket `stash-videos` (keep it private). R2 → Manage API tokens →
   *Create API token* with *Object Read & Write* on that bucket. Note the account id, access key id
   and secret. The same four values go into Vercel too, so the app can play the videos.
2. **Google Cloud:** create a project with billing on (Cloud Run's free tier covers this app),
   then from the repo root:

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   cp stash/worker/env.example.yaml stash/worker/env.yaml   # fill it in; it's git-ignored
   gcloud run deploy stash-worker --source stash/worker --region europe-southwest1 \
     --allow-unauthenticated --concurrency 1 --max-instances 2 --timeout 900 \
     --cpu 1 --memory 2Gi --env-vars-file stash/worker/env.yaml
   ```

   `--allow-unauthenticated` is needed so Supabase can call it; every call must carry
   `WORKER_SECRET`, otherwise it gets 401.
3. **Supabase Vault** (SQL editor), with the URL Cloud Run printed and the same secret:

   ```sql
   select vault.create_secret('https://stash-worker-xxxx.run.app', 'stash_worker_url');
   select vault.create_secret('<WORKER_SECRET>', 'stash_worker_secret');
   ```

4. Open `https://<worker-url>/` — it lists which features are configured (never their values).

Rebuild every few weeks (`gcloud run deploy …` again) so yt-dlp keeps up with Instagram and TikTok.

## Develop

```bash
cd stash/worker
pip install -r requirements.txt pytest
python -m pytest            # rules, ffmpeg steps and the job flow (no network)
python -m stash_worker      # process the queue once, using the env vars above
```
