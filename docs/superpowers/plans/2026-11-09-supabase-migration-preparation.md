# Vertex Quiz Supabase Migration Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for any later authorized execution. This document authorizes no database access. Local preparation is complete; database execution and behavioral verification remain pending user authorization.

**Goal:** Prepare a reviewable, local permission-hardening migration and independent verified-UUID initial-admin bootstrap.

**Architecture:** Preserve M1-M10. Append M11 to normalize application table grants and function execution permissions while retaining the existing ownership RLS policies. Keep admin provisioning outside schema history as an operator-only SQL transaction with explicit precondition checks and no permanent RPC.

**Tech Stack:** Supabase PostgreSQL 17; SQL parsed offline using the installed libpg-query 17.7.4 WebAssembly parser.

**Spec:** User's implementation-preparation request in this conversation: prepare SQL and instructions locally, validate syntax, explain changes, and do not access or modify databases or Vercel.

## Global Constraints

- Do not modify the existing 10 migration files.
- Do not execute any SQL, including read-only verification SQL.
- Do not connect to or modify Supabase; do not change Vercel configuration.
- No environment-file changes, secrets in artifacts, deployment, commit, or push.
- Existing source and config files remain untouched; only new preparation artifacts are created.
- Runtime permission behavior and target schema compatibility cannot be certified by offline parsing.

## Review Focus

1. Table-wide UPDATE must not override the profile role column restriction.
2. Inherited/custom column grants or additional permissive policies on a nonempty target must be detected before release.
3. A wrong/missing/unconfirmed Auth identity must cause the bootstrap transaction to fail without promotion.
4. A legacy or concurrent different superadmin must not be silently accepted or demoted.
5. PDF replacement must work for its owner and fail for another teacher after ACL hardening.

## Artifacts and purpose

- `supabase/migrations/20261109103652_harden_profile_and_teacher_permissions.sql`: M11; generated with the installed CLI's local `migration new` command, with telemetry disabled. No migration was applied.
- `supabase/manual/bootstrap_initial_superadmin.sql`: manual transaction, intentionally unusable until both verified UUID and expected email replace NULL. Not a permanent SQL procedure/RPC. Creates a missing public profile, never an Auth account or password.
- `supabase/manual/verify_migration_security.sql`: read-only catalog/ACL/Storage/privileged-identity queries, prepared but not executed.
- This document: execution order, explanations, Storage instructions, risk review and later acceptance tests.

## Task 1: Local preparation and syntax checks

- [x] Review all ten migrations and current profile read sites.
- [x] Create the new migration without editing historical files.
- [x] Prepare manual bootstrap and verification scripts.
- [x] Parse all migration/manual SQL with libpg-query; record the result below.
- [x] Compare the original ten SHA-256 hashes and confirm the Git diff contains only new artifacts.

### Why each M11 change exists

1. Revoke table-level privileges on the seven named application tables from PUBLIC, anon, authenticated and service_role. This establishes a deliberate baseline instead of trusting a new project's default grants. It removes TRUNCATE, REFERENCES and TRIGGER grants too; row policies are not a substitute for limiting those privileges.
2. Separately revoke SELECT/INSERT/UPDATE/REFERENCES column privileges on the four profile columns. PostgreSQL table-level and column-level ACLs are separate; revoking only UPDATE(role) cannot counter a table-wide UPDATE grant. This also clears pre-existing column grants on profiles.
3. Grant schema USAGE explicitly to authenticated and service_role. No schema CREATE privilege is added.
4. Restore authenticated SELECT on profiles and UPDATE(full_name) only. M2's own-row SELECT and UPDATE policies continue to apply. Neither teachers nor application superadmins can self-update role, id or created_at through the Data API.
5. Restore authenticated CRUD on quizzes/questions/answers and SELECT on participants/quiz_sessions/responses, matching M3.
6. Restore service_role's exact table-level M7/M8 operations. No service_role profile grant is needed by current source; the bootstrap uses postgres. This must be reviewed if later code adds service_role profile management.
7. Revoke inherited PUBLIC and direct API-role EXECUTE grants on the seven ownership/RPC functions; grant all seven explicitly to authenticated. Ownership helpers remain SECURITY INVOKER and get the missing explicit grants.
8. Revoke direct API invocation rights for the four trigger functions. Existing triggers/owners are unchanged. Trigger functions cannot be invoked as ordinary SQL functions; this is ACL hardening, not a claim that handle_new_user was an exploitable public promotion RPC. Auth creation and question-trigger behavior must still be tested later.

No RLS policy or row data changes are included. No default privileges are changed globally. M11 is scoped to the named current objects. Column ACLs on the other six tables and custom inherited roles are not rewritten: inspect them with the verification script if the target is not pristine.

### Expected effective grants on a pristine target

| Table | authenticated | service_role |
| --- | --- | --- |
| profiles | SELECT; UPDATE(full_name) only | none |
| quizzes, questions, answers | SELECT, INSERT, UPDATE, DELETE | SELECT |
| participants | SELECT | SELECT, INSERT |
| quiz_sessions, responses | SELECT | SELECT, INSERT, UPDATE |

anon/PUBLIC receive none on these tables. No API role receives TRUNCATE/REFERENCES/TRIGGER. Authenticated gets EXECUTE on the two ownership helpers and five business RPCs; anon/service_role get none on those functions. Existing schema owners keep owner rights.

## Task 2: Later migration execution (NOT authorized now)

- [ ] Independently verify the new target project, initialized Auth/Storage schemas, migration owner, object inventory and migration history. Keep application traffic and public signup closed during setup.
- [ ] Apply these files in order, transactionally per migration, stopping on error:

1. `20260829120000_create_core_schema.sql`
2. `20260829120100_enable_rls.sql`
3. `20260829120200_grant_teacher_table_privileges.sql`
4. `20260829120300_quiz_pdfs_storage.sql`
5. `20260829120400_create_quiz_questions_rpc.sql`
6. `20260830120000_add_question_management.sql`
7. `20260830130000_grant_student_access_privileges.sql`
8. `20260902120000_grant_student_quiz_player_privileges.sql`
9. `20260902150000_add_profile_role.sql`
10. `20260903120000_add_quiz_format_difficulty.sql`
11. `20261109103652_harden_profile_and_teacher_permissions.sql`

- [ ] Do not manually replay already-applied DDL or combine a full schema restore with blindly applying these files. The historical chain is not generally idempotent.
- [ ] Run the prepared read-only verification script only after authorization. Expect seven RLS-enabled app tables, 17 application policies and four quiz-pdfs policies. Inspect ALL storage.objects policies: an additional broad permissive policy can defeat isolation.
- [ ] Confirm effective privileges, including inherited and column-level permissions, against the matrix. Counts alone do not establish policy correctness.
- [ ] Validate behavior with two disposable teachers A/B in an isolated target: A can read/write their own quiz content, cannot read/write B's, cannot reparent a question/answer to B's records, cannot modify results, cannot update role/id/created_at, and can update only their own full_name. anon cannot access application rows or RPCs. Include direct Data API tests, not just UI navigation.
- [ ] Verify Auth creation still inserts one teacher profile and valid question operations still execute timestamp/answer/format triggers. Invalid answer cardinality should fail in the supported RPC path. No rollback/test writes have been performed during preparation.

## Task 3: Initial superadmin provisioning (NOT authorized now)

M9:16-30 contains the historical hardcoded email/name promotion. It is not removed because editing any of the ten files is prohibited. On a truly empty project it is a no-op. If an account/profile exists before M9, it may be promoted; audit existing superadmins and resolve unexpected identities explicitly. M11 intentionally neither promotes nor demotes anyone.

- [ ] Prefer applying M1-M11 before creating the initial Auth account. If restoring existing users/data, preserve UUIDs and account for trigger/profile import collisions instead of recreating accounts.
- [ ] Use supported Supabase Auth administration to create/restore the account. Independently verify the account's UUID, expected email, email confirmation and project. Do not insert auth.users/password hashes through the bootstrap script.
- [ ] Replace the two NULL placeholders in an execution copy of `bootstrap_initial_superadmin.sql`; review it before execution. Do not populate the committed template with a personal UUID or email.
- [ ] Execute the entire transaction as postgres with stop-on-error. The script checks the operator role, locks the target Auth row, requires UUID+email+confirmation, serializes profile writes, and rejects any different existing superadmin. It repairs a missing public profile by UUID, promotes only that identity, preserves existing names/timestamps, and verifies the final role before committing.
- [ ] Wrong UUID/email, unconfirmed email, missing inputs, a different existing admin, or lock timeout must abort. After an error, roll back before retrying. Repeating for the same verified sole admin is safe. This is initial-admin provisioning, not a general multi-admin management tool.
- [ ] Verify ordinary profile updates cannot promote/demote. Confirm login succeeds after Auth provisioning.

`src/app/(admin)/layout.tsx:17-30` checks claims and reads full_name; it does not authorize superadmin access. `profiles.role='superadmin'` does not bypass ownership RLS or provide a global administrator dashboard. Cross-teacher admin functionality remains a separate feature.

## Task 4: Storage setup and verification (NOT authorized now)

M4 already defines bucket `quiz-pdfs`: private (`public=false`), 8388608 bytes, allowed MIME types exactly `application/pdf`. Its INSERT uses ON CONFLICT(id) DO NOTHING, so an existing bucket is not reconciled. M4 also defines SELECT/INSERT/UPDATE/DELETE policies restricted to the authenticated UUID in the first folder segment. UPDATE has both USING and WITH CHECK; replacement/upsert requires SELECT+INSERT+UPDATE.

- [ ] Inspect bucket settings after M4. If the bucket is missing or misconfigured, use Supabase Dashboard Storage or the supported Storage API to create/update those exact settings; do not make it public as a workaround.
- [ ] Current official bucket creation documentation explicitly supports SQL, so M4's bucket INSERT is not itself a demonstrated hosted-project incompatibility. It still requires the managed Storage schema and sufficient migration-owner privileges. Keep actual file upload/copy/delete operations in the Storage API, not direct storage.objects DML.
- [ ] Use the prepared verification script to inspect the bucket row and every storage.objects policy, including unrelated broadly permissive policies. Verify Storage RLS is enabled through target administration if customized.
- [ ] Copy the actual PDF objects separately; database metadata/migrations do not copy bytes. Preserve `{teacher_uuid}/{quiz_uuid}.pdf` and quizzes.source_pdf_path. UUID remapping requires both paths and references to be remapped consistently.
- [ ] Test A upload/download/replace/delete under A's folder; B cannot list/read/write/delete A's objects; unauthenticated access fails. Test a valid PDF below the limit, non-PDF rejection, over-limit rejection and replacement of an existing file.

Sources: `supabase/migrations/20260829120300_quiz_pdfs_storage.sql:17-61`; `src/lib/quizzes/pdf.ts:1-15`; `src/lib/quizzes/generate-actions.ts:75-90,143-145`.

## Additional security review and remaining issues

| Finding | Source evidence | Disposition |
| --- | --- | --- |
| Teacher row isolation is present in the known policies: own profiles, quizzes.teacher_id=auth.uid(), transitive question/answer ownership and read-only results. UPDATE policies contain USING and WITH CHECK. | M2:58-188 | Preserved; behavioral tests and unknown-target policy/role checks still required. |
| Profile role is writable through table-wide UPDATE. | M3:28; M9:16-17 | Fixed in prepared M11, not yet applied. |
| Fresh-project default grants can exceed the intended table/EXECUTE privileges. | M3/M5/M6/M7/M8 contain grants only; config.toml:19-23 | Named table/function API grants normalized by M11; no global defaults changed. |
| Published quiz immutability and approval-before-publish are not enforced by direct table RLS. Batch generation RPC lacks a draft check; management RPC draft checks are not serialized against publishing. | M2:86-154; M5:31-38; M6:61,125,192,243 | Unresolved integrity/race risk; needs separate write-path/transaction design. Not a demonstrated cross-teacher access bypass. |
| Answer invariant trigger runs only on answers. A zero-answer question insert or a question-type-only update can escape that trigger; moving an answer validates only coalesced NEW/OLD question_id. | M1:147-192 | Unresolved database invariant gap; do not claim all direct table writes are valid. |
| FK relationships do not prove session participant belongs to same quiz or selected answer belongs to the response question. | M1:215-255 | Application server validates its write paths; trusted imports/service-role writes require consistency checks. |
| Format trigger runs on questions, not on a parent quiz format change. | M10:62-83 | Existing child rows are not automatically revalidated by a quiz-only update. |
| Storage ownership checks the UUID folder, not the existence/ownership of a quiz filename. | M4:27-61 | Application upload validates quiz ownership; direct Storage access can place arbitrary PDFs within the user's own folder. |
| M9 can silently promote an existing email match and overwrite its name. | M9:27-30 | Historical file preserved; separate bootstrap rejects a different existing superadmin and never overwrites names. |
| Missing seed.sql is referenced by local config. | config.toml:65-70 | Do not rely on seed for admin creation; config unchanged. |

Do not call the target production-ready based solely on successful syntax parsing or migration application. Resolve outstanding integrity findings under separately reviewed changes or explicitly accept them before release.

## References

- https://www.postgresql.org/docs/17/sql-revoke.html (table and column ACL syntax)
- https://supabase.com/docs/guides/database/postgres/column-level-security
- https://supabase.com/docs/guides/database/functions (explicit helper EXECUTE permissions)
- https://supabase.com/docs/guides/auth/managing-user-data (Auth profile trigger)
- https://supabase.com/docs/guides/storage/buckets/creating-buckets
- https://supabase.com/docs/guides/storage/schema/design

## Validation record

All 11 migration files passed the existing `node scripts/lint-sql.mjs` offline parser. M11 contains 13 parsed statements. Both manual files also passed the same installed parser through an in-memory Node invocation: bootstrap 16 statements; verification 10 statements. The three new SQL files contain no PL/pgSQL bodies or dynamic SQL hidden inside string literals; all their statements were parsed directly. The historical PL/pgSQL function bodies were not compiled or executed by this SQL parser.

SHA-256 comparison confirmed that all ten original migration files are byte-for-byte unchanged. Git status shows only the new migration, manual SQL directory and plan document; no tracked-file changes. The first CLI launcher help attempt failed while trying to write global telemetry state; subsequent local-only CLI invocations used SUPABASE_TELEMETRY_DISABLED=1 and DO_NOT_TRACK=1. No project linking, database connection, SQL execution, dependency installation, deployment or Vercel change occurred.

Parsing validates PostgreSQL grammar, not object existence, grants, RLS behavior or target runtime compatibility. No target runtime verification is authorized in this phase.
