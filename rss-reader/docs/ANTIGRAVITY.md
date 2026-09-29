# Handing this project to Google Antigravity

## 1. Give Antigravity access

Antigravity works on a local copy of the repo, with your own GitHub login.

1. Install Git, Node.js 22 and (optionally) Docker for a local database.
2. In Antigravity: **Clone Repository** → sign in to GitHub when asked →
   `Ilias-Ennajmi/gomycode`. Or in a terminal:
   `git clone https://github.com/Ilias-Ennajmi/gomycode.git`
3. Use the right branch. Until PR #3 is merged the app is on
   `claude/rss-reader-nextjs-app-3c880j` (`git checkout claude/rss-reader-nextjs-app-3c880j`).
   After merging PR #3, work from `main`.
4. Open the `rss-reader` folder as the workspace.
5. Create `rss-reader/.env.local` yourself (Antigravity shouldn't see production secrets):
   - For development, a local database and a throwaway password are enough (README → "Run it locally").
   - `GEMINI_API_KEY`: create one at https://aistudio.google.com/apikey (free), or leave empty.
   - Production values stay in Vercel → rss-reader → Settings → Environment Variables.
6. Deploying: Vercel builds automatically when you push (preview for branches, production for
   `main`). Antigravity only needs `git push`; it doesn't need a Vercel or Supabase login.

Keep the Vercel, Supabase and GitHub owner accounts yourself. If you do give a tool database
access, create a separate Supabase branch/project for it rather than sharing production.

## 2. Prompt to paste into Antigravity

```text
You are taking over development of "Reader", a personal RSS/news reader. It is a
Next.js 14 + TypeScript + Prisma/Postgres app in the rss-reader/ folder of this repo,
deployed on Vercel at https://rss-reader-jet.vercel.app.

Before doing anything:
1. Read rss-reader/README.md and rss-reader/AGENTS.md fully. AGENTS.md contains the
   architecture, the rules and the pitfalls already found. Follow it.
2. Run `git log --oneline -- rss-reader | head -30` to see the history.
3. Set up and run the app locally (README → "Run it locally"), open it at 390px and
   1440px wide, and tell me in a few lines how it's organised and anything that looks broken.

Rules:
- Work only inside rss-reader/. Never commit secrets (.env files, keys, passwords, DB URLs).
- Every change must pass `npx tsc --noEmit` and `npm run lint`. Schema changes go through
  Prisma migrations.
- Check every UI change on a phone width (no sideways scrolling) and on desktop, in dark and light.
- Make small commits with clear messages on a feature branch and push. Don't force-push,
  and don't merge to main without asking me.
- Keep AI features optional: the app must work without GEMINI_API_KEY.
- Before a large change, show me a short plan and wait for my OK.

My first task for you: <describe what you want next>
```

## 3. Good first tasks

See "Open ideas" at the end of `AGENTS.md`: hourly refresh via an external cron, skeleton
loaders, card layout for News/YouTube, email newsletters, offline and push notifications.
