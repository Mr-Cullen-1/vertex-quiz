-- M11: apply after all ten historical migrations, as the migration owner.
-- No user promotion, data rewrite, policy change, or managed-schema change.
-- Run as one transaction through the migration runner.

-- Normalize table-level privileges on this application's seven tables only.
-- This also removes default TRUNCATE/REFERENCES/TRIGGER privileges, which
-- must not be treated as protected by the row ownership policies.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles, public.quizzes, public.questions, public.answers,
  public.participants, public.quiz_sessions, public.responses
FROM PUBLIC, anon, authenticated, service_role;

-- Table-level revocation alone does not remove separate column grants.
-- Clear every column privilege on profiles, including UPDATE(role).
REVOKE SELECT (id, full_name, created_at, role),
       INSERT (id, full_name, created_at, role),
       UPDATE (id, full_name, created_at, role),
       REFERENCES (id, full_name, created_at, role)
ON TABLE public.profiles
FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Existing M2 ownership policies still apply to every authenticated query.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.quizzes, public.questions, public.answers TO authenticated;
GRANT SELECT ON TABLE
  public.participants, public.quiz_sessions, public.responses TO authenticated;

-- Server-only student operations: the M7/M8 permissions, explicitly bounded.
GRANT SELECT ON TABLE
  public.quizzes, public.questions, public.answers TO service_role;
GRANT SELECT, INSERT ON TABLE public.participants TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.quiz_sessions, public.responses TO service_role;

-- These invoker functions are the teacher RPC/ownership interface.
-- Revoke PUBLIC as well as direct API-role grants before restoring access.
REVOKE EXECUTE ON FUNCTION
  public.is_quiz_owner(uuid),
  public.is_question_owner(uuid),
  public.create_quiz_questions(uuid, jsonb),
  public.add_quiz_question(uuid, jsonb),
  public.update_quiz_question(uuid, jsonb),
  public.delete_quiz_question(uuid),
  public.reorder_quiz_questions(uuid, uuid[])
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.is_quiz_owner(uuid),
  public.is_question_owner(uuid),
  public.create_quiz_questions(uuid, jsonb),
  public.add_quiz_question(uuid, jsonb),
  public.update_quiz_question(uuid, jsonb),
  public.delete_quiz_question(uuid),
  public.reorder_quiz_questions(uuid, uuid[])
TO authenticated;

-- Trigger functions are not application RPCs. Existing triggers and their
-- owner remain intact; Auth profile creation still uses SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.set_updated_at(),
  public.validate_question_answers(),
  public.validate_question_format()
FROM PUBLIC, anon, authenticated, service_role;
