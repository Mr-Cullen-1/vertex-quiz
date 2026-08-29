-- Vertex Quiz — teacher question review + management (Phase 5)
--
-- Adds the one column the review workflow needs (`questions.review_status`)
-- plus four atomic RPCs for manual question add/edit/delete/reorder. Mirrors
-- the Phase 4 `create_quiz_questions` pattern: every multi-table write goes
-- through a single `security invoker` function so it runs as one implicit
-- transaction, backstopped by the existing deferred
-- `validate_question_answers_trigger` from Phase 1. None of this weakens or
-- replaces RLS — every function re-checks `is_quiz_owner`/`is_question_owner`
-- itself, so the caller's own policies are what ultimately gate the write.
--
-- No new table, so no new GRANT is needed for `review_status` (the existing
-- Phase 2 grant already covers `select, insert, update, delete` on
-- `questions` for `authenticated`) — but new routines are never
-- auto-granted on this project (see docs/database.md "Table privileges"),
-- so each function below gets an explicit `grant execute`.

-- ---------------------------------------------------------------------------
-- review_status — a question is "pending" until the teacher explicitly
-- approves it. AI-generated and manually-added questions both start
-- pending; editing an approved question reverts it to pending (see
-- update_quiz_question below) since the previously-approved content no
-- longer exists. "Ready for publishing" is intentionally NOT a persisted
-- quiz-level status — it's computed in the application from
-- count(review_status = 'approved') = count(*), so this migration never
-- touches `quizzes.status` or its check constraint.
-- ---------------------------------------------------------------------------

alter table public.questions
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved'));

comment on column public.questions.review_status is
  'Teacher review state. Sourced or manually-added questions both start pending; approving is always an explicit teacher action. Never auto-approved by AI.';

-- ---------------------------------------------------------------------------
-- add_quiz_question — appends one teacher-authored question (+ its answers)
-- to a draft quiz and keeps quizzes.multiple_choice_count/true_false_count/
-- total_questions in sync with the real row count, in the same statement so
-- the `quizzes_question_counts_match` check is never transiently violated.
-- ---------------------------------------------------------------------------

create or replace function public.add_quiz_question(
  p_quiz_id uuid,
  p_question jsonb
)
returns public.questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type text := p_question ->> 'type';
  v_question_id uuid;
  v_order_index integer;
begin
  if not public.is_quiz_owner(p_quiz_id) then
    raise exception 'Quiz not found or you do not have access to it.';
  end if;

  if not exists (select 1 from public.quizzes where id = p_quiz_id and status = 'draft') then
    raise exception 'Only draft quizzes can be edited.';
  end if;

  select coalesce(max(order_index), -1) + 1 into v_order_index
  from public.questions
  where quiz_id = p_quiz_id;

  insert into public.questions (quiz_id, type, question_text, order_index, review_status)
  values (p_quiz_id, v_type, p_question ->> 'question_text', v_order_index, 'pending')
  returning id into v_question_id;

  insert into public.answers (question_id, answer_text, is_correct, order_index)
  select
    v_question_id,
    ans ->> 'text',
    (ans ->> 'is_correct')::boolean,
    ord - 1
  from jsonb_array_elements(p_question -> 'answers') with ordinality as t(ans, ord);

  update public.quizzes
  set
    multiple_choice_count = multiple_choice_count + (case when v_type = 'multiple_choice' then 1 else 0 end),
    true_false_count = true_false_count + (case when v_type = 'true_false' then 1 else 0 end),
    total_questions = total_questions + 1
  where id = p_quiz_id;

  return (select q from public.questions q where q.id = v_question_id);
end;
$$;

grant execute on function public.add_quiz_question(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- update_quiz_question — replaces a question's text/type/answers in place.
-- Order_index is untouched (editing never reorders). Editing always resets
-- review_status to 'pending': the previously-approved content no longer
-- exists, so the teacher must re-approve. If the type changes (MC <-> TF),
-- multiple_choice_count/true_false_count shift by one each in the same
-- statement — total_questions is unaffected by a type change.
-- ---------------------------------------------------------------------------

create or replace function public.update_quiz_question(
  p_question_id uuid,
  p_question jsonb
)
returns public.questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quiz_id uuid;
  v_old_type text;
  v_new_type text := p_question ->> 'type';
begin
  select quiz_id, type into v_quiz_id, v_old_type
  from public.questions
  where id = p_question_id;

  if v_quiz_id is null or not public.is_quiz_owner(v_quiz_id) then
    raise exception 'Question not found or you do not have access to it.';
  end if;

  if not exists (select 1 from public.quizzes where id = v_quiz_id and status = 'draft') then
    raise exception 'Only draft quizzes can be edited.';
  end if;

  delete from public.answers where question_id = p_question_id;

  insert into public.answers (question_id, answer_text, is_correct, order_index)
  select
    p_question_id,
    ans ->> 'text',
    (ans ->> 'is_correct')::boolean,
    ord - 1
  from jsonb_array_elements(p_question -> 'answers') with ordinality as t(ans, ord);

  update public.questions
  set
    type = v_new_type,
    question_text = p_question ->> 'question_text',
    review_status = 'pending'
  where id = p_question_id;

  if v_old_type <> v_new_type then
    update public.quizzes
    set
      multiple_choice_count = multiple_choice_count
        + (case when v_new_type = 'multiple_choice' then 1 else 0 end)
        - (case when v_old_type = 'multiple_choice' then 1 else 0 end),
      true_false_count = true_false_count
        + (case when v_new_type = 'true_false' then 1 else 0 end)
        - (case when v_old_type = 'true_false' then 1 else 0 end)
    where id = v_quiz_id;
  end if;

  return (select q from public.questions q where q.id = p_question_id);
end;
$$;

grant execute on function public.update_quiz_question(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_quiz_question — removes a question (answers cascade), resequences
-- the quiz's remaining order_index values to stay contiguous (0..n-1), and
-- decrements the matching quiz count. The order_index unique constraint is
-- `deferrable initially deferred` specifically so this resequencing update
-- can run without tripping on transient duplicates mid-statement.
-- ---------------------------------------------------------------------------

create or replace function public.delete_quiz_question(
  p_question_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quiz_id uuid;
  v_type text;
begin
  select quiz_id, type into v_quiz_id, v_type
  from public.questions
  where id = p_question_id;

  if v_quiz_id is null or not public.is_quiz_owner(v_quiz_id) then
    raise exception 'Question not found or you do not have access to it.';
  end if;

  if not exists (select 1 from public.quizzes where id = v_quiz_id and status = 'draft') then
    raise exception 'Only draft quizzes can be edited.';
  end if;

  delete from public.questions where id = p_question_id;

  with ranked as (
    select id, row_number() over (order by order_index) - 1 as new_index
    from public.questions
    where quiz_id = v_quiz_id
  )
  update public.questions q
  set order_index = ranked.new_index
  from ranked
  where q.id = ranked.id;

  update public.quizzes
  set
    multiple_choice_count = multiple_choice_count - (case when v_type = 'multiple_choice' then 1 else 0 end),
    true_false_count = true_false_count - (case when v_type = 'true_false' then 1 else 0 end),
    total_questions = total_questions - 1
  where id = v_quiz_id;
end;
$$;

grant execute on function public.delete_quiz_question(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- reorder_quiz_questions — applies a full new order_index assignment in one
-- statement. Requires the caller to supply every question id the quiz
-- currently has (no partial reorder, no smuggled-in ids from another quiz)
-- so a mistaken client can't silently drop or duplicate a question's order.
-- ---------------------------------------------------------------------------

create or replace function public.reorder_quiz_questions(
  p_quiz_id uuid,
  p_question_ids uuid[]
)
returns setof public.questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing_count integer;
  v_provided_count integer;
begin
  if not public.is_quiz_owner(p_quiz_id) then
    raise exception 'Quiz not found or you do not have access to it.';
  end if;

  if not exists (select 1 from public.quizzes where id = p_quiz_id and status = 'draft') then
    raise exception 'Only draft quizzes can be edited.';
  end if;

  select count(*) into v_existing_count from public.questions where quiz_id = p_quiz_id;
  select count(distinct qid) into v_provided_count from unnest(p_question_ids) as qid;

  if p_question_ids is null
    or array_length(p_question_ids, 1) is distinct from v_existing_count
    or v_provided_count is distinct from v_existing_count
  then
    raise exception 'The provided question order does not match the quiz''s questions.';
  end if;

  if exists (
    select 1
    from unnest(p_question_ids) as qid
    left join public.questions q on q.id = qid and q.quiz_id = p_quiz_id
    where q.id is null
  ) then
    raise exception 'The provided question order references a question that does not belong to this quiz.';
  end if;

  update public.questions q
  set order_index = t.ord - 1
  from unnest(p_question_ids) with ordinality as t(qid, ord)
  where q.id = t.qid;

  return query
    select * from public.questions where quiz_id = p_quiz_id order by order_index;
end;
$$;

grant execute on function public.reorder_quiz_questions(uuid, uuid[]) to authenticated;
