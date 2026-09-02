-- Vertex Quiz — service_role grants for the student quiz player (Phase 7)
--
-- Phase 6 gave service_role exactly SELECT on quizzes and SELECT+INSERT on
-- participants/quiz_sessions — enough to publish a join link and create a
-- session, nothing else. Verified live before writing this migration
-- (information_schema.role_table_grants): service_role still had zero
-- grants on questions/answers/responses, and no UPDATE anywhere. The
-- student quiz player needs exactly four more things, no more:
--
--   - SELECT on questions/answers, to load a quiz's content for a session
--     that has no Supabase Auth JWT for RLS to key off.
--   - UPDATE on quiz_sessions, to persist the per-session question/answer
--     shuffle once (question_order), flip status started -> in_progress ->
--     completed/expired, and stamp completed_at.
--   - SELECT/INSERT/UPDATE on responses, to record and let a student change
--     an answer before submitting (one row per session/question, upserted
--     on the existing unique(session_id, question_id) constraint).
--
-- Deliberately NOT granted: INSERT/DELETE on questions/answers/quiz_sessions
-- (content and session identity stay teacher/RPC-owned), DELETE on
-- responses, and anything on quizzes/participants beyond what Phase 6
-- already granted.

grant select on public.questions to service_role;
grant select on public.answers to service_role;
grant update on public.quiz_sessions to service_role;
grant select, insert, update on public.responses to service_role;
