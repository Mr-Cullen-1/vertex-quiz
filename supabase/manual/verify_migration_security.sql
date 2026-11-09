-- MANUAL, READ-ONLY INSPECTION. Not executed during preparation.
-- Run as postgres after M11; inspect results against the implementation plan.
BEGIN READ ONLY;

-- All seven tables must have RLS enabled.
SELECT c.relname, c.relrowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'profiles', 'quizzes', 'questions', 'answers',
  'participants', 'quiz_sessions', 'responses'
)
ORDER BY c.relname;

-- Review ALL policies, not just expected names: permissive policies combine.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE (schemaname = 'public' AND tablename IN (
  'profiles', 'quizzes', 'questions', 'answers',
  'participants', 'quiz_sessions', 'responses'
)) OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- Expected: authenticated SELECT=true, UPDATE=false at TABLE level;
-- authenticated full_name UPDATE=true; id/created_at/role UPDATE=false.
-- anon has no profile SELECT/UPDATE; service_role has no profile grants.
SELECT r.role_name,
       has_table_privilege(r.role_name, 'public.profiles', 'SELECT') AS can_select,
       has_table_privilege(r.role_name, 'public.profiles', 'UPDATE') AS table_update,
       has_column_privilege(r.role_name, 'public.profiles', 'full_name', 'UPDATE') AS name_update,
       has_column_privilege(r.role_name, 'public.profiles', 'id', 'UPDATE') AS id_update,
       has_column_privilege(r.role_name, 'public.profiles', 'created_at', 'UPDATE') AS created_at_update,
       has_column_privilege(r.role_name, 'public.profiles', 'role', 'UPDATE') AS role_update
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name);

-- Effective privileges include inherited grants. Compare with the plan matrix.
SELECT r.role_name, t.table_name, p.privilege,
       has_table_privilege(r.role_name, 'public.' || t.table_name, p.privilege) AS allowed
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
CROSS JOIN (VALUES ('profiles'), ('quizzes'), ('questions'), ('answers'),
  ('participants'), ('quiz_sessions'), ('responses')) AS t(table_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
ORDER BY r.role_name, t.table_name, p.privilege;

-- Column ACL drift outside profiles is not rewritten by M11. Review any
-- explicit grants on other tables; the historical migrations create none.
SELECT c.relname, a.attname, a.attacl
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'profiles', 'quizzes', 'questions', 'answers',
  'participants', 'quiz_sessions', 'responses'
) AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
ORDER BY c.relname, a.attnum;

-- Authenticated: true for the seven helpers/RPCs, false for trigger functions.
-- anon/service_role: false for all eleven. Trigger execution is tested separately.
SELECT p.oid::regprocedure AS function_signature, p.prosecdef AS security_definer,
       p.proconfig, r.role_name,
       has_function_privilege(r.role_name, p.oid, 'EXECUTE') AS can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
WHERE n.nspname = 'public' AND p.proname IN (
  'is_quiz_owner', 'is_question_owner', 'create_quiz_questions',
  'add_quiz_question', 'update_quiz_question', 'delete_quiz_question',
  'reorder_quiz_questions', 'handle_new_user', 'set_updated_at',
  'validate_question_answers', 'validate_question_format'
)
ORDER BY p.oid::regprocedure::text, r.role_name;

-- Exactly one row; public must be false (the bucket is private).
-- Expected id/name quiz-pdfs; 8388608 bytes; application/pdf only.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'quiz-pdfs';

-- Review every privileged identity, including any legacy M9 promotion.
SELECT id, role FROM public.profiles WHERE role = 'superadmin' ORDER BY id;

COMMIT;
