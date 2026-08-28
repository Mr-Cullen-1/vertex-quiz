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

## Phase 1 — Supabase foundation ✅

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

---

### Phase 1 addendum — env validation fix

**Date:** 2026-08-29

Once real Supabase credentials were added to `.env.local`, a targeted
verification pass (`npx tsc --noEmit`, `npm run lint`, `npm run build`,
plus a new `scripts/check-env.mjs` diagnostic that checks required env vars
are present/well-formed without ever printing their values) surfaced a real
bug: zod's built-in `z.httpUrl()`/`z.url()` require a dotted, TLD-like
hostname and reject bare hosts like `localhost` or `127.0.0.1` — which
would have broken the default `NEXT_PUBLIC_APP_URL=http://localhost:3000`
and any locally-run Supabase instance (`supabase start`). Fixed in
`src/lib/env.ts` and `scripts/check-env.mjs` by validating http(s) URLs via
the `URL` constructor's `.protocol` instead of zod's hostname-strict
helpers. Committed separately as `fix: support localhost app url
validation` (`d0a7110`), verified before this addendum's migration work.

### Phase 1 addendum — real migration applied and verified ✅

**Date:** 2026-08-29

With the real Supabase project created and `db push` run successfully by
the user (`Applying migration 20260829120000_create_core_schema.sql` /
`20260829120100_enable_rls.sql` / `Finished supabase db push`), performed a
full independent verification directly against the **live** remote
database — not a re-read of the migration files — using
`npx supabase db query --linked` (ad hoc SQL files, cleaned up afterward;
none of this queries or exposes any secret values).

**Migration history:** `npx supabase migration list` shows both
`20260829120000` and `20260829120100` with matching local/remote
timestamps — confirmed applied.

**Schema verification (all passed):**

- All 7 tables present: `profiles`, `quizzes`, `questions`, `answers`,
  `participants`, `quiz_sessions`, `responses`.
- Every primary key is `id uuid`.
- All 10 foreign keys present with the exact `ON DELETE` behavior from the
  migration — 9 `CASCADE` (including `profiles.id → auth.users.id`, which
  a naive `information_schema` join missed at first because it doesn't
  handle the cross-schema reference cleanly; confirmed directly via
  `pg_constraint` instead) and 1 `SET NULL`
  (`responses.selected_answer_id → answers.id`).
- All `timestamptz` columns, defaults (`now()`, `'draft'`, `'started'`,
  `0`), and nullability match exactly.
- All indexes present — `quizzes_teacher_id_idx`, `quizzes_status_idx`,
  the two deferrable `(*, order_index)` unique indexes, the partial
  `answers_question_id_correct_idx`, and every `quiz_id` /
  `participant_id` / `session_id` / `question_id` lookup index.
- All `CHECK` constraints present, including
  `quizzes_question_counts_match`.
- RLS (`relrowsecurity`) is `true` on all 7 tables.
- All 17 RLS policies present, every one scoped to `{authenticated}` only
  (no `anon` policy anywhere): 2 on `profiles` (select/update own), 4 each
  full-CRUD on `quizzes` / `questions` / `answers` (ownership via
  `is_quiz_owner()` / `is_question_owner()`), and exactly 1 `select`-only
  policy each on `participants` / `quiz_sessions` / `responses` with **no**
  write policy at all on those three — confirming student writes have no
  path except through `src/lib/supabase/admin.ts`.
- `is_quiz_owner()` / `is_question_owner()`: `security invoker`, `stable`,
  `search_path = ''`. `handle_new_user()`: `security definer`,
  `search_path = ''`. All as designed.
- `validate_question_answers_trigger` and both order-index unique
  constraint triggers confirmed `deferrable = true`,
  `initially deferred = true`.

**Functional test of the deferred answer trigger** — the part of this
schema with no direct Postgres equivalent to fall back on, so it needed an
actual live test, not just a definition check. Ran entirely inside
`BEGIN; ... ROLLBACK;`: created a throwaway `auth.users` row (fires
`handle_new_user()` → a real `profiles` row), a quiz, one `multiple_choice`
and one `true_false` question, then tried five answer combinations,
forcing the deferred trigger to check immediately after each
(`SET CONSTRAINTS ALL IMMEDIATE`) and capturing pass/fail in a temp table
(`RAISE NOTICE` output isn't visible through the Management API query
path, so this was necessary to see results at all):

| Case | Expected | Result |
|---|---|---|
| `multiple_choice`, 3 answers | rejected | ✅ rejected |
| `multiple_choice`, 4 answers / 2 correct | rejected | ✅ rejected |
| `multiple_choice`, 4 answers / 1 correct | accepted | ✅ accepted |
| `true_false`, 2 answers / 2 correct | rejected | ✅ rejected |
| `true_false`, 2 answers / 1 correct | accepted | ✅ accepted |

All 5 matched. Immediately after the `ROLLBACK`, re-checked row counts on
`profiles`/`quizzes`/`questions`/`answers`/`auth.users` — all `0`. No test
or demo data left in the database.

**Not tested:** live cross-teacher isolation with two real authenticated
sessions — the verification connection runs as a privileged role that
bypasses RLS by nature (it's how `db query --linked` works), so it can't
simulate "logged in as teacher A". Ownership logic was instead verified by
reading each policy's predicate directly (above), which confirms the logic
is correct; an end-to-end multi-account check becomes possible once
Phase 2's login flow exists.

**Verification tooling:** the ad hoc SQL files used for this
(`scripts/verify/*.sql`) were deleted after use — they were one-off
diagnostic queries for this session, not a reusable tool like
`scripts/lint-sql.mjs`/`scripts/check-env.mjs`, which stay.

**Final Phase 1 checks:**

- `npx tsc --noEmit` — no errors.
- `npm run lint` — clean.
- `npm run build` — succeeds; `ƒ Proxy (Middleware)` confirmed.

**Phase 1 is complete.** The Supabase foundation (schema, RLS, client
utilities, env validation) is implemented, applied to the real project, and
independently verified end-to-end.

---

## Phase 2 — Teacher authentication and dashboard ✅

**Date:** 2026-08-29

**What was built:**

- **Auth:** `src/lib/auth/actions.ts` — `login`/`logout` Server Actions.
  Email/password only (no social login, no magic links, no signup route —
  matches the product spec, which lists "Login" but not "Sign up" for
  teachers; accounts are provisioned outside the app). Zod-validated input,
  friendly error messages for Supabase's common auth errors.
- **Login page:** `src/app/login/` — server-checks for an existing session
  (redirects to `/dashboard` if already signed in) and renders a client
  form (`useActionState` for pending/error state) with the real Vertex logo.
- **Route protection:** `src/proxy.ts` now does an optimistic redirect
  (unauthenticated → `/login` for `/dashboard`, `/quizzes`, `/results`,
  `/settings`; authenticated → `/dashboard` for `/login`), based on JWT
  claims from `src/lib/supabase/middleware.ts`. `(admin)/layout.tsx`
  independently re-verifies server-side on every request — the proxy check
  is optimistic only, per Next's Data Access Layer guidance.
- **Dashboard shell:** `(admin)/layout.tsx` (auth gate + profile load),
  `_components/` (`sidebar-nav`, `desktop-sidebar`, `mobile-nav` — a
  Sheet-based drawer, `header`, `page-title`, `stat-card`), `error.tsx`.
  Sidebar: Dashboard / My Quizzes / Results, then Settings / Log out.
  Header: mobile menu trigger, page title, teacher name/email, logout.
- **Pages:** `/dashboard` (4 real stat cards — total/published quizzes,
  participants, average score — plus a "Recent Quizzes" list or empty
  state), `/quizzes` (full list or empty state, both Phase 2 scope — the
  actual quiz *creation* flow behind "Create your first quiz" is Phase 3),
  `/results` (empty state until sessions exist), `/settings` (real
  name/email/member-since from `profiles`, not placeholder text).
- Added shadcn `sheet`, `separator`, `input`, `label` components (base-ui
  backed, matching Phase 0's `base-nova` style).

**Blocker found and fixed — table privileges.** A real end-to-end login
test (see below) surfaced that `authenticated`/`anon` had no `SELECT` (or
any DML) grant on any of the 7 tables — Phase 1 had assumed Supabase
auto-exposes new tables, which doesn't hold for this project. Stopped and
reported this before touching migrations, per instruction. Added
`supabase/migrations/20260829120200_grant_teacher_table_privileges.sql`
granting `authenticated` exactly what its existing RLS policies already
allow (full CRUD on `quizzes`/`questions`/`answers`, `SELECT, UPDATE` on
`profiles`, `SELECT` only on `participants`/`quiz_sessions`/`responses`;
nothing for `anon`). Applied via `supabase db push` and re-verified — see
docs/database.md's "Table privileges" and "Live verification — Phase 2
grant fix" sections for the full detail, including the exact `403` error
that first exposed the gap and the before/after real-login comparison.

**Error handling fix.** Before the grant fix, every affected page still
returned `200` with misleading zeros/empty states, because query errors
were never checked. Added `src/lib/supabase/assert-no-error.ts` (throws on
a Supabase error) and call it after every data-affecting query in
`dashboard`, `quizzes`, `results`, and `settings` pages, so a real error
now surfaces through `(admin)/error.tsx` as a `500` instead of a fake
success. Verified this actually works by temporarily pointing a query at a
nonexistent table (a code-only change, immediately reverted) and
confirming a `500` instead of `200`.

**Other fixes found during verification:**

- `z.httpUrl()`/`.select() render={<Button asChild>}`-style Radix
  conventions don't apply to this project's base-ui-backed shadcn
  components — `asChild` isn't a prop; the equivalent is
  `<Button render={<Link href="..." />}>`. Fixed 4 call sites across
  `dashboard`/`quizzes` pages that initially used the (nonexistent)
  `asChild` API, caught by `tsc`.
- Base UI warned in the browser console that those same `Button`+`Link`
  combinations needed `nativeButton={false}` (a `<Button render={<Link>}>`
  renders an `<a>`, not a `<button>`, so button-specific semantics should
  be turned off) — fixed on all 4.
- `Settings`'s "Member since" date used `toLocaleDateString(undefined, …)`,
  which formats using the server's OS locale rather than the app's English
  UI — confirmed via a real request that it silently rendered in Russian
  on this machine. Fixed to an explicit `"en-US"` locale.

**Real end-to-end verification performed (not just code review):**

- Created a temporary test teacher via the Admin API (`email_confirm:
  true`, so it works regardless of the project's email-confirmation
  setting — no Supabase Dashboard change was needed).
- Confirmed `handle_new_user()` fired correctly in production (`profiles`
  row appeared with the right `full_name`).
- Submitted the **real** `/login` form — extracted the actual Server
  Action id/bound-state/action-key from the rendered page and posted a
  real `multipart/form-data` request matching what the browser's
  progressive-enhancement path sends — and got a real `303` to
  `/dashboard` with a real session cookie back from Supabase Auth.
- Loaded `/dashboard`, `/quizzes`, `/results`, `/settings` with that
  cookie: all `200`, all showing real data (teacher name, `0` counts that
  are genuinely zero, "No quizzes yet" that's genuinely no quizzes).
- Verified logout: submitted the real logout Server Action, got a
  `Set-Cookie: ...auth-token=; Max-Age=0` clearing the session and a `303`
  to `/login`; confirmed `/dashboard` redirected to `/login` again
  afterward.
- Verified unauthenticated protection: `/dashboard`, `/quizzes`,
  `/results`, `/settings` all `307` to `/login` with no session cookie.
- Verified no secret leakage: grepped `.next/static` (client bundles) for
  the literal `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` values after a
  production build — zero matches in both cases.
- Deleted the temporary test teacher via the Admin API afterward and
  confirmed `auth.users`/`profiles`/`quizzes`/`participants` row counts
  were all back to `0` — no residual test data.

**Not automated (left for manual verification, as the task itself
expected):** the actual browser click-through — visual rendering of the
mobile drawer, hover/focus states, and the rendered content of the custom
`error.tsx` UI (Next.js streams error boundaries to the client for the
browser's React runtime to mount; a non-JS `curl` client can prove the
request failed correctly but can't render the final React tree).

**Validation:**

- `npx tsc --noEmit` — no errors.
- `npm run lint` — clean.
- `npm run build` — succeeds; routes list shows `/login`, `/dashboard`,
  `/quizzes`, `/results`, `/settings` all dynamic (`ƒ`), `/` and the two
  icon routes still static (`○`), `ƒ Proxy (Middleware)` confirmed.
- `npm run lint:sql` — all 3 migrations (including the new grant one)
  parse as valid Postgres SQL.

**Manually verify:**

- Create a real teacher account (Supabase Dashboard → Authentication →
  Users → Add user, with "Auto Confirm User" checked, or via
  `supabase.auth.admin.createUser` with `email_confirm: true`) and sign in
  at `/login` in an actual browser.
- Click through the sidebar (Dashboard / My Quizzes / Results / Settings)
  and confirm the active-item highlight updates and the page title in the
  header changes to match.
- Resize to a mobile width and confirm the sidebar collapses into a
  hamburger-triggered drawer (top-left of the header) that closes when you
  tap a nav item or the backdrop.
- Log out from both the sidebar and the header logout button; confirm you
  land on `/login` and can't navigate back into `/dashboard` without
  signing in again.
- Open browser devtools while doing all of the above — no console errors.

**Manual Supabase configuration required:** none. The only blocker found
(missing table grants) was fixed via a migration, not a Dashboard setting.
Email confirmation status doesn't matter for testing, since
`email_confirm: true` on `createUser` sidesteps it — but note that a
teacher signing up some *other* way (there isn't one in this MVP) would be
subject to whatever the project's email-confirmation setting is.

---

## Phase 3 — Quiz creation ✅

**Date:** 2026-08-29

**What was built:**

- **Schema/validation:** `src/lib/quizzes/schema.ts` — a Zod schema shared
  by create and edit: title (required, ≤200 chars), description (optional,
  ≤2000 chars), `multipleChoiceCount`/`trueFalseCount` (integers ≥ 0),
  optional time limit (1–480 minutes), optional deadline (must parse as a
  valid date **and** be in the future), and a `.refine()` requiring
  `multipleChoiceCount + trueFalseCount >= 1` — the 0 MC + 0 TF case the
  spec calls out as invalid.
- **Server Actions:** `src/lib/quizzes/actions.ts` — `createQuiz`,
  `updateQuiz`, `deleteQuiz`. `total_questions` is always computed
  server-side as `multipleChoiceCount + trueFalseCount`, never accepted
  from the client. `teacher_id` on create always comes from
  `getClaims().sub` (the verified session), never from the form — there is
  no `teacher_id` field in the form to begin with. `updateQuiz`/`deleteQuiz`
  both re-read the row first and refuse (`"Quiz not found."` /
  `"Only draft quizzes can be edited/deleted."`) if RLS can't see it or its
  status isn't `draft`.
- **Routes:** `/quizzes/new` (create form), `/quizzes/[id]` (draft detail:
  question structure, time limit, deadline, created date, Edit/Delete for
  drafts), `/quizzes/[id]/edit` (same form, pre-filled, redirects to the
  detail page if the quiz is somehow not a draft). `/quizzes` (the Phase 2
  placeholder) now lists real quizzes — MC/TF/total/created/deadline,
  newest first — instead of always showing the empty state.
- **Shared form UX:** `_components/quiz-form.tsx` (used by both `new` and
  `edit`) — `useActionState` for idle/submitting/error, a live-updating
  "Total questions" readout as the teacher types MC/TF counts, Cancel link
  back to the sensible previous page. Delete uses a shadcn `AlertDialog`
  confirm step (added `alert-dialog`, `textarea` components) before
  submitting — no accidental deletes from a single click.
- Dashboard's and Quizzes' "Create your first quiz" / "New quiz" buttons,
  wired to `/quizzes/new` since Phase 2 (as a not-yet-built route back
  then), are now real working links.

**No database migration** — Phase 3 writes into the existing `quizzes`
table under the existing RLS policies and grants from Phase 1/2. Verified
this holds up (see docs/database.md's "Live verification — Phase 3 quiz
creation").

**Real end-to-end verification performed:**

- Created two temporary teacher accounts (Admin API, `email_confirm:
  true`), signed in as each via the real `/login` form (same
  action-id-extraction technique as Phase 2).
- **Create:** submitted the real `/quizzes/new` form as Teacher A with 7
  MC + 3 TF → `303` to `/quizzes/{id}` → confirmed in the database
  (`multiple_choice_count: 7, true_false_count: 3, total_questions: 10,
  status: 'draft', teacher_id` matching Teacher A) and on the rendered
  detail page.
- **Validation:** submitted 0 MC + 0 TF → `200` (no redirect) with "Add at
  least one question — Multiple Choice or True/False" shown inline;
  confirmed no row was created for that title.
- **Constraint backstop:** inside a rolled-back transaction, inserted a row
  with `total_questions` deliberately mismatched from
  `multiple_choice_count + true_false_count` (bypassing app validation
  entirely) — rejected by `quizzes_question_counts_match`; a matching valid
  row was accepted. Nothing persisted.
- **Edit:** submitted the real `/quizzes/[id]/edit` form, changing the mix
  to 5 MC + 5 TF, adding a 45-minute time limit, and renaming the quiz →
  `303` back to the detail page → confirmed all changes persisted.
- **Delete:** deleted the quiz as its owner (via the same authorized
  client the Server Action uses) → confirmed the row was gone and no
  longer listed on `/quizzes`.
- **Cross-tenant security — real second session, not just a code review:**
  Teacher B, a separate authenticated session, got `404` on both
  `/quizzes/{teacherA'sId}` and `/quizzes/{teacherA'sId}/edit`. Went
  further and called the PostgREST API directly with Teacher B's own
  access token: `SELECT` returned `[]`, `UPDATE` (attempting
  `{"title":"HACKED BY TEACHER B"}`) returned `[]`/`200` with **zero rows
  changed**, `DELETE` returned `[]`/`200` with **zero rows deleted**.
  Re-read the quiz afterward and confirmed the title and status were
  exactly as Teacher A left them.
- Verified unauthenticated requests to `/quizzes/new` and
  `/quizzes/{id}` still `307` to `/login` (already covered by the Phase 2
  proxy's `/quizzes` prefix match — no proxy change needed for Phase 3).
- Verified no secret leakage: re-ran the `.next/static` grep for
  `SUPABASE_SECRET_KEY`/`GEMINI_API_KEY` values after the Phase 3 build —
  zero matches.
- Deleted both temporary teacher accounts afterward; confirmed
  `auth.users`/`profiles`/`quizzes`/`participants` all back to `0` rows.

**Not automated (left for manual/browser verification):** the delete
confirmation dialog's actual click-through. `AlertDialogContent` renders
into a portal that Base UI doesn't mount into the initial server HTML when
closed, so a non-JS `curl` client never sees the delete form at all — only
a real browser opens the dialog and reveals it. The underlying delete path
was still fully verified (see above), just via the authorized client
directly rather than by driving the dialog's UI.

**Validation:**

- `npx tsc --noEmit` — no errors (had to run `npx next typegen` once after
  adding the `[id]` dynamic route folders — the `PageProps<"/quizzes/[id]">`
  helper type didn't exist until route types were regenerated).
- `npm run lint` — clean.
- `npm run build` — succeeds; routes list shows `/quizzes/new`,
  `/quizzes/[id]`, `/quizzes/[id]/edit` all dynamic (`ƒ`).
- `npm run lint:sql` — all 3 existing migrations still parse (none added).

**Manually verify:**

- Log in as a real teacher, click "Create your first quiz" from either the
  dashboard or `/quizzes`, and fill in the form — confirm the "Total
  questions" number updates live as you type MC/TF counts.
- Try submitting with both counts at 0 — confirm the inline error and that
  the button re-enables after the failed submit.
- Set a deadline in the past — confirm it's rejected ("Deadline must be in
  the future").
- After creating a quiz, click "Edit", change something, save, and confirm
  the detail page reflects it immediately.
- Click "Delete draft" and confirm the AlertDialog actually opens, shows
  the quiz title, and both Cancel and the destructive Delete button behave
  as expected (Cancel closes without deleting; Delete removes it and
  returns to `/quizzes`).
- Open browser devtools throughout — no console errors.

**Manual Supabase configuration required:** none.
