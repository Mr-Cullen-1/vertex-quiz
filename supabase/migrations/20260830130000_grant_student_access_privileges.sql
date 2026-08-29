-- Vertex Quiz — service_role privileges for student access (Phase 6)
--
-- Discovered in Phase 5, re-confirmed in Phase 6: `service_role` has
-- `rolbypassrls = true` (RLS is correctly bypassed) but had ZERO table
-- grants on this project — the same "no auto-grant" behavior Phase 2 found
-- for `authenticated`, just never exercised before since no phase through
-- Phase 6's publishing work ever called `.from()` on a `public.*` table
-- with the admin client. See docs/database.md "service_role privileges"
-- for the full investigation.
--
-- This grants exactly what the Phase 6 student-join flow needs and
-- nothing more:
--   - `quizzes`: SELECT only — the public /join/{token} page has no
--     Supabase session, so reading a quiz by its access_code can only
--     happen through the service-role client. No INSERT/UPDATE/DELETE —
--     publishing/editing a quiz is exclusively a teacher (`authenticated`)
--     operation and stays that way.
--   - `participants`: SELECT, INSERT — create the student's participant
--     row; SELECT is required for PostgREST to return the inserted row
--     (`.select()` after `.insert()`). No UPDATE/DELETE — nothing in the
--     Phase 6 flow modifies a participant after creation.
--   - `quiz_sessions`: SELECT, INSERT — same reasoning, for the session
--     row. No UPDATE/DELETE — session status transitions belong to
--     Phase 7/8, not this migration.
--
-- Deliberately NOT granted: anything on `responses` (untouched until the
-- actual quiz-taking phase), and no RLS policy changes anywhere —
-- `service_role` already bypasses RLS once it has the grant, so no policy
-- needs to change for this to work. `anon`/`authenticated` grants are
-- untouched by this migration.

grant select on public.quizzes to service_role;

grant select, insert
  on public.participants
  to service_role;

grant select, insert
  on public.quiz_sessions
  to service_role;
