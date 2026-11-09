-- MANUAL ONLY. Never place this file in supabase/migrations.
-- First create/restore the account through Supabase Auth administration.
-- Independently verify its UUID, email, and target project.
-- Replace BOTH NULL values below in a reviewed execution copy.
-- Execute the whole script as postgres, with stop-on-error enabled.
-- An error aborts the transaction; roll it back before retrying.
-- Creates a missing APPLICATION profile, never an auth.users row/password.

BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE vertex_quiz_bootstrap_input (
  auth_user_id uuid PRIMARY KEY,
  expected_email text NOT NULL CHECK (btrim(expected_email) <> '')
) ON COMMIT DROP;

-- Intentionally fails closed until a verified UUID and email are supplied.
INSERT INTO pg_temp.vertex_quiz_bootstrap_input (auth_user_id, expected_email)
VALUES ('8ed45438-a082-455b-a605-59e7ada3bbc2'::uuid, 'otajanov6256@gmail.com'::text);

CREATE TEMP TABLE vertex_quiz_bootstrap_checks (
  check_name text NOT NULL,
  passed boolean NOT NULL,
  CONSTRAINT bootstrap_precondition_failed CHECK (passed)
) ON COMMIT DROP;

INSERT INTO pg_temp.vertex_quiz_bootstrap_checks
VALUES ('trusted postgres operator', current_user = 'postgres');

-- Keep account identity stable throughout verification and promotion.
SELECT u.id
FROM auth.users AS u
JOIN pg_temp.vertex_quiz_bootstrap_input AS i ON i.auth_user_id = u.id
FOR UPDATE OF u;

INSERT INTO pg_temp.vertex_quiz_bootstrap_checks
SELECT 'exact UUID, expected email, confirmed email', count(*) = 1
FROM auth.users AS u
JOIN pg_temp.vertex_quiz_bootstrap_input AS i ON i.auth_user_id = u.id
WHERE lower(u.email) = lower(btrim(i.expected_email))
  AND u.email_confirmed_at IS NOT NULL;

-- Serialize initial-admin creation; do not silently accept M9's legacy
-- promotion or another pre-existing superadmin. Never auto-demote anyone.
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO pg_temp.vertex_quiz_bootstrap_checks
SELECT 'no different superadmin already exists', NOT EXISTS (
  SELECT 1 FROM public.profiles AS p
  WHERE p.role = 'superadmin'
    AND p.id <> (SELECT auth_user_id FROM pg_temp.vertex_quiz_bootstrap_input)
);

INSERT INTO public.profiles (id)
SELECT auth_user_id FROM pg_temp.vertex_quiz_bootstrap_input
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles AS p
SET role = 'superadmin'
FROM pg_temp.vertex_quiz_bootstrap_input AS i
WHERE p.id = i.auth_user_id
  AND p.role IS DISTINCT FROM 'superadmin';

INSERT INTO pg_temp.vertex_quiz_bootstrap_checks
SELECT 'exactly one target profile is superadmin', count(*) = 1
FROM public.profiles AS p
JOIN pg_temp.vertex_quiz_bootstrap_input AS i ON i.auth_user_id = p.id
WHERE p.role = 'superadmin';

SELECT p.id, p.role
FROM public.profiles AS p
JOIN pg_temp.vertex_quiz_bootstrap_input AS i ON i.auth_user_id = p.id;

COMMIT;
