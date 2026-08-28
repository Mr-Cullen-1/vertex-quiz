-- Vertex Quiz — table privileges for the `authenticated` role (Phase 2 fix)
--
-- Phase 1 enabled RLS and defined policies on all 7 tables, assuming
-- Supabase's usual auto-grant behavior would expose new public-schema
-- tables to `anon`/`authenticated` by default. Verified against the real
-- project (Phase 2) that this project does not auto-grant: `authenticated`
-- and `anon` had only REFERENCES/TRIGGER/TRUNCATE on every table, so every
-- PostgREST request was rejected with "permission denied" before RLS was
-- ever evaluated. This migration grants exactly the operations each
-- table's existing RLS policies already allow — no more, no less — so RLS
-- remains the actual row-level boundary. See docs/database.md.
--
-- `anon` intentionally gets nothing: students never call Supabase directly
-- from the browser. Every student-facing write goes through the
-- service-role admin client server-side (src/lib/supabase/admin.ts), which
-- bypasses grants and RLS entirely by design.

-- Full CRUD — matches the 4 policies each (select/insert/update/delete,
-- scoped to the owning teacher) on quizzes, questions, and answers.
grant select, insert, update, delete on public.quizzes to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.answers to authenticated;

-- profiles: only select/update — matches profiles_select_own /
-- profiles_update_own. No insert grant: rows are created exclusively by
-- the SECURITY DEFINER handle_new_user() trigger, which runs as the
-- function owner and is unaffected by the caller's grants.
grant select, update on public.profiles to authenticated;

-- participants / quiz_sessions / responses: select-only — matches the
-- single select-only policy each. No write grant: every insert/update on
-- these tables happens through the service-role admin client.
grant select on public.participants to authenticated;
grant select on public.quiz_sessions to authenticated;
grant select on public.responses to authenticated;
