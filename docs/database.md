# Database

**Status:** implemented in Phase 1, with one Phase 2 follow-up fix, and
**applied to the real Supabase project** via `npx supabase db push`
(2026-08-29). Phase 3 (quiz creation) required **no schema change** — it
writes real rows into the existing `quizzes` table under the existing RLS.
Phase 4 (PDF + Gemini) added Storage configuration and one new Postgres
function — no `quizzes`/`questions`/`answers` table/column changes; the
`source_pdf_path` column it uses already existed from Phase 1. Phase 5
(question review) added one column (`questions.review_status`) and four
new Postgres functions for atomic question add/edit/delete/reorder — no
new tables, and `quizzes.status`'s check constraint is untouched ("ready
for publishing" is computed, never persisted — see architecture.md).
Phase 6 (publishing) required **no schema change at all** —
`quizzes.status`'s existing `'published'` value, `published_at`, `ends_at`
(the deadline), and `access_code` (reused as the opaque student token)
were all added back in Phase 1 and sat unused until now. Phase 6's
student-facing half (`/join/{token}`, participants, quiz_sessions) is
**not implemented** — blocked on a `service_role` grant decision, see
"service_role privileges" below. SQL migrations live under
`supabase/migrations/`:

- `20260829120000_create_core_schema.sql` — tables, indexes, constraints,
  triggers.
- `20260829120100_enable_rls.sql` — Row Level Security policies.
- `20260829120200_grant_teacher_table_privileges.sql` — table-level `GRANT`s
  for the `authenticated` role (Phase 2 fix — see "Table privileges" below).
- `20260829120300_quiz_pdfs_storage.sql` — the `quiz-pdfs` Storage bucket
  and its `storage.objects` RLS policies (Phase 4).
- `20260829120400_create_quiz_questions_rpc.sql` — `create_quiz_questions()`,
  the atomic question-batch insert Gemini generation writes through
  (Phase 4).
- `20260830120000_add_question_management.sql` — `questions.review_status`
  column, plus `add_quiz_question()`/`update_quiz_question()`/
  `delete_quiz_question()`/`reorder_quiz_questions()` (Phase 5).

`npx supabase migration list` confirms all six are recorded as applied on
the remote (local and remote timestamps match). Everything below was
independently re-verified by querying the live database directly
(`supabase db query --linked`) — not just re-reading the migration files —
including a functional test of the deferred answer-count trigger (insert
invalid/valid answer sets inside a transaction, then roll back), a real
teacher login against the deployed app, and (Phase 4/5) real PDFs/questions
uploaded and processed through the actual running application. See
[development-progress.md](./development-progress.md) Phase 1–5 for the
full verification logs and exact results.

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

### `service_role` privileges — discovered in Phase 5, re-verified and scoped in Phase 6, still not fixed

While writing Phase 5's test/verification scripts, a direct
`admin.from("questions").select(...)` call (using the `SUPABASE_SECRET_KEY`
client) failed with `permission denied for table questions`, with
PostgREST's own hint suggesting `GRANT SELECT ON public.questions TO
service_role`. Verified directly: `service_role` has `rolbypassrls = true`
(so RLS itself is correctly bypassed) but **zero rows** in
`information_schema.role_table_grants` for the `public` schema — this
project's "no auto-grant" behavior (see above) apparently applies to
`service_role` too, not just `anon`/`authenticated`.

This has never surfaced as a bug because no phase through Phase 5 ever
calls `.from()` on a `public.*` table with the admin client — Phase 1–5's
admin-client usage is entirely `auth.admin.*` (user management) and
`storage.*` (bucket objects), neither of which is gated by these table
grants. Phase 5's test scripts hit it purely as a verification convenience
and were rewritten to use the real authenticated teacher client instead
(which already has the grants it needs).

**Phase 6 was explicitly required to re-verify this before building
student-facing participant/session creation, and to STOP rather than
build that functionality (or apply a grant) if the privileges were
missing.** Re-ran the exact same live check
(`information_schema.role_table_grants` filtered to `grantee =
'service_role'`) — still zero `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants
on any table, confirmed unchanged. Per that instruction, the public
`/join/{token}` route and participant/session creation were **not
built** in Phase 6 — see [architecture.md](./architecture.md) → "Student
access — blocked pending a service_role grant decision".

**Current privileges (`service_role`, every table):** `REFERENCES`,
`TRIGGER`, `TRUNCATE` only.

**Required privileges for the student flow Phase 7 will build**, scoped
to exactly what that flow needs and nothing more:

| Table | Grant needed | Why |
|---|---|---|
| `quizzes` | `SELECT` | The public join page has no Supabase session (no `authenticated` role) — reading a quiz by `access_code`, checking `status = 'published'` and the deadline, and showing its composition/time limit can only happen through the service-role client. |
| `participants` | `SELECT`, `INSERT` | Create the student's participant row; `SELECT` is needed for PostgREST to return the inserted row (`.select()` after `.insert()`). |
| `quiz_sessions` | `SELECT`, `INSERT` | Create the session row referencing the quiz + participant; same `.select()`-after-`.insert()` reasoning. |

**Deliberately NOT proposed yet:** `UPDATE` on `participants`/
`quiz_sessions` (nothing in the planned student-join flow updates either
after creation) and anything on `responses`/`questions`/`answers`
(Phase 6/7's join flow doesn't touch responses at all — that's the actual
quiz-taking phase). Granting ahead of actual need is exactly what "do not
blindly grant permissions" rules out; the table above should be revisited
and extended (not re-derived from scratch) when the phase that needs
`responses`/session updates is actually built.

**Proposed minimal migration (NOT applied — pending an explicit decision):**

```sql
grant select on public.quizzes to service_role;
grant select, insert on public.participants to service_role;
grant select, insert on public.quiz_sessions to service_role;
```

This does not touch RLS at all — `service_role` already has
`rolbypassrls = true`, so once granted, no policy changes are needed or
proposed. It also does not touch `anon`'s or `authenticated`'s grants,
and does not add a new RLS policy anywhere (an `anon`-facing `SELECT`
policy on `quizzes` was considered and rejected as the wrong shape for
this project — see architecture.md — since it would create public
enumeration surface a service-role-only read does not).

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
| review_status  | text    | `pending` \| `approved`, default `pending` (Phase 5) |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

Constraint: `unique (quiz_id, order_index) deferrable initially deferred`.
Index: `questions (quiz_id)`. As of Phase 5, changing a question's `type`
(MC ↔ TF) **is** supported — `update_quiz_question()` replaces the whole
answer set and adjusts `quizzes.multiple_choice_count`/`true_false_count`
atomically in the same statement; see "Question management RPCs" below.

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

## Storage and RPC (Phase 4)

**`quiz-pdfs` bucket** — private (`public = false`), `application/pdf`
only, 8 MB `file_size_limit`. Objects live at `{teacher_id}/{quiz_id}.pdf`;
re-uploading the same quiz's PDF overwrites it (`upsert: true`). Four RLS
policies on `storage.objects` (`quiz_pdfs_select_own` / `_insert_own` /
`_update_own` / `_delete_own`), each requiring
`(storage.foldername(name))[1] = auth.uid()::text` — the same
one-folder-per-owner pattern as every other teacher-scoped table, just
applied to Storage's own RLS-enabled table instead of an app table. No
public/signed URL exists anywhere in this flow; every read/write goes
through the authenticated server client.

**`create_quiz_questions(p_quiz_id uuid, p_questions jsonb) returns setof
questions`** — the atomic batch-insert Gemini-validated questions go
through. `security invoker`, so it runs as the calling teacher and is
still subject to the existing `questions`/`answers` RLS insert policies —
it doesn't bypass anything, it just batches per-row inserts the caller
could already do into one transaction. Raises (rolling back everything)
if the caller doesn't own the quiz, or if the quiz already has questions.
Explicitly granted `EXECUTE` to `authenticated` in the same migration
(functions get `EXECUTE` granted to `PUBLIC` by default in Postgres,
unlike tables — confirmed this still held here rather than assuming it,
same discipline as the Phase 2 table-grants lesson).

## Question management RPCs (Phase 5)

All four are `security invoker`, `set search_path = ''`, and explicitly
`grant execute ... to authenticated` (same discipline as
`create_quiz_questions` above). Each re-derives ownership itself via
`is_quiz_owner()`/`is_question_owner()` and refuses if the quiz isn't a
draft — this is the real security boundary, independent of whatever
`quizId`/`questionId` a client sends.

- **`add_quiz_question(p_quiz_id uuid, p_question jsonb) returns
  questions`** — inserts the question + answers at the next `order_index`,
  then adjusts `quizzes.multiple_choice_count`/`true_false_count`/
  `total_questions` in the same statement. New questions always start
  `review_status = 'pending'`.
- **`update_quiz_question(p_question_id uuid, p_question jsonb) returns
  questions`** — replaces the answer set (delete + reinsert) and the
  question row, resets `review_status` to `'pending'` (the previously-
  approved content no longer exists), and — only if the type changed —
  shifts `multiple_choice_count`/`true_false_count` by one each, all in
  one statement.
- **`delete_quiz_question(p_question_id uuid) returns void`** — deletes
  the question (answers cascade via the existing FK), resequences the
  quiz's remaining questions' `order_index` to stay contiguous using a
  single `UPDATE ... FROM (SELECT ... row_number() ...)`, then decrements
  the matching counter. The resequencing update relies on `questions`'
  `unique (quiz_id, order_index) deferrable initially deferred` constraint
  from Phase 1 tolerating the transient duplicate order values it produces
  mid-statement.
- **`reorder_quiz_questions(p_quiz_id uuid, p_question_ids uuid[]) returns
  setof questions`** — validates the array is exactly the quiz's current
  question ids (right count, no duplicates, no foreign ids) before
  assigning a full new `order_index` set in one `UPDATE ... FROM
  unnest(...) WITH ORDINALITY` statement — never a sequence of per-row
  updates that could transiently violate the same deferred unique
  constraint outside the statement's own transaction.

None of the four touch `quizzes.status` or its check constraint —
"ready for publishing" is computed application-side from
`questions.review_status`, never written back to `quizzes`.

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

## Live verification — Phase 4 PDF + Gemini generation (2026-08-29)

No migration changed `quizzes`/`questions`/`answers` — verification
focused on the new Storage bucket, the new RPC, and a real PDF processed
end to end through the actual running app (not a script calling Supabase
directly, except where noted).

- **Real Gemini call, real PDF**: generated a genuine multi-section
  educational PDF (the water cycle) and sent it through the actual
  extraction pipeline (`gemini-flash-latest`, the real prompt and
  `responseJsonSchema`). Got back exactly 10 questions — exactly 7
  `multiple_choice` (4 answers, 1 correct each) and exactly 3
  `true_false` (2 answers — literally "True"/"False" — 1 correct each) —
  every question and distractor traceable to the PDF's actual content, no
  fabricated facts observed.
- **Full app flow via a real browser** (Playwright/Chromium, not curl —
  the upload/generate actions are plain async function calls from a
  Client Component, not `<form action>` submissions, so there's no static
  hidden-field action reference to replay the way earlier phases did):
  logged in as a real teacher, created a 7 MC + 3 TF draft through the
  real `/quizzes/new` form, uploaded the PDF through the real file input,
  clicked "Upload & generate", and watched it reach "Generated 10
  questions." The count persisted after a full page reload.
- **Database records match exactly**: queried `questions`/`answers`
  directly — 7 rows with `type = 'multiple_choice'` at `order_index`
  0–6, each with exactly 4 answers and exactly 1 `is_correct = true`; 3
  rows with `type = 'true_false'` at `order_index` 7–9, each with
  exactly 2 answers and exactly 1 correct.
- **Invalid file handling**: a non-PDF file (wrong extension) was
  rejected client-side immediately ("Only PDF files are supported.") with
  no network request. A file named `*.pdf` but containing garbage bytes
  (browsers infer MIME type from the extension, so this one passes the
  client-side check) was correctly rejected **server-side** by the
  magic-byte check — "This file doesn't look like a valid PDF." — proving
  the server never trusts the client-reported type alone.
- **Duplicate-generation guard, both layers**: the app-level check
  (queries the questions count before ever calling Gemini) is what a
  teacher hits in the UI — confirmed the upload/generate controls
  disappear entirely once a quiz has questions, replaced by a "Clear
  generated questions" summary. Went a layer deeper and called
  `create_quiz_questions` directly via PostgREST with the real owning
  teacher's access token on a quiz that already had 10 questions — it
  raised `"This quiz already has generated questions..."` and the
  question count stayed at exactly 10 (no partial/duplicate row).
  Regenerating after an explicit clear worked cleanly (10 fresh questions,
  no leftovers from the previous batch).
- **Storage security, positive and negative**: Teacher A downloaded her
  own uploaded PDF successfully (3043 bytes, matching the original file
  exactly) and could list her own folder. Teacher B's session, given
  Teacher A's exact storage path, got `Object not found` on download and
  an empty array listing Teacher A's folder — RLS makes another teacher's
  file invisible, not merely "access denied" (same pattern as every other
  cross-tenant check in this project).
- **No secret leakage**: re-ran the `.next/static` grep for
  `SUPABASE_SECRET_KEY` and, for the first time, `GEMINI_API_KEY` (its
  first real usage) after a Phase 4 production build — zero matches for
  either.
- **Cleanup**: removed the two temporary teacher accounts and their
  Storage objects (Storage objects are **not** cascade-deleted by the
  `auth.users` foreign key — they were removed explicitly before deleting
  the users) via the Admin API. Confirmed afterward: `auth.users` and
  `quizzes` contain only the one pre-existing real account and its own
  quiz, untouched throughout; the `quiz-pdfs` bucket is empty.

## Live verification — Phase 5 question review (2026-08-30)

Migration `20260830120000_add_question_management.sql` applied via
`npx supabase db push` and independently re-verified against the live
database: `questions.review_status` exists (`text`, `not null`, default
`'pending'::text`); all four new functions (`add_quiz_question`,
`update_quiz_question`, `delete_quiz_question`, `reorder_quiz_questions`)
show `security_type = 'INVOKER'` in `information_schema.routines` and have
`EXECUTE` granted to `authenticated` in `information_schema.
routine_privileges`. RLS remained enabled on all 7 tables and all 17
pre-existing policies were unchanged (row counts confirmed before and
after this phase).

Full flow tested through the real, built application (a fresh Turbopack
dev server — an earlier long-lived one from an old session predated these
files and gave stale/inconsistent results until restarted, a reminder that
new routes/Server Action files sometimes need a hard dev-server restart,
not just HMR) using two temporary teacher accounts and a real Gemini call:

- **Real generation → review → approve**: created a 2 MC + 1 TF draft,
  uploaded a real PDF, generated questions through the actual Gemini
  pipeline (retried automatically past one transient `503 UNAVAILABLE`
  "model overloaded" response — not a code issue), landed on
  `/quizzes/[id]/review` showing "0 / 3 reviewed". Approving a question
  updated the header to "1 / 3 reviewed" live.
- **Edit resets approval**: approved a second question, then edited its
  text and correct answer through the real dialog/Server Action — the
  question reverted to "pending" (progress dropped back to "1 / 3") and
  both the new text and new correct answer persisted through a full page
  reload.
- **Delete**: deleted the third question; count dropped to 2 with no
  gaps in `order_index` (resequenced by `delete_quiz_question`).
- **Manual add, both types**: added a Multiple Choice question (4 typed
  options, one marked correct) and a True/False question (fixed True/False
  options) through the real "Add question" dialog; both appeared as
  `pending` and both fed through the exact same `validateQuestionShape`
  rules a Gemini-generated question does.
- **Invalid input rejected server-side, through the real UI**: submitting
  an MC question with two identical option texts (case-insensitive) was
  rejected with `"...has duplicate answer options."`; submitting one with
  an empty option was rejected with `"...has an empty answer option."`.
  Neither attempt created a row (question count didn't change).
- **Invalid-shape unit coverage on the real module**: `validateQuestionShape`
  (the actual production function, imported and run directly with Node's
  native TypeScript support — not reimplemented/mocked) was exercised with
  11 cases: valid MC, valid TF, wrong MC answer count, 0 and 2 correct
  answers, duplicate MC options, empty option, wrong TF answer count, 0
  correct TF answers, non-"True"/"False" TF vocabulary, and empty question
  text — all 11 produced the expected accept/reject result.
- **Reorder**: moved the first question down one position through the
  real move-down button; the new order persisted through a full page
  reload.
- **Ready for publishing, without publishing**: approved every remaining
  question; the "Ready for publishing" banner appeared once (and only
  once) `reviewed count === question count`. Reloaded the quiz detail page
  immediately after — `status` was still `draft`, confirming Phase 5 never
  writes `published` anywhere.
- **Cross-tenant isolation — RPCs and RLS, not just pages**: with Teacher
  B authenticated as a real second account, direct calls (not through any
  UI) to `add_quiz_question`, `update_quiz_question`,
  `delete_quiz_question`, and `reorder_quiz_questions` against Teacher A's
  quiz/question ids all failed with `"...not found or you do not have
  access to it."`; a direct `questions` table `UPDATE` attempting to
  self-approve Teacher A's question matched zero rows (RLS, not the RPC
  layer, blocking it); a direct `SELECT` of Teacher A's questions returned
  zero rows. Re-read Teacher A's data afterward: same row count, same
  text, no `"Hijacked by Teacher B"` string anywhere.
- **Unauthenticated access**: a browser context with no session hitting
  `/quizzes/[id]/review` directly was redirected to `/login` (same
  `(admin)/layout.tsx` gate as every other admin route).
- **Answer integrity**: every question in the test quiz had exactly the
  right answer count (4 for MC, 2 for TF) and exactly 1 correct answer
  after every add/edit/delete in the run — no orphaned or malformed answer
  rows (orphaning is additionally structurally impossible via `answers.
  question_id`'s `ON DELETE CASCADE`, verified live back in Phase 1).
- **`service_role` table-grant gap discovered and documented, not
  fixed** — see "Table privileges" above. Test scripts were rewritten to
  use the real authenticated teacher client instead once this surfaced.
- **Cleanup**: both temporary teacher accounts and their Storage objects
  (the generated test PDF's uploads) were removed via the Admin API —
  deleting Teacher A required first deleting her `quizzes` rows directly
  (same transient `deleteUser()` cascade-depth issue seen in Phase 4,
  resolved the same way). Confirmed afterward: `auth.users` and `quizzes`
  contain only the one pre-existing real account and its own quiz; the
  `quiz-pdfs` bucket is empty for both temporary teacher ids.

## Live verification — Phase 6 quiz publishing (2026-08-29)

No migration this phase (see the status header above) — verification
focused on the publish action's authoritative server-side checks, the
access token, published-quiz immutability, and the `service_role`
privilege re-check, using two temporary teacher accounts.

- **`service_role` re-confirmed empty**: `information_schema.
  role_table_grants` for `grantee = 'service_role'` returned zero
  `SELECT`/`INSERT`/`UPDATE`/`DELETE` rows across every `public` table —
  same result as Phase 5's discovery, re-run fresh for Phase 6 as
  explicitly required before any student-facing code was written. See
  "service_role privileges" above for the proposed (not applied) grant.
- **Publish rejected on composition mismatch, for real**: a test quiz was
  (correctly, deliberately) seeded in a way that made
  `questions.length` (4) not match `quizzes.total_questions` (8) — the
  real `publishQuiz` action rejected it with "The quiz's questions don't
  match its configured composition," proving the composition check is
  live, not just present in the code. (This state came from a test-setup
  mistake — creating a quiz via the form with a non-zero target and then
  calling `add_quiz_question`, which increments from the existing count —
  not a product bug; the correct seeding pattern inserts the quiz at
  0/0/0 first.)
- **Publish accepted once genuinely ready**: a quiz correctly seeded at
  2 MC + 2 TF (4 real rows, `quizzes.multiple_choice_count/
  true_false_count/total_questions` all matching), all 4 approved via the
  real Phase 5 bulk-approve UI, published successfully through the real
  "Publish" button + confirmation dialog. `status` became `published`,
  `published_at` was set, and a real `access_code` was generated and
  persisted.
- **Access token verified opaque**: the generated token
  (`Cnoy5hCLgGHJUgrSh1L6Aj2rjp9M_-HQ`, 32 base64url characters) is neither
  the quiz's UUID nor derived from it, and was shown in a real "Student
  access link" box with a working "Copy link" button (clipboard
  permissions granted in the test browser context; button showed "Copied"
  feedback).
- **Published-quiz immutability, both through the UI and directly at the
  RPC layer, as the quiz's own owning teacher (not just a different
  teacher)**: direct navigation to `/quizzes/[id]/edit` and
  `/quizzes/[id]/review` on the published quiz both redirected away (no
  new code — the existing `status !== 'draft'` guards already in those
  pages did this). Calling `add_quiz_question`, `update_quiz_question`,
  `delete_quiz_question`, and `reorder_quiz_questions` directly (bypassing
  the UI entirely) as the actual owning teacher against the published
  quiz's own questions all failed with `"Only draft quizzes can be
  edited."` — the RPCs' own internal status check, unrelated to who's
  calling. Re-read the quiz and its questions afterward: title, status,
  `access_code`, and every question's text were byte-for-byte unchanged.
- **Cross-tenant**: a second real teacher account got a real `404` loading
  the published quiz's detail page; a direct attempt to flip its `status`
  to `'published'` (redundant, but also attempting to overwrite
  `access_code`) via PostgREST matched 0 rows (RLS `quizzes_update_own`);
  a direct `delete_quiz_question` call against the first teacher's
  question failed on ownership, independent of publish status.
- **Deadline and duration reused, not redesigned**: the test quiz was
  created with `duration_minutes = 20` and `ends_at` 24 hours out (via a
  direct authenticated insert, not a new form — the existing quiz
  create/edit form already collects both since Phase 3); both rendered
  correctly on the quiz detail page ("Time limit: 20 minutes",
  "Deadline: <formatted date>").
- **No secret leakage**: re-checked a fresh production build's
  `.next/static` for both `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` —
  zero matches.
- **Cleanup**: deleted both temporary teacher accounts (cascading to their
  quizzes/questions/answers) via the Admin API. Confirmed afterward:
  `auth.users` and `quizzes` contain only the one pre-existing real
  account and its own quiz.
