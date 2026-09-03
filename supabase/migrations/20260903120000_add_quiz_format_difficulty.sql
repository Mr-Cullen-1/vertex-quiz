-- Vertex Quiz — quiz format + CEFR difficulty (Comprehension / Vocabulary Quiz)
--
-- Adds the two pieces of persistent quiz metadata the new Vocabulary Quiz
-- format needs: `format` (which generation mode / question types apply)
-- and `difficulty` (the CEFR level Gemini is instructed to target). Every
-- row that exists before this migration is a comprehension quiz by
-- definition, so both columns default to 'comprehension' / 'B1' — the
-- least-restrictive, already-valid combination for every such row. No
-- existing row's data is changed by this migration; only future writes are
-- affected. No new GRANT is needed: `quizzes` is a pre-existing table and
-- `authenticated` already has full select/insert/update/delete on it (see
-- 20260829120200_grant_teacher_table_privileges.sql) — see
-- docs/database.md "Table privileges" for why that matters on this
-- project.

alter table public.quizzes
  add column format text not null default 'comprehension'
    check (format in ('comprehension', 'vocabulary'));

alter table public.quizzes
  add column difficulty text not null default 'B1'
    check (difficulty in ('B1', 'B2', 'C1'));

comment on column public.quizzes.format is
  'Quiz generation mode: comprehension (Multiple Choice + True/False, from the source PDF''s content) or vocabulary (Multiple Choice only, PDF-grounded vocabulary). Every quiz predating this column is comprehension by definition.';
comment on column public.quizzes.difficulty is
  'CEFR level Gemini is instructed to target during generation. Comprehension allows B1/B2; vocabulary additionally allows C1 — enforced by quizzes_format_difficulty_valid below and re-checked in application code (src/lib/quizzes/format.ts).';

-- Cross-column check: a quiz's difficulty must be one this project's
-- product spec actually allows for its format (Comprehension caps at B2;
-- Vocabulary Quiz additionally allows C1). A single-column CHECK on
-- `difficulty` alone can't express this, since the allowed set depends on
-- `format`.
alter table public.quizzes
  add constraint quizzes_format_difficulty_valid check (
    (format = 'comprehension' and difficulty in ('B1', 'B2'))
    or (format = 'vocabulary' and difficulty in ('B1', 'B2', 'C1'))
  );

-- A Vocabulary Quiz is Multiple Choice only, so its aggregate
-- true_false_count must stay at zero. This backstops the application-level
-- check (src/lib/quizzes/format.ts + validateQuestionForFormat) the same
-- way quizzes_question_counts_match backstops the MC/TF count bookkeeping.
alter table public.quizzes
  add constraint quizzes_vocabulary_no_true_false check (
    format <> 'vocabulary' or true_false_count = 0
  );

-- ---------------------------------------------------------------------------
-- Per-question backstop: a question inserted or updated on a Vocabulary
-- Quiz must be multiple_choice. quizzes_vocabulary_no_true_false above only
-- catches the aggregate count column; this catches the actual question row
-- regardless of which path wrote it (the Gemini batch RPC, the manual
-- add/update RPCs, or any other authenticated write) — a plain (not
-- deferred) trigger, since it only needs to compare the row being written
-- against its already-committed parent quiz, with no cross-row batching
-- concern like `validate_question_answers_trigger` has. Mirrors that
-- trigger's role: a backstop behind application validation, never a
-- replacement for it.
-- ---------------------------------------------------------------------------

create function public.validate_question_format()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quiz_format text;
begin
  select format into v_quiz_format from public.quizzes where id = new.quiz_id;

  if v_quiz_format = 'vocabulary' and new.type <> 'multiple_choice' then
    raise exception
      'Vocabulary Quiz questions must be Multiple Choice (got question type: %)', new.type;
  end if;

  return new;
end;
$$;

create trigger validate_question_format_trigger
  before insert or update on public.questions
  for each row execute function public.validate_question_format();
