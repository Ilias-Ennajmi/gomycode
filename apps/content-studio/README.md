# Planet Sport — Content Studio (Next.js)

The current Content Studio app: Next.js (App Router) + Drizzle ORM + Clerk auth, backed by the same Supabase Postgres project as before, now with a real relational schema instead of a single JSONB blob. Replaces [`legacy-static-app/`](../../legacy-static-app), which is kept for reference only.

Deployed via the Vercel project **planet-sport-studio**, git-linked to this repo with Root Directory `apps/content-studio` (replaces the old direct-file-upload deploy of `legacy-static-app/`, which stays live at the pre-existing `planet-sport-content-studio` Vercel project until this one is confirmed working end to end). The Supabase schema is applied and Vercel env vars (`DATABASE_URL`, Clerk keys, webhook secret) are configured.

## Stack

- **Next.js 16** (App Router, Turbopack). Note: Next 16 renamed `middleware.ts` → `proxy.ts` — that's `proxy.ts` at the project root, not a typo.
- **Drizzle ORM** (`drizzle-orm/postgres-js`) — schema in `db/schema.ts`.
- **Clerk** — individual accounts per teammate (Restricted/invite-only sign-up), not the old shared login.
- **Tailwind CSS v4**.

## First-time setup

1. **Database**: run the SQL in `drizzle/0000_purple_karma.sql` in the Supabase SQL Editor, then `drizzle/seed.sql` (brand catalog + starter campaigns).
2. **Clerk**: create a Clerk application, set it to Restricted sign-up mode, invite teammates from the Clerk dashboard. Grab the publishable/secret keys.
3. **Clerk webhook**: point a webhook at `<your-deployment-url>/api/webhooks/clerk` for `user.created`, `user.updated`, `user.deleted`, and set `CLERK_WEBHOOK_SIGNING_SECRET` from its signing secret. This keeps the local `users` table in sync for display joins.
4. **Env vars**: copy `.env.example` to `.env.local` and fill in real values locally, or set them in Vercel's project settings for deployment. Never commit real values.
5. **Install & run**:
   ```bash
   npm install
   npm run dev
   ```

## Schema changes

This sandbox environment cannot open a live connection to Postgres, so migrations are generated (not pushed) here:

```bash
npx drizzle-kit generate
```

Review the new file under `drizzle/`, then run it manually in the Supabase SQL Editor — same workflow as the legacy app's `supabase/schema.sql`.

## Structure

```
app/(app)/            authenticated routes: calendar, ideation, production, campaigns, library, stats, influence
app/sign-in/, sign-up/ Clerk prebuilt auth pages
app/api/webhooks/clerk/ Clerk → users table sync
db/schema.ts           full relational schema
lib/actions/           Server Actions, one file per domain
lib/constants/         static reference data (holidays, idea bank, charte, type options)
components/            one *-view.tsx client component per tab, driven by its page.tsx Server Component
proxy.ts               Clerk auth gate (Next.js 16's renamed middleware.ts)
```
