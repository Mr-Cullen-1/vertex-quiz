# Database

**Status:** planned schema — implemented in Phase 1. This document describes
the target shape so later phases have a stable reference; the actual SQL
migrations live under `supabase/migrations/` once Phase 1 lands.

## Principles

- UUID primary keys (`gen_random_uuid()`).
- Explicit foreign keys with sensible `ON DELETE` behavior (cascade from a
  quiz down to its questions/answers/sessions; restrict/deny anything that
  would silently orphan a teacher's data).
- `created_at`/`updated_at` timestamps on tables where edits happen.
- Database constraints (`CHECK`) enforce invariants Postgres can verify
  cheaply (e.g. answer counts per question type, non-negative counts).
- Row Level Security (RLS) enabled on every table; teachers can only read/
  write their own quizzes and related rows, students never get table-level
  access — student-facing reads/writes go through Server Actions using a
  service role or narrowly-scoped policies keyed to a session token, not
  direct client-side Supabase queries.

## Tables

### `profiles`

Extends `auth.users` with app-specific teacher profile data.

| Column     | Type        | Notes                              |
| ---------- | ----------- | ----------------------------------- |
| id         | uuid PK     | = `auth.users.id`                   |
| full_name  | text        |                                      |
| created_at | timestamptz | default `now()`                     |

### `quizzes`

| Column                  | Type        | Notes                                             |
| ----------------------- | ----------- | -------------------------------------------------- |
| id                      | uuid PK     |                                                      |
| teacher_id              | uuid FK     | → `profiles.id`                                     |
| title                   | text        | not null                                            |
| description             | text        | nullable                                            |
| status                  | text        | `draft` \| `published` \| `closed`, default `draft` |
| total_questions         | int         | `CHECK (total_questions = multiple_choice_count + true_false_count)` |
| multiple_choice_count   | int         | default 0                                           |
| true_false_count        | int         | default 0                                           |
| source_pdf_path         | text        | Supabase Storage object path, nullable              |
| starts_at               | timestamptz | nullable until scheduled                            |
| ends_at                 | timestamptz | nullable until scheduled                            |
| duration_minutes        | int         | nullable until scheduled                            |
| access_code             | text        | unique, generated on publish                        |
| created_at              | timestamptz | default `now()`                                     |
| updated_at              | timestamptz | default `now()`, updated by trigger                 |
| published_at            | timestamptz | nullable                                            |

### `questions`

| Column         | Type    | Notes                                    |
| -------------- | ------- | ------------------------------------------ |
| id             | uuid PK |                                             |
| quiz_id        | uuid FK | → `quizzes.id`, `ON DELETE CASCADE`        |
| type           | text    | `multiple_choice` \| `true_false`          |
| question_text  | text    | not null                                    |
| order_index    | int     | position within the quiz                    |
| created_at     | timestamptz | default `now()`                         |
| updated_at     | timestamptz | default `now()`, updated by trigger     |

### `answers`

| Column       | Type    | Notes                                                        |
| ------------ | ------- | -------------------------------------------------------------- |
| id           | uuid PK |                                                                  |
| question_id  | uuid FK | → `questions.id`, `ON DELETE CASCADE`                          |
| answer_text  | text    | not null                                                        |
| is_correct   | boolean | not null                                                        |
| order_index  | int     | canonical stored order (session-time display order is separate) |
| created_at   | timestamptz | default `now()`                                             |

Enforced at the application layer (Zod + service checks) and, where
practical, via constraints/triggers: exactly 4 answers with exactly 1
`is_correct = true` for `multiple_choice` questions; exactly 2 answers with
exactly 1 `is_correct = true` for `true_false` questions.

### `participants`

A student's identity for one quiz — no `auth.users` row.

| Column      | Type        | Notes                          |
| ----------- | ----------- | -------------------------------- |
| id          | uuid PK     |                                   |
| quiz_id     | uuid FK     | → `quizzes.id`                   |
| first_name  | text        | not null                         |
| last_name   | text        | not null                         |
| created_at  | timestamptz | default `now()`                  |

### `quiz_sessions`

| Column          | Type        | Notes                                                     |
| --------------- | ----------- | ------------------------------------------------------------ |
| id              | uuid PK     |                                                                |
| quiz_id         | uuid FK     | → `quizzes.id`                                                |
| participant_id  | uuid FK     | → `participants.id`                                           |
| session_token   | text        | unique, secure random — the student's bearer credential       |
| status          | text        | `started` \| `in_progress` \| `completed` \| `expired`         |
| question_order  | jsonb       | persisted per-session shuffle: question + answer display order |
| started_at      | timestamptz |                                                                |
| completed_at    | timestamptz | nullable                                                       |
| expires_at      | timestamptz | `started_at + quizzes.duration_minutes`                       |
| score           | numeric     | percentage, computed server-side on completion                |
| correct_answers | int         |                                                                |
| total_questions | int         |                                                                |
| created_at      | timestamptz | default `now()`                                                |

### `responses`

| Column               | Type        | Notes                                       |
| -------------------- | ----------- | ---------------------------------------------- |
| id                    | uuid PK     |                                                  |
| session_id            | uuid FK     | → `quiz_sessions.id`, `ON DELETE CASCADE`       |
| question_id           | uuid FK     | → `questions.id`                                |
| selected_answer_id    | uuid FK     | → `answers.id`, nullable (unanswered/timeout)   |
| is_correct            | boolean     | computed server-side, never trusted from client |
| answered_at           | timestamptz |                                                  |
| time_spent_seconds    | int         |                                                  |

## Row Level Security (planned policies)

- `profiles`: a user can select/update only their own row.
- `quizzes`, `questions`, `answers`: a teacher can select/insert/update/
  delete only rows where `quiz.teacher_id = auth.uid()` (questions/answers
  scoped transitively through their quiz).
- `participants`, `quiz_sessions`, `responses`: no direct client-side access
  for students — all student reads/writes go through Server Actions/Route
  Handlers that validate the session token server-side. Teachers get
  read-only access scoped to quizzes they own (for results/analytics).

## Migrations

Supabase SQL migrations will live under `supabase/migrations/`, applied via
the Supabase CLI, starting in Phase 1.
