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

## Phase 0 — Branding and visual reference integration ✅

**Date:** 2026-08-29

Follow-up to Phase 0 initialization: the real Vertex Studio logo and an
admin UI visual reference were supplied in `photos/` and integrated into the
design foundation. No Phase 1+ functionality (auth, Supabase, database, PDF
upload, Gemini, quiz/student flows, analytics) was touched.

**What was done:**

- Inspected the supplied assets: `photos/logo.png` (1254×1254 PNG, no alpha
  — a white angular "V" mark on a solid black square) and `photos/style.webp`
  (a screenshot of a third-party dashboard, used as visual inspiration only).
- Copied the official logo to `public/brand/logo.png` (the source archive in
  `photos/` was kept, not deleted) and used it as-is in the app header via
  `next/image`, displayed as a small rounded "logo chip" — a deliberate
  treatment given the source has no transparency.
- Generated `src/app/icon.png` (64×64 favicon) and `src/app/apple-icon.png`
  (180×180 Apple touch icon) by downscaling the real logo, and removed the
  Phase 0 placeholder `src/app/icon.tsx` that generated a synthetic "V".
- Did **not** copy `style.webp` into `public/` — it's a third-party
  screenshot with no reason to be served to end users; it stays in `photos/`
  as an internal reference only.
- Created `REFERENCES.md` documenting both assets' sources, purpose, final
  locations, and the design principles extracted from the visual reference
  (dark navy sidebar / light workspace split, white cards with subtle
  borders over heavy shadows, restrained corner radius, strong information
  hierarchy, one controlled accent used sparingly, generous whitespace) —
  and what was deliberately *not* carried over (its branding, exact
  component shapes, literal layout, copy).
- Refined the design system: tightened the base corner radius token from
  `0.625rem` to `0.5rem` for a more precise/premium feel in line with the
  logo's angular geometry and the reference's restrained radius; updated
  `CLAUDE.md` §9 with the brand-asset locations and a pointer to
  `REFERENCES.md`.
- Verified `npm run lint` and `npm run build` both pass, and manually
  checked the running dev server: the logo renders through Next's image
  optimizer at both `1x`/`2x` resolutions (200 responses, valid PNG data),
  `/icon.png` and `/apple-icon.png` both resolve, and the page's existing
  Phase 0 content (hero copy, pipeline cards, footer) is unchanged.

**Manually verify:**

- `npm run dev` and open `http://localhost:3000` — the header should show
  the real Vertex "V" logo (not a text placeholder) as a small rounded dark
  tile next to "Vertex Quiz / Vertex Studio", and the browser tab should
  show the same mark as its favicon.
- Resize the browser / check on a narrow viewport — header, hero, and the
  pipeline card grid should reflow without horizontal scrolling or
  overlapping content.
- Open the browser devtools console — no errors, no broken-image icons.
- Confirm corners feel slightly crisper than before (cards, badges, the logo
  tile) without looking sharp/harsh.

---

## Phase 1 — Supabase foundation ✅ (code + migrations — credentials pending)

**Date:** 2026-08-29

**What was found:** `.env.local` had empty
`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` placeholders (no
Supabase project configured yet) and a real `GEMINI_API_KEY` value already
present (left untouched — Gemini isn't used until Phase 4). No Docker and no
local `psql` were available in the dev environment, so migrations could not
be executed against a real or local Postgres instance.

**What was done:**

- Installed `@supabase/supabase-js`, `@supabase/ssr`, `zod`, and
  `server-only`; ran `supabase init` to scaffold `supabase/config.toml` for
  the CLI (`supabase link` + `supabase db push` once a project exists).
- **Environment naming change:** Supabase's currently-installed SDK
  (`@supabase/supabase-js` 2.112, `@supabase/ssr` 0.12) documents its keys as
  "publishable key" and "secret key" now, not "anon key" / "service_role
  key" — confirmed directly in the installed packages' own README/AGENTS
  files, the same "trust what's actually installed" check applied to
  Next.js 16 in Phase 0. Renamed the env vars accordingly:
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`, in `.env.example`,
  `.env.local` (still blank), `CLAUDE.md`, and `README.md`. Functionally
  identical — the SDK just treats the key as an opaque string — but this is
  what the user will actually see pasting from a current Supabase dashboard,
  with a comment noting the older "anon"/"service_role" labels for projects
  that still show them.
- Wrote `src/lib/env.ts` — a Zod schema over every required env var,
  validated **lazily** (only when `getEnv()` is actually called, not at
  import time) so pages that don't touch Supabase/Gemini keep working
  before those credentials exist. Guarded with the `server-only` package so
  an accidental client-side import is a build error, not a leaked secret.
- Wrote three Supabase client factories under `src/lib/supabase/`:
  `server.ts` (cookie-bound, RLS-respecting, for teacher-facing Server
  Components/Actions), `client.ts` (browser client for future Client
  Components, e.g. the Phase 2 login form), `admin.ts` (service-role client
  that bypasses RLS — server-only, for student-facing writes and any
  trusted cross-teacher server job).
- Wrote `src/lib/supabase/middleware.ts` (`updateSession()`) and
  `src/proxy.ts` (Next.js 16's `proxy.ts` convention, not the deprecated
  `middleware.ts`) to keep the Supabase session cookie fresh on every
  request. **Explicitly no-ops when Supabase isn't configured** — checked
  this doesn't break the currently-working Phase 0 status page, since
  Proxy runs on every request regardless of whether anything downstream
  needs auth.
- Wrote two SQL migrations under `supabase/migrations/`:
  - `20260829120000_create_core_schema.sql` — all 7 tables (`profiles`,
    `quizzes`, `questions`, `answers`, `participants`, `quiz_sessions`,
    `responses`), foreign keys with `ON DELETE CASCADE`, `CHECK`
    constraints, indexes (including a partial index on
    `answers (question_id) where is_correct` for grading lookups), an
    `updated_at` trigger, an `auth.users` → `profiles` auto-create trigger,
    and a deferred constraint trigger (`validate_question_answers_trigger`)
    enforcing "4 answers/1 correct for multiple_choice, 2/1 for
    true_false" at the database level — a backstop behind the Zod +
    application validation that Phase 4/5 will add, not a replacement.
  - `20260829120100_enable_rls.sql` — Row Level Security on all 7 tables.
    Teachers get full CRUD on their own quizzes/questions/answers (via two
    reusable `is_quiz_owner()`/`is_question_owner()` helper functions) and
    read-only access to participants/sessions/responses for quizzes they
    own. **No write policy exists for `participants`/`quiz_sessions`/
    `responses`** for `authenticated` or `anon` — every student-facing
    write is required to go through the service-role admin client
    server-side, since students never get a Supabase Auth session for RLS
    to key off.
- **Verification given no Docker/local Postgres:** added `libpg-query` (a
  real Postgres grammar parser) as a dev dependency and
  `scripts/lint-sql.mjs` (`npm run lint:sql`), which parses every migration
  file and fails on a syntax error without needing a live database. Both
  files parse cleanly (31 and 26 statements). This is **not** a substitute
  for running them against a real Supabase project — see docs/database.md
  for exactly what that first real run should be checked against.
- Updated `docs/database.md` (full implemented schema + RLS, marked
  "not yet verified against a live database"), `docs/architecture.md`
  (environment configuration section, updated directory structure and
  server/client boundary detail), and `CLAUDE.md` §6/§10.

**Verification performed:**

- `npx tsc --noEmit` — no errors.
- `npm run lint` — clean.
- `npm run build` — succeeds; output confirms `src/proxy.ts` was picked up
  ("ƒ Proxy (Middleware)").
- `npm run lint:sql` — both migration files parse as valid Postgres SQL.
- `npm run dev` with `.env.local`'s Supabase vars still blank — `/` still
  returns 200 with the Phase 0 content intact, and the dev log shows
  `proxy.ts` running on every request (confirming it's wired up) without
  throwing.
- **Not verified:** the migrations have not been executed against any real
  or local Postgres instance (no Docker, no Supabase project configured).
  Correctness was checked by SQL-grammar parsing (`libpg-query`) and manual
  review, not by an actual `CREATE TABLE`/RLS run. Treat the first
  `supabase db push` as the real test.

**What you need to configure manually:**

1. Create a Supabase project (if you haven't already) at
   [supabase.com](https://supabase.com).
2. In `.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` from
   your project's **Settings → API** page (whether it labels them
   "Publishable"/"Secret" or "anon"/"service_role" — both work).
3. Link the CLI and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   or paste the two files in `supabase/migrations/` into the Supabase SQL
   editor, in order, if you'd rather not use the CLI.
4. Watch for errors from the `validate_question_answers_trigger` /
   deferrable unique constraints during that push — they're the least
   "standard" part of this schema and the part most worth double-checking
   against your actual project.

**Manually verify (once credentials are in place):**

- Sign up a test user via the Supabase dashboard's Auth panel (or
  `supabase.auth.signUp` from a scratch script) and confirm a matching row
  appears in `public.profiles` automatically.
- In the SQL editor, try inserting a `multiple_choice` question with only 3
  answers, or 2 correct answers, in one transaction — it should be
  rejected by `validate_question_answers_trigger`.
- Confirm RLS is listed as "Enabled" for all 7 tables in
  **Database → Tables**.
