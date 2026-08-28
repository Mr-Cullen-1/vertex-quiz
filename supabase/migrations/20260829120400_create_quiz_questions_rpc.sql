-- Vertex Quiz — atomic question-batch insert (Phase 4)
--
-- Gemini-generated questions must land in `questions`/`answers` as a single
-- all-or-nothing batch — never a partial set if something fails halfway
-- through. Supabase's client SDK has no multi-row, multi-table transaction
-- primitive of its own, so this is done as a single Postgres function:
-- everything inside it runs in one transaction implicitly, and the
-- deferred `validate_question_answers_trigger` from Phase 1 still fires at
-- the end of that transaction as an additional backstop — if a bug ever
-- let a malformed answer set through the application's own validation,
-- the whole function call rolls back instead of leaving broken rows.
--
-- security invoker (not definer): runs as the calling teacher, so the
-- existing RLS insert policies on `questions`/`answers` (already scoped by
-- `is_quiz_owner`/`is_question_owner`) still apply — this function doesn't
-- bypass RLS, it just batches what the caller could already do row by row.

create or replace function public.create_quiz_questions(
  p_quiz_id uuid,
  p_questions jsonb
)
returns setof public.questions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question jsonb;
  v_question_id uuid;
  v_order_index integer := 0;
begin
  if not public.is_quiz_owner(p_quiz_id) then
    raise exception 'Quiz not found or you do not have access to it.';
  end if;

  if exists (select 1 from public.questions where quiz_id = p_quiz_id) then
    raise exception 'This quiz already has generated questions. Clear them before generating again.';
  end if;

  for v_question in select * from jsonb_array_elements(p_questions)
  loop
    insert into public.questions (quiz_id, type, question_text, order_index)
    values (
      p_quiz_id,
      v_question ->> 'type',
      v_question ->> 'question_text',
      v_order_index
    )
    returning id into v_question_id;

    insert into public.answers (question_id, answer_text, is_correct, order_index)
    select
      v_question_id,
      ans ->> 'text',
      (ans ->> 'is_correct')::boolean,
      ord - 1
    from jsonb_array_elements(v_question -> 'answers') with ordinality as t(ans, ord);

    v_order_index := v_order_index + 1;
  end loop;

  return query
    select * from public.questions where quiz_id = p_quiz_id order by order_index;
end;
$$;

-- This project's Supabase instance does not auto-grant new routines to
-- `authenticated` (see docs/database.md "Table privileges") — grant it
-- explicitly, same lesson as Phase 2.
grant execute on function public.create_quiz_questions(uuid, jsonb) to authenticated;
