# Development progress

Updated at the end of every completed phase. See [CLAUDE.md](../CLAUDE.md)
§10 for the phase table and current/next phase at a glance.

---

## Phase 0 — Project initialization ✅

**Date:** 2026-08-29

**What was found:** the project directory was completely empty — no
Next.js app, no git repo, no Supabase config, no env files.

**What was done:**

- Scaffolded Next.js (App Router) + TypeScript with `src/` layout, Tailwind
  CSS v4, and ESLint (flat config), via `create-next-app` into a temp folder
  and moved into the project root (the directory name "vertex quiz" contains
  a space, which is invalid for npm's inferred package name — the folder
  itself was kept as-is per instructions, and `package.json`'s `name` field
  was set to `vertex-quiz` instead).
- Initialized shadcn/ui (`base-nova` style, `base-ui` primitives, neutral
  base color) and added `button`, `card`, `badge` components. Lucide React
  came in automatically as shadcn's icon library dependency.
- Replaced the generated grayscale theme in `src/app/globals.css` with
  Vertex Studio's design tokens (deep navy primary, light neutral
  background, white cards, violet-indigo accent, dark-navy sidebar tokens,
  plus `success`/`warning`/`ai` semantic colors not present in shadcn's
  defaults). Also fixed a generator bug where `--font-sans` pointed at
  itself instead of `--font-geist-sans`.
- Removed default `create-next-app` assets that had no use in this product
  (`public/*.svg`, the Next.js logo favicon) and replaced the favicon with a
  generated Vertex "V" mark (`src/app/icon.tsx`).
- Rewrote `src/app/layout.tsx` metadata and `src/app/page.tsx` as a minimal
  branded status page (pipeline overview: PDF → AI extraction → review →
  publish → student session → analytics) to prove the design tokens and
  shadcn components render correctly.
- Added `.env.example` (tracked) and `.env.local` (gitignored) with
  placeholders for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`;
  adjusted `.gitignore` so `.env.example` stays tracked while every other
  `.env*` file is ignored.
- Wrote `README.md`, `CLAUDE.md`, and `docs/` (`product-spec.md`,
  `architecture.md`, `database.md`, `ai-pipeline.md`,
  `development-progress.md`).
- Verified `npm run build` and `npm run lint` both pass; smoke-tested
  `npm run dev`.
- Initialized git and made the first commit.

**Notable finding:** the scaffolded Next.js version is **16.3.3** (React
19.2), which has real breaking changes vs. Next.js 14/15 conventions —
documented in [CLAUDE.md](../CLAUDE.md) §4, e.g. always-async `cookies()`/
`headers()`/`params`/`searchParams`, and `proxy.ts` replacing
`middleware.ts` for route protection. This matters starting Phase 1 (server
Supabase client) and Phase 2 (protected admin routes).

**Manually verify:**

- `npm run dev` and open `http://localhost:3000` — should show the Vertex
  Quiz branded status page (navy logo mark, pipeline cards, accent badge).
- `npm run build` completes without errors.
- `git log` shows a single, scoped `feat: initialize vertex quiz app` commit.

---

## Phase 1 — Supabase foundation

Not started.
