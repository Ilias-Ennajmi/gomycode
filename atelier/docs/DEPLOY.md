# Deploying Atelier

Owner-run steps. Nothing here has been executed: no agent applies a migration, creates a bucket or a Vercel project without
the owner's go-ahead. Do the steps in order; each one says how to check that it worked.

| Piece | Where | Cost to start |
|---|---|---|
| Web app | Vercel project `atelier`, root directory `atelier/` | Hobby (free) |
| Database and sign-in | Existing Supabase project `rvbllpkhwakjuahxyfff`, schema `atelier` | existing plan |
| Images | Cloudflare R2 bucket `atelier-assets` | free tier (10 GB) |

**Vercel Hobby is for non-commercial use only.** The day Atelier is used for paid client work, move the project to Vercel Pro
(about $20 a month). Nothing in the app has to change.

## 1. Database

1. Open `supabase/migrations/0001_atelier_init.sql` and read it. It creates the schema `atelier` (folders, boards, board
   updates and snapshots, assets, error log) and turns on row-level security with an owner-only policy on every table.
2. Apply it to project `rvbllpkhwakjuahxyfff`, either:
   - with the Supabase MCP tool `apply_migration` (name `0001_atelier_init`, body = the file), or
   - with the CLI: `supabase link --project-ref rvbllpkhwakjuahxyfff` then `supabase db push`.
3. **Expose the schema to the API:** Dashboard, Project Settings, API, "Exposed schemas": add `atelier` and save. Without
   this the app gets "schema must be one of ..." errors on every call.
4. Check: in the SQL editor, `select count(*) from atelier.boards;` returns `0`, and `select * from atelier.boards;` run as the
   `anon` role returns no rows (the RLS tests in `scripts/test-rls.sh` check the same on every CI run).

Migrations only move forward. To undo one, restore from a Supabase backup.

## 2. The owner account

1. Dashboard, Authentication, Users, "Add user": the owner's email and a strong password (a password manager one). Tick "Auto
   confirm user". Turn **off** "Allow new users to sign up" (Authentication, Sign In / Providers) so nobody else can register.
   The Stash app shares this Supabase project and its anonymous sign-ins stay possible there, but Atelier refuses every identity
   except the owner (`ATELIER_OWNER_ID` on the server and `auth.uid() = owner_id` in the database).
2. Copy the new user's id (the UUID in the Users table). This is `ATELIER_OWNER_ID`.
3. **Two-step verification (TOTP):** Authentication, Sign In / Providers, Multi-Factor, enable "TOTP". Then, after the first sign-in,
   open Settings in Atelier, "Two-step verification", scan the QR code with an authenticator app and enter the 6-digit code. From
   then on sign-in asks for a code; keep the app's backup (or the setup key shown once) somewhere safe.

## 3. Image storage (Cloudflare R2)

1. Cloudflare dashboard, R2, "Create bucket": name `atelier-assets`.
2. **Public access** (the browser loads pictures straight from R2): either "Public access", "R2.dev subdomain", Allow; or
   connect a custom domain such as `assets.example.com`. Note the host, without `https://` (for example
   `pub-xxxxxxxx.r2.dev`). This is `R2_PUBLIC_HOST`.
3. **CORS** (bucket Settings, CORS policy). Replace the origin with the app's real origin (the Vercel production URL or its custom
   domain; add `http://localhost:3000` only for local testing against R2):

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP-ORIGIN"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. R2, "Manage API tokens", "Create API token": permission "Object Read & Write", scoped to the bucket `atelier-assets`. Note the
   Account ID, Access Key ID and Secret Access Key (the secret is shown once).

## 4. Vercel

1. Vercel, "Add New Project", import the repository, **Root Directory `atelier/`**, project name `atelier`. Framework: Next.js (detected).
2. Settings, Environment Variables, for Production (and Preview if you use it):

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://rvbllpkhwakjuahxyfff.supabase.co` | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon (publishable) key | public by design, protected by RLS |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service role key | **server only**, never prefix with `NEXT_PUBLIC_` |
   | `ATELIER_OWNER_ID` | the owner's user id from step 2 | |
   | `R2_ACCOUNT_ID` | Cloudflare account id | |
   | `R2_ACCESS_KEY_ID` | R2 token access key | |
   | `R2_SECRET_ACCESS_KEY` | R2 token secret | |
   | `R2_BUCKET` | `atelier-assets` | |
   | `R2_PUBLIC_HOST` | the public host from step 3 | server side |
   | `NEXT_PUBLIC_R2_PUBLIC_HOST` | the same host | the browser reads this one (it is inlined at build time, so redeploy after changing it) |

3. **Never set `ATELIER_LOCAL_ONLY` in Vercel.** It switches off sign-in and sync. The app refuses to start it when
   `VERCEL_ENV=production`, but a Preview deployment would honour it, and a Preview URL is reachable by anyone who has the link.
4. Deploy. The first build runs `npm run build`; the same checks run in CI (`.github/workflows/atelier-ci.yml`).

Secrets live only in Vercel and in `.env.local` (see `.env.example`). Do not paste them into issues, chats or commits.

## 5. Smoke checklist (after the first deploy)

Do this on the production URL. Tick each line.

- [ ] Open the URL in a private window: you land on the sign-in page, not on boards.
- [ ] `/api/health` answers `{"ok":true,...}` and `/api/boards` without signing in answers 401.
- [ ] Sign in with the owner email and password.
- [ ] Two-step code: enrol in Settings, sign out, sign in again, enter the 6-digit code. A wrong code is refused.
- [ ] Create a board from a template, rename it, star it, see it under Starred.
- [ ] Open it, add a sticky note, a shape, an arrow between two shapes, type some text. Reload: everything is still there.
- [ ] Add an image (drop a file or paste a screenshot). It appears at once and, a few seconds later, loads from the R2 host after a
      reload (DevTools, Network: the request goes to the `R2_PUBLIC_HOST`, and there is no CORS error on the upload).
- [ ] Open the same board on a phone (signed in): the changes made on the desktop are there; draw with a finger.
- [ ] Offline edit then sync: put the phone in airplane mode, edit, then turn it back on. The top bar goes "Offline · saved on this
      device" and back to "Saved", and the edit shows up on the desktop without a reload.
- [ ] Install as an app (browser menu, "Install Atelier" or on iOS "Add to Home Screen"). It opens in its own window and the board
      list opens with no network.
- [ ] Settings: switch the theme; it sticks after a reload.

## Known limits

- **One sync update must be under 1 MB.** The server rejects a single Yjs update over 1 MB (413) and the top bar shows
  "Sync problem · saved on this device". The edit is safe on the device, but it will not reach other devices. A paste of very large
  rich text or hundreds of images at once can hit this; split the paste.
- **Snapshots travel as base64 inside a Vercel function response, which is capped at 4.5 MB.** A board whose compacted state is
  larger than about 3.3 MB raw (4.5 MB once base64-encoded) cannot be fetched by a *new* device in one go. Devices that already hold
  the board keep working. Keep one board under that size (images are separate files and do not count); splitting a very large
  board into two is the workaround until snapshots are served in pieces.
- **R2 image URLs are unguessable, not private.** Anyone who has an image's URL can open it; nothing lists the bucket. That suits a
  private moodboard; do not put confidential material in images. Phase 3 revisits this for share links.
- **iOS and Safari can evict browser storage** for a site that has not been opened for a few weeks (the 7-day rule applies to Safari
  tabs; an installed home-screen app is exempt). Edits that are not yet synced are only on that device, so open the app and let it
  show "Saved" regularly. The app asks the browser for persistent storage, which Safari may ignore.
- **Vercel Hobby is non-commercial** (see the top of this page).
- **Duplicate board** works only for boards that have been opened once on this device.
- HEIC and other formats the browser cannot decode are refused with a message naming the file (Chromium cannot read HEIC).
