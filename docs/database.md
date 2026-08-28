# Database

**Status:** implemented in Phase 1, with one Phase 2 follow-up fix, and
**applied to the real Supabase project** via `npx supabase db push`
(2026-08-29). Phase 3 (quiz creation) required **no schema change** — it
writes real rows into the existing `quizzes` table under the existing RLS.
SQL migrations live under `supabase/migrations/`:

- `20260829120000_create_core_schema.sql` — tables, indexes, constraints,
  triggers.
- `20260829120100_enable_rls.sql` — Row Level Security policies.
- `20260829120200_grant_teacher_table_privileges.sql` — table-level `GRANT`s
  for the `authenticated` role (Phase 2 fix — see "Table privileges" below).

`npx supabase migration list` confirms all three are recorded as applied on
the remote (local and remote timestamps match). Everything below was
independently re-verified by querying the live database directly
(`supabase db query --linked`) — not just re-reading the migration files —
including a functional test of the deferred answer-count trigger (insert
invalid/valid answer sets inside a transaction, then roll back) and a real
teacher login against the deployed app. See
[development-progress.md](./development-progress.md) Phase 1 and Phase 2
for the full verification logs and exact results.

## Table privileges — a Phase 1 gap fixed in Phase 2

RLS policies only ever apply *after* Postgres checks whether the connecting
role has the underlying table-level `GRANT` for that operation at all.
Phase 1 assumed Supabase's usual behavior of auto-exposing new
public-schema tables to the `anon`/`authenticated` PostgREST roles, with
RLS as the only real gate. **That assumption was wrong for this project**:
verified directly (Phase 2) that `authenticated` and `anon` had only
`REFERENCES`/`TRIGGER`/`TRUNCATE` on every table — no `SELECT`, so every
PostgREST request was rejected with `permission denied for table ...`
before RLS was ever evaluated. This was caught by a real end-to-end login
test against the deployed app, not by re-reading the schema.

`20260829120200_grant_teacher_table_privileges.sql` grants `authenticated`
exactly the operations its existing RLS policies already allow — no more:

| Table | Grant |
|---|---|
| `quizzes`, `questions`, `answers` | `SELECT, INSERT, UPDATE, DELETE` |
| `profiles` | `SELECT, UPDATE` (no `INSERT` — rows are created only by `handle_new_user()`) |
| `participants`, `quiz_sessions`, `responses` | `SELECT` only |

`anon` receives **no grants on any of these tables** — students never call
Supabase directly from the browser, so there is nothing for `anon` to need.
RLS itself, its 17 policies, and every ownership rule are unchanged by this
migration; it only unblocks the access those policies already described.

## Principles

- UUID primary keys (`gen_random_uuid()`, built into Postgres 13+ — no
  extension needed).
- Explicit foreign keys with `ON DELETE CASCADE` from a quiz down through
  its questions/answers/participants/sessions/responses — deleting a quiz
  cleans up everything that belongs to it.
- `created_at`/`updated_at` timestamps on tables where edits happen,
  `updated_at` maintained by a shared trigger (`set_updated_at()`).
- `CHECK` constraints enforce what Postgres can verify per-row cheaply
  (status/type enums, non-negative counts, `total_questions =
  multiple_choice_count + true_false_count`, non-empty text).
- The one cross-row invariant that matters most to the product — a
  `multiple_choice` question has exactly 4 answers with exactly 1 marked
  correct, a `true_false` question has exactly 2 with exactly 1 correct —
  is enforced by a **deferred constraint trigger** on `answers`
  (`validate_question_answers_trigger`), not a plain `CHECK`, because
  Postgres `CHECK` can't see other rows. It's deferred to transaction commit
  so a question's answers can be inserted as one batch. This is a backstop
  behind Zod + application validation (Phase 4/5) — not a replacement for
  it.
- Two `unique (..., order_index)` constraints (`questions`, `answers`) are
  `deferrable initially deferred` for the same reason: reordering updates
  several rows' `order_index` in one transaction, which can transiently
  collide mid-transaction. **Implication for later phases:** a reorder (or
  a "set this answer as correct" toggle that must clear the old one) needs
  to happen as a single statement/transaction — e.g. a Postgres RPC
  function, or a single batched `upsert()` — not as several independent
  `update()` calls from the client SDK.
- Row Level Security (RLS) is enabled on every table.

## Tables

### `profiles`

Extends `auth.users` with app-specific teacher profile data. A row is
created automatically by the `handle_new_user()` trigger on `auth.users`
insert — application code never inserts into `profiles` directly.

| Column     | Type        | Notes                              |
| ---------- | ----------- | ----------------------------------- |
| id         | uuid PK     | = `auth.users.id`, `ON DELETE CASCADE` |
| full_name  | text        | from `auth.users.raw_user_meta_data->>'full_name'` |
| created_at | timestamptz | default `now()`                     |

### `quizzes`

| Column                  | Type        | Notes                                             |
| ----------------------- | ----------- | -------------------------------------------------- |
| id                      | uuid PK     |                                                      |
| teacher_id              | uuid FK     | → `profiles.id`, `ON DELETE CASCADE`                |
| title                   | text        | not null, non-empty                                 |
| description             | text        | nullable                                            |
| status                  | text        | `draft` \| `published` \| `closed`, default `draft` |
| total_questions         | int         | `CHECK (total_questions = multiple_choice_count + true_false_count)` |
| multiple_choice_count   | int         | default 0, `>= 0`                                   |
| true_false_count        | int         | default 0, `>= 0`                                   |
| source_pdf_path         | text        | Supabase Storage object path, nullable              |
| starts_at               | timestamptz | nullable until scheduled                            |
| ends_at                 | timestamptz | nullable; `CHECK (ends_at > starts_at)` when both set |
| duration_minutes        | int         | nullable; `> 0` when set                            |
| access_code             | text        | unique (nullable — many drafts can share `null`)    |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger                  |
| published_at            | timestamptz | nullable                                            |

Indexes: `quizzes (teacher_id)`, `quizzes (status)`.

### `questions`

| Column         | Type    | Notes                                    |
| -------------- | ------- | ------------------------------------------ |
| id             | uuid PK |                                             |
| quiz_id        | uuid FK | → `quizzes.id`, `ON DELETE CASCADE`        |
| type           | text    | `multiple_choice` \| `true_false`          |
| question_text  | text    | not null, non-empty                        |
| order_index    | int     | position within the quiz                    |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

Constraint: `unique (quiz_id, order_index) deferrable initially deferred`.
Index: `questions (quiz_id)`. Changing a question's `type` after it has
answers is not supported at the application layer (avoids needing a second
DB-level invariant check for a rare edit).

### `answers`

| Column       | Type    | Notes                                                        |
| ------------ | ------- | -------------------------------------------------------------- |
| id           | uuid PK |                                                                  |
| question_id  | uuid FK | → `questions.id`, `ON DELETE CASCADE`                          |
| answer_text  | text    | not null, non-empty                                             |
| is_correct   | boolean | not null, default `false`                                       |
| order_index  | int     | canonical stored order (session-time display order is separate) |
| created_at   | timestamptz | default `now()`                                             |

Constraint: `unique (question_id, order_index) deferrable initially
deferred`. Indexes: `answers (question_id)`, plus a partial index
`answers (question_id) where is_correct` for fast correct-answer lookups
during grading.

Enforced by `validate_question_answers_trigger` (see Principles above):
exactly 4 answers with exactly 1 `is_correct = true` for `multiple_choice`
questions; exactly 2 answers with exactly 1 `is_correct = true` for
`true_false` questions.

### `participants`

A student's identity for one quiz — no `auth.users` row.

| Column      | Type        | Notes                          |
| ----------- | ----------- | -------------------------------- |
| id          | uuid PK     |                                   |
| quiz_id     | uuid FK     | → `quizzes.id`, `ON DELETE CASCADE` |
| first_name  | text        | not null, non-empty              |
| last_name   | text        | not null, non-empty              |
| created_at  | timestamptz | default `now()`                  |

Index: `participants (quiz_id)`.

### `quiz_sessions`

| Column          | Type        | Notes                                                     |
| --------------- | ----------- | ------------------------------------------------------------ |
| id              | uuid PK     |                                                                |
| quiz_id         | uuid FK     | → `quizzes.id`, `ON DELETE CASCADE`                           |
| participant_id  | uuid FK     | → `participants.id`, `ON DELETE CASCADE`                      |
| session_token   | text        | unique, secure random — the student's bearer credential       |
| status          | text        | `started` \| `in_progress` \| `completed` \| `expired`         |
| question_order  | jsonb       | persisted per-session shuffle: question + answer display order, default `[]` |
| started_at      | timestamptz | default `now()`                                                |
| completed_at    | timestamptz | nullable; `CHECK (completed_at >= started_at)`                 |
| expires_at      | timestamptz | not null — computed server-side from `quizzes.duration_minutes` |
| score           | numeric(5,2)| nullable, `0–100`                                              |
| correct_answers | int         | nullable, `>= 0`                                               |
| total_questions | int         | not null, `>= 0`                                               |
| created_at      | timestamptz | default `now()`                                                |

Indexes: `quiz_sessions (quiz_id)`, `quiz_sessions (participant_id)`.
Deliberately no `unique (quiz_id, participant_id)` — the MVP hasn't decided
the re-entry policy yet (Phase 7); enforce whatever is decided in
application code once it is.

### `responses`

| Column               | Type        | Notes                                       |
| -------------------- | ----------- | ---------------------------------------------- |
| id                    | uuid PK     |                                                  |
| session_id            | uuid FK     | → `quiz_sessions.id`, `ON DELETE CASCADE`       |
| question_id           | uuid FK     | → `questions.id`, `ON DELETE CASCADE`           |
| selected_answer_id    | uuid FK     | → `answers.id`, `ON DELETE SET NULL`, nullable  |
| is_correct            | boolean     | not null, computed server-side, never trusted from client |
| answered_at           | timestamptz | default `now()`                                 |
| time_spent_seconds    | int         | nullable, `>= 0`                                |

Constraint: `unique (session_id, question_id)` — one response per question
per session. Indexes: `responses (session_id)`, `responses (question_id)`.

## Row Level Security (implemented policies)

Two SQL helper functions do the ownership check so it isn't repeated
verbatim in eight different policies: `public.is_quiz_owner(quiz_id)` and
`public.is_question_owner(question_id)` — both `security invoker`, `stable`,
`search_path = ''`, fully schema-qualified.

- **`profiles`** — `select`/`update` where `id = auth.uid()`. No
  insert/delete policy: rows are created only by the `handle_new_user()`
  trigger (runs as the function owner) and removed only via the
  `auth.users` cascade.
- **`quizzes`** — full CRUD (`select`/`insert`/`update`/`delete`) where
  `teacher_id = auth.uid()`.
- **`questions`**, **`answers`** — full CRUD scoped transitively through
  quiz (`is_quiz_owner`) / question→quiz (`is_question_owner`) ownership.
- **`participants`**, **`quiz_sessions`**, **`responses`** — `select`-only,
  scoped to quizzes the teacher owns (for results/analytics in later
  phases). **No insert/update/delete policy exists for `authenticated` or
  `anon`** — every student-facing write goes through server-side code using
  the service-role ("secret key") admin client
  (`src/lib/supabase/admin.ts`), which bypasses RLS by design. Students
  never talk to Supabase directly from the browser, so there's no
  `auth.uid()` for a student-scoped RLS policy to key off in the first
  place — authorization for those writes is the calling server code's job
  (validate the session token, check expiry, etc.), not Postgres's.

## Access patterns (implemented)

Three client factories in `src/lib/supabase/`:

- **`server.ts`** — `createClient()`, cookie-bound via `@supabase/ssr`,
  respects RLS. Default for teacher-facing Server Components/Actions/Route
  Handlers.
- **`client.ts`** — `createClient()` for Client Components (e.g. the Phase
  2 login form). Reads `NEXT_PUBLIC_*` env vars directly.
- **`admin.ts`** — `createAdminClient()`, service-role key, bypasses RLS.
  Server-only; for student-facing operations and any trusted server job
  that must legitimately cross teacher boundaries.

`src/lib/env.ts` validates all required environment variables with Zod
before any of the above run, and fails with one readable error listing
every missing/invalid variable — see
[architecture.md](./architecture.md#environment-configuration).

## Migrations

Applied via the Supabase CLI (`supabase link` then `supabase db push`). All
three migrations are live on the real project as of 2026-08-29 — confirmed
by `npx supabase migration list` (local/remote timestamps match) and by
querying the remote schema directly. Run `npm run lint:sql` before pushing
any future migration — it parses every file in `supabase/migrations/` with
the real Postgres grammar (`libpg-query`) and fails fast on a syntax error
without needing a live database.

## Live verification (2026-08-29)

Every item below was checked against the real remote database via
`supabase db query --linked`, not inferred from the migration files:

- All 7 tables exist with `id uuid` primary keys.
- All 10 foreign keys present with the exact `ON DELETE` behavior specified
  above (9 `CASCADE`, 1 `SET NULL` on `responses.selected_answer_id`),
  including `profiles.id → auth.users.id`.
- All `timestamptz` columns, defaults (`now()`, `'draft'`, `'started'`, `0`),
  and nullability match the migration exactly.
- All indexes present, including the partial `answers (question_id) WHERE
  is_correct` index and both deferrable unique `(*, order_index)`
  constraints (confirmed `deferrable = true`, `initially deferred = true`
  at the trigger level).
- All `CHECK` constraints present, including
  `quizzes_question_counts_match`.
- RLS is enabled (`relrowsecurity = true`) on all 7 tables.
- All 17 policies present and scoped to the `authenticated` role only (no
  `anon` policy exists anywhere) — 2 on `profiles`, 4 each on `quizzes` /
  `questions` / `answers` (full CRUD via `is_quiz_owner()` /
  `is_question_owner()`), and exactly 1 `select`-only policy each on
  `participants` / `quiz_sessions` / `responses`, with **no**
  insert/update/delete policy on those three tables for any role — every
  student-facing write is required to go through `src/lib/supabase/admin.ts`.
- `is_quiz_owner()` / `is_question_owner()` are `security invoker`,
  `stable`, `search_path = ''`; `handle_new_user()` is `security definer`,
  `search_path = ''`.
- **Functional test of `validate_question_answers_trigger`**, run inside a
  transaction that was rolled back afterward (a throwaway `auth.users` row,
  quiz, questions, and answer sets — nothing persisted): a `multiple_choice`
  question with 3 answers was rejected, one with 4 answers/2 correct was
  rejected, one with exactly 4 answers/1 correct was accepted; a
  `true_false` question with 2 correct answers was rejected, one with
  exactly 1 correct was accepted. All 5 cases matched the expected
  behavior. Row counts on `profiles`/`quizzes`/`questions`/`answers`/
  `auth.users` were confirmed at 0 immediately after — no residual data.

Not independently tested (at Phase 1 time): cross-teacher isolation via two
real authenticated sessions (the verification connection runs as a
privileged role that bypasses RLS, so it can't simulate "logged in as
teacher A vs. B"). Ownership was instead verified by reading each policy's
predicate directly (`teacher_id = auth.uid()` / `is_quiz_owner(...)` /
`is_question_owner(...)`).

## Live verification — Phase 2 grant fix (2026-08-29)

Phase 2's teacher login/dashboard surfaced the missing-grants gap described
above (a real `signInWithPassword` + PostgREST query returned
`permission denied for table profiles`). After applying
`20260829120200_grant_teacher_table_privileges.sql`, re-verified against
the live database:

- `authenticated` has exactly the grants in the table above on all 7
  tables — checked via `information_schema.role_table_grants`.
- `anon` is unchanged: still only `REFERENCES`/`TRIGGER`/`TRUNCATE` on
  every table, confirming no privilege was accidentally widened for the
  unauthenticated role.
- RLS is still enabled on all 7 tables and the policy count is still
  exactly **17** — the grant migration touched permissions only, not RLS.
- **Real teacher login**, end to end, against the running app (not just the
  Supabase SDK in isolation): submitted the actual `/login` form (the real
  Server Action, with its real bound state and action id extracted from
  the rendered page — not a mocked request) using a temporary test teacher
  account, received a `303` redirect to `/dashboard` with a real session
  cookie, then loaded `/dashboard`, `/quizzes`, `/results`, and `/settings`
  with that cookie. Before the grant fix, the profile name silently fell
  back to the account's email (a real value, not fake, but not the actual
  answer) and every count/list silently showed `0`/empty due to the
  swallowed permission error. After the fix, `/dashboard` and `/settings`
  correctly showed the teacher's real name and account creation date from
  `profiles`, and `/quizzes`/`/results` correctly queried (and got a
  genuine empty result, not a permission error) since the test account had
  no quizzes.
- **Error handling verified, not just reviewed**: temporarily pointed a
  page's query at a nonexistent table name (a code-only change, no
  database access changed) to force a real Postgrest error, confirmed the
  request now returns `500` instead of a fake `200`/"No quizzes yet", then
  reverted the code. Confirms `src/lib/supabase/assert-no-error.ts` (added
  in this fix) actually throws on a real query error instead of letting it
  flow through as an empty/zero state.
- The temporary test teacher account (and its auto-created `profiles` row)
  was deleted via the Admin API after verification; `auth.users` and every
  application table were confirmed back at their pre-test row counts.

Still not independently tested at Phase 2 time: live cross-teacher
isolation via two concurrently authenticated sessions (the verification
tooling didn't yet run as two distinct `authenticated` users at once) —
this gap was closed in Phase 3 (below).

## Live verification — Phase 3 quiz creation (2026-08-29)

No migration in this phase — `quizzes` and its RLS policies/grants are
unchanged. Verification focused on proving the existing schema now holds
up under real writes, real edits, and a real cross-tenant attack attempt,
using two temporary teacher accounts (both deleted afterward).

- **`quizzes_question_counts_match` re-verified functionally**, inside a
  rolled-back transaction: a direct insert with `multiple_choice_count: 7,
  true_false_count: 3, total_questions: 999` (bypassing the application's
  own Zod validation entirely) was rejected with
  `violates check constraint "quizzes_question_counts_match"`; the matching
  valid row (`total_questions: 10`) was accepted. Nothing persisted after
  `ROLLBACK`.
- **Real create → edit → delete cycle**, through the actual app (the real
  `/quizzes/new` and `/quizzes/[id]/edit` Server Actions, not a direct SDK
  call): created a quiz as 7 MC + 3 TF, confirmed `total_questions = 10`
  and `status = 'draft'` in the database; edited it to 5 MC + 5 TF plus a
  45-minute time limit and confirmed the change persisted; deleted it and
  confirmed the row was gone.
- **Cross-tenant isolation — now tested with two real concurrent
  sessions**, closing the Phase 1/2 gap: Teacher A created a quiz; Teacher
  B (a second, independent authenticated session) got `404` loading both
  `/quizzes/[id]` and `/quizzes/[id]/edit` for it (RLS makes another
  teacher's row indistinguishable from a nonexistent one). Went one level
  deeper than the app layer: called the PostgREST API directly with
  Teacher B's own access token — `SELECT`, `UPDATE`
  (`{"title":"HACKED BY TEACHER B"}`), and `DELETE` on Teacher A's quiz id
  all returned `[]` (zero rows matched, so nothing changed) with `HTTP
  200`. Re-read the row afterward and confirmed the title and status were
  untouched. The same quiz, deleted by its actual owner (Teacher A) via
  the same REST path, succeeded normally — the boundary is ownership, not
  a blanket lockout.
- Both temporary teacher accounts were deleted afterward via the Admin
  API; `auth.users`/`profiles`/`quizzes`/`participants` were all confirmed
  back to `0` rows.
