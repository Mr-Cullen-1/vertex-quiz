-- Vertex Quiz — core schema (Phase 1: Supabase foundation)
--
-- Tables: profiles, quizzes, questions, answers, participants,
-- quiz_sessions, responses. See docs/database.md for the full design
-- rationale. UUID primary keys, explicit foreign keys, timestamps, and
-- CHECK constraints enforce what Postgres can verify cheaply; the harder
-- cross-row invariants (answer counts/correctness per question) are
-- enforced by a deferred constraint trigger below so a question's answers
-- can be inserted as a batch within one transaction.

-- ---------------------------------------------------------------------------
-- profiles — extends auth.users with app-specific teacher profile data.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Teacher profile data, one row per auth.users row. Created automatically by handle_new_user().';

-- Auto-create a profile row whenever a new Supabase Auth user signs up, so
-- application code never has to remember to do it (and can't forget to,
-- since this runs at the database level).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Shared updated_at trigger, reused by every table that has one.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- quizzes
-- ---------------------------------------------------------------------------

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  total_questions integer not null default 0 check (total_questions >= 0),
  multiple_choice_count integer not null default 0 check (multiple_choice_count >= 0),
  true_false_count integer not null default 0 check (true_false_count >= 0),
  source_pdf_path text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  access_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint quizzes_question_counts_match
    check (total_questions = multiple_choice_count + true_false_count),
  constraint quizzes_availability_window
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

comment on table public.quizzes is
  'A teacher-owned quiz. access_code is assigned on publish; unique() allows many drafts with a null code.';

create index quizzes_teacher_id_idx on public.quizzes (teacher_id);
create index quizzes_status_idx on public.quizzes (status);

create trigger set_quizzes_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  type text not null check (type in ('multiple_choice', 'true_false')),
  question_text text not null check (char_length(btrim(question_text)) > 0),
  order_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- deferrable: reordering a quiz's questions updates several order_index
  -- values in one transaction, which can transiently collide mid-transaction.
  unique (quiz_id, order_index) deferrable initially deferred
);

comment on table public.questions is
  'A quiz question. Changing type after answers exist is not supported at the application layer.';

create index questions_quiz_id_idx on public.questions (quiz_id);

create trigger set_questions_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- answers
-- ---------------------------------------------------------------------------

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  answer_text text not null check (char_length(btrim(answer_text)) > 0),
  is_correct boolean not null default false,
  order_index integer not null,
  created_at timestamptz not null default now(),
  unique (question_id, order_index) deferrable initially deferred
);

comment on table public.answers is
  'An answer option. Correctness is always resolved by id, never by display position — see docs/database.md.';

create index answers_question_id_idx on public.answers (question_id);
-- Speeds up "find the correct answer for this question" lookups during grading.
create index answers_question_id_correct_idx on public.answers (question_id) where is_correct;

-- Enforce, at the database level, the answer-count and correctness
-- invariants the product spec requires: exactly 4 answers / 1 correct for
-- multiple_choice, exactly 2 answers / 1 correct for true_false. This is a
-- deferred CONSTRAINT TRIGGER so a question's answers can be inserted as a
-- single batch (one statement/transaction) without tripping the check
-- after the first row. It is a backstop behind Zod + application
-- validation (Phase 4/5), not a replacement for it.
create function public.validate_question_answers()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_question_id uuid := coalesce(new.question_id, old.question_id);
  question_type text;
  answer_count integer;
  correct_count integer;
begin
  select type into question_type
  from public.questions
  where id = affected_question_id;

  -- The question itself may have been removed in the same transaction
  -- (cascading delete) — nothing left to validate in that case.
  if question_type is null then
    return null;
  end if;

  select count(*), count(*) filter (where is_correct)
    into answer_count, correct_count
  from public.answers
  where question_id = affected_question_id;

  if question_type = 'multiple_choice' and (answer_count != 4 or correct_count != 1) then
    raise exception
      'multiple_choice question % must have exactly 4 answers with exactly 1 marked correct (found % answers, % correct)',
      affected_question_id, answer_count, correct_count;
  end if;

  if question_type = 'true_false' and (answer_count != 2 or correct_count != 1) then
    raise exception
      'true_false question % must have exactly 2 answers with exactly 1 marked correct (found % answers, % correct)',
      affected_question_id, answer_count, correct_count;
  end if;

  return null;
end;
$$;

create constraint trigger validate_question_answers_trigger
  after insert or update or delete on public.answers
  deferrable initially deferred
  for each row execute function public.validate_question_answers();

-- ---------------------------------------------------------------------------
-- participants — a student's identity for one quiz. No auth.users row.
-- ---------------------------------------------------------------------------

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) > 0),
  last_name text not null check (char_length(btrim(last_name)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.participants is
  'A student who joined a quiz by access code. Identified only by name — no account.';

create index participants_quiz_id_idx on public.participants (quiz_id);

-- ---------------------------------------------------------------------------
-- quiz_sessions
-- ---------------------------------------------------------------------------

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  session_token text not null unique,
  status text not null default 'started' check (status in ('started', 'in_progress', 'completed', 'expired')),
  -- Per-session shuffle of question order and, per multiple_choice question,
  -- answer display order — persisted so re-rendering the same session is
  -- consistent. The underlying answer records (and which one is correct)
  -- never change; see docs/database.md.
  question_order jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  score numeric(5, 2) check (score is null or (score >= 0 and score <= 100)),
  correct_answers integer check (correct_answers is null or correct_answers >= 0),
  total_questions integer not null check (total_questions >= 0),
  created_at timestamptz not null default now(),
  constraint quiz_sessions_completed_after_started
    check (completed_at is null or completed_at >= started_at)
);

comment on table public.quiz_sessions is
  'One student attempt at a quiz. expires_at is computed server-side from quizzes.duration_minutes and is authoritative over any client timer.';

create index quiz_sessions_quiz_id_idx on public.quiz_sessions (quiz_id);
create index quiz_sessions_participant_id_idx on public.quiz_sessions (participant_id);

-- ---------------------------------------------------------------------------
-- responses
-- ---------------------------------------------------------------------------

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_answer_id uuid references public.answers (id) on delete set null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),
  unique (session_id, question_id)
);

comment on table public.responses is
  'One answered question within a session. is_correct is always computed server-side — never trust a client-submitted value.';

create index responses_session_id_idx on public.responses (session_id);
create index responses_question_id_idx on public.responses (question_id);
