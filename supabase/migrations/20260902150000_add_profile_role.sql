-- Vertex Quiz — profile role column + superadmin bootstrap
--
-- `profiles` has never had a role column — every account has been an
-- implicit "teacher" since Phase 1, with no representation for anything
-- else. This adds the smallest schema change that can represent a
-- superadmin: one column, defaulted so every existing and future row stays
-- 'teacher' unless explicitly changed, and constrained to exactly the two
-- values this app currently knows about.
--
-- Deliberately NOT included: any new RLS policy, grant, or RPC keyed off
-- this column. There is no superadmin-only functionality anywhere in the
-- app yet, so there is nothing for a role check to gate — adding one now
-- would be unused, untested surface area. This migration only makes the
-- role representable; authorizing anything on top of it is a separate,
-- future change once real superadmin functionality exists.
alter table public.profiles
  add column role text not null default 'teacher' check (role in ('teacher', 'superadmin'));

comment on column public.profiles.role is
  'Application-level role, independent of Supabase Auth. Every account defaults to ''teacher''; ''superadmin'' is granted manually, not self-service.';

-- Bootstraps the one specified superadmin account. Scoped by email lookup
-- against auth.users (never creates a user, never touches any other
-- profile) and is safe to run in any environment: if this account doesn't
-- exist yet in a given database (e.g. a fresh project), the subquery
-- returns null, the WHERE clause matches zero rows, and this is a no-op.
update public.profiles
set full_name = 'Diyorbek Nematullayev',
    role = 'superadmin'
where id = (select id from auth.users where email = 'mrcullen6256@gmail.com');
