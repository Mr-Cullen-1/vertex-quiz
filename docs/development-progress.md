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

---

## Phase 4 — PDF upload + Gemini AI question generation ✅

**Date:** 2026-08-29

**What was built:**

- **Gemini SDK choice**: inspected what's actually current before
  installing anything — `@google/genai` (published days ago, actively
  maintained, 96 versions) vs. the legacy `@google/generative-ai`
  (unchanged for a year, explicitly superseded per its own maintainers).
  Installed only `@google/genai`. Model: `gemini-flash-latest` — Google's
  rolling alias for the current recommended Flash model, not a dated
  snapshot, so this doesn't quietly go stale.
- **Storage**: `supabase/migrations/20260829120300_quiz_pdfs_storage.sql`
  — private `quiz-pdfs` bucket (`application/pdf` only, 8 MB limit) plus
  four `storage.objects` RLS policies scoping each teacher to their own
  `{teacher_id}/` folder. No app table/column changes —
  `quizzes.source_pdf_path` already existed from Phase 1.
- **Atomic insert**:
  `supabase/migrations/20260829120400_create_quiz_questions_rpc.sql` — a
  `create_quiz_questions()` Postgres function so a whole generated batch
  (every question + its answers) commits or rolls back together. Explicit
  `GRANT EXECUTE ... TO authenticated` even though Postgres grants
  `EXECUTE` to `PUBLIC` by default (unlike tables) — didn't assume, and
  verified after applying.
- **PDF validation**: `src/lib/quizzes/pdf.ts` — 8 MB cap, empty-file
  rejection, and a magic-byte check (`%PDF`) rather than trusting the
  browser-reported MIME type, which is inferred from the file extension
  and easy to get wrong.
- **Gemini pipeline**: `src/lib/gemini/` — `client.ts` (server-only,
  `GEMINI_API_KEY` via `getEnv()`), `prompt.ts` (the structured extraction
  prompt: exact MC/TF counts, PDF-grounded only, exact answer shape per
  type), `schema.ts` (a deliberately loose Zod shape — 2–4 answers, no
  discriminated union — converted to JSON Schema via `z.toJSONSchema()`
  for `responseJsonSchema`; kept simple since Gemini's structured-output
  support is a constrained JSON Schema subset and the schema is never the
  real authority anyway), `validate.ts` (the actual authority: exact
  total/MC/TF counts, exact answer counts and correct-answer counts per
  type, non-empty text, no duplicate MC options, True/False answers must
  be literally "True"/"False" — any failure rejects the whole batch).
- **Server Actions**: `src/lib/quizzes/generate-actions.ts` —
  `uploadQuizPdf` (validates, stores via the RLS-scoped client, updates
  `source_pdf_path`), `generateQuestions` (refuses if questions already
  exist or no PDF is uploaded, downloads the PDF back from Storage, calls
  Gemini, validates, calls the RPC), `clearGeneratedQuestions` (deletes a
  draft's questions so it can be regenerated). All three explicitly
  re-check session + quiz ownership + draft status, same pattern as
  Phase 3's `actions.ts`.
- **UI**: `pdf-generation-panel.tsx` on `/quizzes/[id]` — the 7 states
  (empty → selected → uploading → processing → success/error, plus the
  persisted "questions already generated" summary view) map to two real,
  separately awaited requests (`uploadQuizPdf` then `generateQuestions`);
  no fabricated progress percentages or sub-phase timers. "Clear generated
  questions" uses the same `AlertDialog` confirm pattern as Phase 3's
  delete-quiz flow.

**No database schema change** — verified `source_pdf_path` already existed
before writing any code; the only additions were Storage configuration and
one Postgres function, both explicitly allowed by the task without needing
to stop and ask.

**Real end-to-end verification performed (not just code review):**

- Generated a genuine multi-section educational PDF (pdfkit, temporary
  dev-only dependency, not added to the project) and ran it through the
  real extraction pipeline directly against Gemini first, in isolation, to
  confirm the prompt/schema/model combination actually works before
  wiring it into the app: got back exactly 10 questions (7 MC/3 TF),
  correct shape, content genuinely grounded in the PDF.
- **Full app flow via a real headless browser** (Playwright/Chromium —
  installed temporarily, not a project dependency): the upload/generate
  actions are plain async calls from a Client Component's `onClick`
  handlers, not `<form action>` submissions, so earlier phases'
  "extract the hidden action field and replay it with curl" technique
  doesn't apply here — a real browser was the right tool. Logged in,
  created a 7 MC + 3 TF draft through the real form, uploaded the PDF
  through the real file input, clicked "Upload & generate", confirmed
  "Generated 10 questions.", confirmed the summary persisted after a full
  page reload, and confirmed the upload/generate UI disappears once
  questions exist (replaced by the clear-questions summary).
- **Database records verified directly**: 7 `multiple_choice` rows
  (`order_index` 0–6, 4 answers/1 correct each), 3 `true_false` rows
  (`order_index` 7–9, 2 answers/1 correct each) — exact match to what the
  UI reported.
- **Invalid file handling**: a wrong-extension file was rejected
  client-side with no network request; a `.pdf`-named file with garbage
  content (passes the client-side extension check) was rejected
  server-side by the magic-byte check — confirmed via a direct debug
  script after an initial flaky assertion in the main E2E script (the
  underlying behavior was correct on inspection; the test script's own
  selector, not the app, was the source of the flake).
- **Duplicate-generation guard verified at both layers**: the UI hides
  upload/generate entirely once a quiz has questions; separately, called
  `create_quiz_questions` directly via PostgREST with the real teacher's
  own access token on a quiz that already had 10 questions — rejected
  with the expected message, question count stayed at exactly 10.
  Clearing and regenerating afterward produced a clean 10-question batch
  with no leftovers.
- **Cross-tenant Storage security**: Teacher A downloaded her own PDF
  successfully (byte-for-byte match); Teacher B's session, given Teacher
  A's exact storage path, got `Object not found` on download and an empty
  listing of Teacher A's folder.
- **No secret leakage**: re-checked `.next/static` for both
  `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` (its first real usage in the
  app) after a Phase 4 build — zero matches.
- **Cleanup**: deleted both temporary teacher accounts and their Storage
  objects via the Admin API (Storage objects are **not**
  cascade-deleted by the `auth.users` FK — removed explicitly first).
  Confirmed the database and bucket afterward contain only the one
  pre-existing real teacher account and quiz, completely untouched
  throughout testing. All temporary scripts, the temporary test PDF, and
  the temporary `pdfkit`/`playwright` dev tools were removed — neither
  was added to `package.json`.

**Validation:**

- `npx tsc --noEmit` — no errors.
- `npm run lint` — clean.
- `npm run build` — succeeds (confirms `experimental.serverActions.bodySizeLimit: "9mb"` took effect, needed since the default Server Action body limit is 1 MB and PDFs go up to 8 MB).
- `npm run lint:sql` — all 5 migrations (including the 2 new ones) parse as valid Postgres SQL.

**Manually verify:**

- Open a draft quiz with no PDF yet, upload a real PDF, and watch the
  panel move through "Uploading PDF…" → "Analyzing your PDF and
  generating N questions…" → the generated-questions summary.
- Try a non-PDF file and a PDF over 8 MB — confirm clear, specific error
  messages, not a generic failure.
- With questions already generated, confirm there's no way to trigger
  generation again without first clicking "Clear generated questions"
  (with its confirm dialog).
- Open browser devtools throughout — no console errors.

**Manual Supabase configuration required:** none. The Storage bucket and
its policies were created via migration, not the Dashboard.

## Phase 5 — Teacher question review ✅

**Date:** 2026-08-30

**What was built:**

- **Migration**: `supabase/migrations/20260830120000_add_question_management.sql`
  — one new column (`questions.review_status`, `pending`/`approved`,
  default `pending`) and four `security invoker` Postgres functions
  (`add_quiz_question`, `update_quiz_question`, `delete_quiz_question`,
  `reorder_quiz_questions`), each re-deriving ownership itself and
  explicitly granted `EXECUTE ... TO authenticated` (same discipline as
  Phase 2/4). No new table, no `quizzes.status` change — "ready for
  publishing" is computed from `review_status`, never persisted.
- **Shared validation refactor**: extracted `validateQuestionShape` into
  `src/lib/quizzes/question-rules.ts` and had `src/lib/gemini/validate.ts`
  call into it, so the exact same MC/TF shape rules (counts,
  correct-answer counts, no duplicate MC options, fixed True/False
  vocabulary) apply to both AI-generated and manually-typed questions —
  one authority, not two copies.
- **Shared ownership helpers**: extracted `requireSession`/
  `loadOwnedDraftQuiz` into `src/lib/quizzes/ownership.ts` (generic over
  the caller's `select` string and expected row type) and had
  `generate-actions.ts` use it too, removing what had been duplicated
  Phase 4 logic.
- **Server Actions**: `src/lib/quizzes/question-actions.ts` —
  `addQuestion`, `updateQuestion`, `deleteQuestion`, `reorderQuestions`
  (all validate via `question-rules.ts` then call the matching RPC),
  `setQuestionReviewStatus` (a plain RLS-scoped update — no RPC needed for
  a single-row single-table change).
- **Review page**: `/quizzes/[id]/review` — header (question count,
  "X / N reviewed", a "Ready for publishing" banner once every question is
  approved), a card per question (type badge, review-status badge, answer
  options with the correct one visually marked, move up/down, edit,
  delete, approve/mark-pending), an "Add question" dialog (type select,
  question text, 4 free-text MC options or fixed True/False, radio for the
  correct answer). Reused the existing `AlertDialog` delete-confirm pattern
  from Phase 3/4 and added three new shadcn/base-ui components (`dialog`,
  `radio-group`, `select`) matching the existing design tokens — no new
  design system, same navy/light/indigo-accent look.
- **Quiz detail page**: added a small "Question review" card (question
  count + review progress, link to the review page) so manual-only quizzes
  (no PDF ever uploaded) can also reach question management — Phase 5
  doesn't require generation first.

**No schema change beyond the one column** — verified before writing any
migration that a persisted "ready for publishing" quiz status wasn't
necessary (it's computed), keeping the change to exactly what the review
workflow needs.

**Real end-to-end verification performed (not just code review):**

- **Real generation → full review workflow, via a real headless browser**
  (Playwright, installed temporarily like Phase 4, never added to
  `package.json`): created a 2 MC + 1 TF draft, uploaded a real PDF,
  generated through the real Gemini pipeline (one attempt hit a transient
  `503 UNAVAILABLE` "model overloaded" response — retried automatically
  and succeeded; not a code issue). Landed on the review page, approved a
  question and watched "0 / 3" become "1 / 3" live, approved a second then
  edited its text and correct answer through the real dialog — confirmed
  it reverted to "pending" and both the new text and new correct answer
  persisted through a full page reload. Deleted the third question
  (count → 2, no order gaps). Added a manual MC question (4 typed options)
  and a manual TF question (fixed True/False) through the real "Add
  question" dialog. Approved everything remaining and confirmed the "Ready
  for publishing" banner appeared — then reloaded the quiz detail page and
  confirmed `status` was still `draft`. Moved the first question down one
  position and confirmed the new order survived a reload.
- **Invalid input rejected server-side, through the real UI**: an MC
  submission with two identical option texts was rejected
  (`"...has duplicate answer options."`); one with an empty option was
  rejected (`"...has an empty answer option."`); neither created a row.
- **`validateQuestionShape` exercised directly** — the real production
  module, imported and run with Node's native TypeScript support (no
  mocking/reimplementation): 11 cases (valid MC, valid TF, wrong MC
  answer/correct counts, duplicate MC options, empty option, wrong TF
  answer/correct counts, non-"True"/"False" TF text, empty question text)
  — all 11 produced the expected result.
- **Cross-tenant isolation — RPCs and RLS directly, not just pages**: a
  second real teacher account attempted `add_quiz_question`,
  `update_quiz_question`, `delete_quiz_question`, and
  `reorder_quiz_questions` against the first teacher's quiz/question ids
  (all rejected with "not found or you do not have access to it"), a
  direct `questions` table update trying to self-approve the first
  teacher's question (RLS matched zero rows), and a direct `SELECT` of the
  first teacher's questions (zero rows). Re-read the first teacher's data
  afterward: unchanged. Also confirmed a real unauthenticated browser
  context gets redirected to `/login` on the review URL, and Teacher B
  gets a real `404` opening Teacher A's review page directly.
- **Answer integrity**: every question in the test quiz had exactly the
  right answer/correct-answer count for its type after every mutation —
  orphaning is additionally structurally impossible via `answers.
  question_id`'s `ON DELETE CASCADE` (verified live back in Phase 1).
- **Discovered and documented (not fixed)**: `service_role` has no table
  grants on this project either — same "RLS needs an explicit GRANT"
  finding as Phase 2, just never exercised before since no phase through
  Phase 4 ever called `.from()` on a `public.*` table with the admin
  client. This will matter for a future phase (student-facing writes via
  the admin client) — see docs/database.md "Table privileges" for the
  full writeup. Test scripts were rewritten to use the real authenticated
  teacher client instead, which needed no such grant.
- **No secret leakage**: re-checked a fresh production build's
  `.next/static` for both `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` —
  zero matches.
- **Cleanup**: deleted both temporary teacher accounts and their Storage
  objects via the Admin API (deleting the teacher with quiz data required
  first deleting her `quizzes` rows directly, same transient
  `deleteUser()` cascade-depth issue as Phase 4). Confirmed the database
  and bucket afterward contain only the one pre-existing real teacher
  account and quiz. All temporary scripts, the temporary test PDF, and the
  temporary `pdfkit`/`playwright` dev tools were removed — neither was
  added to `package.json`.

**Validation:**

- `npx tsc --noEmit` — no errors.
- `npm run lint` — clean.
- `npm run build` — succeeds; `/quizzes/[id]/review` appears in the route
  list.
- `npm run lint:sql` — all 6 migrations (including the new one) parse as
  valid Postgres SQL.

**Manually verify:**

- Open a draft quiz with generated questions, approve/edit/delete/reorder
  a few, and confirm the "X / N reviewed" header and "Ready for
  publishing" banner behave as expected.
- Add a question manually (both Multiple Choice and True/False) on a quiz
  that has never had a PDF uploaded — confirm it's reachable without
  generation.
- Try submitting a Multiple Choice question with duplicate options or an
  empty option — confirm a specific, non-generic error and that the
  dialog doesn't silently save anything.
- Confirm the quiz never leaves `draft` no matter how much of the review
  workflow is completed — there's no publish button yet by design.

**Manual Supabase configuration required:** none. The column and RPCs
were created via migration, not the Dashboard.
