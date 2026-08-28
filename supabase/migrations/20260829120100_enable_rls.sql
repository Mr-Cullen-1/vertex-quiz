-- Vertex Quiz — Row Level Security (Phase 1: Supabase foundation)
--
-- Design (see docs/database.md):
--   * profiles / quizzes / questions / answers — a teacher (authenticated,
--     via Supabase Auth) can read/write only rows they own, directly or
--     transitively through a quiz they own.
--   * participants / quiz_sessions / responses — teachers get read-only
--     access scoped to quizzes they own (for results/analytics in later
--     phases). No INSERT/UPDATE/DELETE policy exists for `authenticated` or
--     `anon` on these three tables: every student-facing write goes through
--     server-side code using the service-role ("secret key") admin client
--     (src/lib/supabase/admin.ts), which bypasses RLS by design. Students
--     never talk to Supabase directly from the browser.

-- ---------------------------------------------------------------------------
-- Ownership helper functions — SECURITY INVOKER, fully schema-qualified, and
-- search_path pinned to '' per Supabase's function hardening guidance. Being
-- `invoker` means the inner query against public.quizzes is itself still
-- subject to that table's own RLS policy, which happens to encode the same
-- check — belt and suspenders, not a bypass.
-- ---------------------------------------------------------------------------

create function public.is_quiz_owner(target_quiz_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.quizzes
    where quizzes.id = target_quiz_id
      and quizzes.teacher_id = auth.uid()
  );
$$;

create function public.is_question_owner(target_question_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions
    join public.quizzes on quizzes.id = questions.quiz_id
    where questions.id = target_question_id
      and quizzes.teacher_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy: rows are created by handle_new_user() (runs as
-- the function owner, bypassing RLS) and removed only via the auth.users
-- cascade — never directly by application code.

-- ---------------------------------------------------------------------------
-- quizzes
-- ---------------------------------------------------------------------------

alter table public.quizzes enable row level security;

create policy "quizzes_select_own" on public.quizzes
  for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "quizzes_insert_own" on public.quizzes
  for insert
  to authenticated
  with check (teacher_id = auth.uid());

create policy "quizzes_update_own" on public.quizzes
  for update
  to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "quizzes_delete_own" on public.quizzes
  for delete
  to authenticated
  using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------

alter table public.questions enable row level security;

create policy "questions_select_own" on public.questions
  for select
  to authenticated
  using (public.is_quiz_owner(quiz_id));

create policy "questions_insert_own" on public.questions
  for insert
  to authenticated
  with check (public.is_quiz_owner(quiz_id));

create policy "questions_update_own" on public.questions
  for update
  to authenticated
  using (public.is_quiz_owner(quiz_id))
  with check (public.is_quiz_owner(quiz_id));

create policy "questions_delete_own" on public.questions
  for delete
  to authenticated
  using (public.is_quiz_owner(quiz_id));

-- ---------------------------------------------------------------------------
-- answers
-- ---------------------------------------------------------------------------

alter table public.answers enable row level security;

create policy "answers_select_own" on public.answers
  for select
  to authenticated
  using (public.is_question_owner(question_id));

create policy "answers_insert_own" on public.answers
  for insert
  to authenticated
  with check (public.is_question_owner(question_id));

create policy "answers_update_own" on public.answers
  for update
  to authenticated
  using (public.is_question_owner(question_id))
  with check (public.is_question_owner(question_id));

create policy "answers_delete_own" on public.answers
  for delete
  to authenticated
  using (public.is_question_owner(question_id));

-- ---------------------------------------------------------------------------
-- participants / quiz_sessions / responses — teacher read-only, scoped to
-- quizzes they own. No write policies: only the service-role admin client
-- writes here (see src/lib/supabase/admin.ts).
-- ---------------------------------------------------------------------------

alter table public.participants enable row level security;

create policy "participants_select_own_quiz" on public.participants
  for select
  to authenticated
  using (public.is_quiz_owner(quiz_id));

alter table public.quiz_sessions enable row level security;

create policy "quiz_sessions_select_own_quiz" on public.quiz_sessions
  for select
  to authenticated
  using (public.is_quiz_owner(quiz_id));

alter table public.responses enable row level security;

create policy "responses_select_own_quiz" on public.responses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.quiz_sessions
      where quiz_sessions.id = responses.session_id
        and public.is_quiz_owner(quiz_sessions.quiz_id)
    )
  );
