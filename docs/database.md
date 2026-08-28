# Database

**Status:** implemented in Phase 1 as SQL migrations under
`supabase/migrations/`:

- `20260829120000_create_core_schema.sql` — tables, indexes, constraints,
  triggers.
- `20260829120100_enable_rls.sql` — Row Level Security policies.

**Not yet verified against a live Postgres instance.** No Supabase project
was configured when these migrations were written (no Docker/local Postgres
was available in the dev environment either), so they have been validated
the best way available short of that: parsed statement-by-statement with
`libpg-query` (the real Postgres grammar, via `npm run lint:sql`) to catch
syntax errors, and reviewed by hand for logic. They have **not** been
executed against a real database. The first `supabase db push` (or running
them via the Supabase SQL editor) is the real test — see
[development-progress.md](./development-progress.md) Phase 1 for exactly
what to watch for.

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

Applied via the Supabase CLI (`supabase link` then `supabase db push`) once
a project exists, or pasted into the Supabase SQL editor. Run
`npm run lint:sql` first — it parses every file in `supabase/migrations/`
with the real Postgres grammar (`libpg-query`) and fails fast on a syntax
error, without needing a live database.
