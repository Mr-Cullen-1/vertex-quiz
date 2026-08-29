# Architecture

## High-level shape

Vertex Quiz is a single Next.js (App Router) application with two very
different front-ends sharing one backend:

```
                    ┌─────────────────────────────┐
                    │        Next.js app          │
                    │                              │
  Teacher ── auth ──▶  (admin) route group          │
  browser           │  Server Components + Actions  │
                    │            │                  │
                    │            ▼                  │
                    │   lib/supabase (server client) │──▶ Supabase Postgres (RLS)
                    │            │                  │      + Supabase Auth
                    │            ▼                  │      + Supabase Storage (PDFs)
                    │   lib/gemini (Gemini service)  │──▶ Google Gemini API
                    │                              │
  Student ── code ──▶  (student) route group        │
  browser           │  Server Components + Actions  │
                    └─────────────────────────────┘
```

There is no separate backend service. Route Handlers and Server Actions in
the Next.js app are the entire API surface; Supabase is the only external
system of record besides Gemini.

## Route groups

- `app/login/` — public login page (teacher email/password only — no
  signup route; teacher accounts are provisioned outside the app). Added
  in Phase 2.
- `app/(admin)/...` — teacher-facing SaaS dashboard: `/dashboard`,
  `/quizzes`, `/results`, `/settings`. Requires an authenticated Supabase
  session, enforced by `(admin)/layout.tsx`. Shell added in Phase 2;
  `/quizzes/new`, `/quizzes/[id]`, and `/quizzes/[id]/edit` (draft
  creation/viewing/editing) added in Phase 3; PDF upload + Gemini
  generation added in Phase 4; `/quizzes/[id]/review` (question review,
  edit, add, delete, reorder, approve) added in Phase 5. Publishing still
  doesn't exist — see "Quiz lifecycle" below.
- `app/(student)/join/[code]/...` — public student flow. No authentication;
  identity is a per-session token created on entry. Added in Phase 7.
- `app/page.tsx` — minimal public landing/status page (Phase 0).

Route protection uses the Next.js 16 `proxy.ts` convention (exported
`proxy` function, at `src/proxy.ts` — same level as `src/app`), not the
deprecated `middleware.ts`. `proxy.ts` refreshes the Supabase auth session
cookie on every request (via `src/lib/supabase/middleware.ts`) and, as of
Phase 2, does an *optimistic* redirect based on the cookie's JWT claims:
unauthenticated → `/login` for any path under `/dashboard`, `/quizzes`,
`/results`, `/settings`; authenticated → `/dashboard` for `/login`. It
no-ops when Supabase isn't configured (see Environment configuration
below).

This optimistic check is **not** the real security boundary — per the
Next.js authentication guide's Data Access Layer guidance
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`),
`(admin)/layout.tsx` independently re-verifies the session server-side
(`getClaims()`) on every request regardless of what `proxy.ts` decided, and
every table is additionally scoped by Row Level Security. A bug or bypass
in the proxy alone cannot expose teacher data.

## Server/client boundary

- Server Components read data directly via a server-side Supabase client
  (`src/lib/supabase/server.ts`, RLS-respecting).
- Mutations go through **Server Actions** (teacher dashboard forms, student
  quiz submission) or **Route Handlers** where a plain HTTP endpoint is a
  better fit (e.g. file upload, potential webhook-style calls).
- Client Components are used only where interactivity requires it: the
  login form's pending/error state (`useActionState`), the mobile sidebar
  drawer, quiz taking UI (timer, answer selection, transitions), question
  editor interactions, file upload progress. `src/lib/supabase/client.ts`
  exists for a Client Component that needs a Supabase client directly, but
  the Phase 2 login form doesn't use it — it calls `src/lib/auth/actions.ts`
  (a Server Action using `src/lib/supabase/server.ts`) instead, so the
  publishable key round-trip and cookie-writing both happen server-side.
- Student-facing server code that must write to `participants` /
  `quiz_sessions` / `responses` — tables with no RLS write policy for
  anyone but the service role — uses `src/lib/supabase/admin.ts`. That
  client bypasses RLS entirely, so the calling code is responsible for its
  own authorization (validating a session token, checking expiry) before
  using it.
- The Gemini API key and the Supabase secret key are read only inside
  server-only modules, guarded by the `server-only` package (a build-time
  error if a client bundle ever imports them) and validated centrally by
  `src/lib/env.ts` — never imported by a file that ships to the client.

## Quiz lifecycle

```
draft (metadata only, Phase 3)
  │  upload PDF → Gemini extraction → validate → save (Phase 4)
  ▼
draft with questions (pending review)
  │  teacher approves/edits/adds/deletes/reorders questions (Phase 5)
  ▼
draft, all questions approved → "ready for publishing" (computed, not persisted)
  │  teacher explicitly clicks Publish (Phase 6, this — server-side re-verified)
  ▼
published ── student access via /join/{access_code} (Phase 7 — blocked, see below) ──> closed
```

"Ready for publishing" is intentionally **not** a `quizzes.status` value —
it's computed (both on the review page and the quiz detail page) from
`count(questions.review_status = 'approved') = count(questions.*) > 0`.
That computed value only ever gates whether the *button* is shown; the
actual publish Server Action (`publishQuiz`, Phase 6) independently
re-derives every condition from the database before writing anything — see
"Publishing" below.

**Phase 6 status: publishing is fully implemented; student access is
not.** The teacher-facing half (readiness check, the `publishQuiz` action,
the access-token/join-URL, and published-quiz immutability) is built and
verified end-to-end. The public `/join/{token}` route and participant/
session creation are **not implemented** — they're blocked on a real,
verified gap: `service_role` currently has no table grants on this
project (confirmed live, same class of issue as the Phase 2
`authenticated` gotcha), and the student flow's server-side code has no
other legitimate way to read a quiz or write a participant/session without
either that grant or a new anon-facing RLS policy — both of which are
schema/security changes the task's own instructions say must stop for
review rather than be applied unilaterally. See "Student access — blocked
pending a service_role grant decision" below and
[database.md](./database.md) → "service_role privileges" for the full
finding.

Phase 3 implements quiz metadata: a teacher creates a `quizzes` row with a
title, optional description, a fixed `multiple_choice_count` /
`true_false_count` (and therefore `total_questions`), an optional
`duration_minutes`, and an optional `ends_at` deadline. The row is always
created with `status = 'draft'` — there is no code path that sets any other
status yet, so `published`/`closed` are inert enum values until Phase 6.
`total_questions` is always server-computed
(`multiple_choice_count + true_false_count`), never taken from the client,
and is additionally backstopped by the `quizzes_question_counts_match`
`CHECK` constraint from Phase 1.

A draft can be edited or deleted (`src/lib/quizzes/actions.ts`) — both
operations first re-read the row through the RLS-scoped client and refuse
if `status !== 'draft'`. This is exactly why Phase 6 needed **zero** new
immutability code: a published quiz already became un-editable/
un-deletable through this same code path the moment `publishQuiz` set
`status = 'published'`, verified directly (see "Publishing" below).
Ownership is enforced twice: RLS (`quizzes_insert_own`/`update_own`/
`delete_own`, all `teacher_id = auth.uid()`) is the actual boundary, and
the Server Actions additionally re-check status/existence themselves so a
rejected write surfaces a specific message ("Quiz not found." / "Only
draft quizzes can be edited.") instead of a generic Postgres error.

Phase 4 fills in `questions`/`answers`: the teacher uploads a PDF, it's
stored privately, sent to Gemini, and the validated result is saved as one
atomic batch (see "PDF upload and AI question generation" below). The
`/quizzes/[id]` detail page shows the requested structure (counts), the PDF
upload panel, and a "Question review" summary card linking to
`/quizzes/[id]/review` — the full question editor built in Phase 5 (see
"Question review and management" below).

## PDF upload and AI question generation

```
Teacher uploads PDF (src/lib/quizzes/generate-actions.ts: uploadQuizPdf)
  → validated (type/size/magic bytes, src/lib/quizzes/pdf.ts)
  → stored in Supabase Storage, bucket "quiz-pdfs", path {teacher_id}/{quiz_id}.pdf
  → quizzes.source_pdf_path updated

Teacher clicks "Generate" (generateQuestions)
  → refuses if the quiz already has questions ("clear before regenerating")
  → PDF downloaded back from Storage via the authenticated client
  → sent to Gemini (gemini-flash-latest, @google/genai) as inline base64
    data + a structured prompt (src/lib/gemini/prompt.ts) requesting
    exactly the quiz's requested MC/TF counts
  → response parsed as JSON, shape-checked with Zod
    (src/lib/gemini/schema.ts), then checked against the actual business
    rules (src/lib/gemini/validate.ts): exact total/MC/TF counts, exact
    answer counts and correct-answer counts per type, non-empty text, no
    duplicate MC options, the True/False answers are literally "True" and
    "False"
  → any validation failure rejects the whole batch — nothing partial is
    ever written, and the specific mismatch is shown to the teacher
  → valid batch inserted via the create_quiz_questions Postgres function
    (one transaction for every question + its answers; Phase 1's deferred
    validate_question_answers_trigger is a second, DB-level backstop
    behind the same invariant)
```

**Storage security.** The `quiz-pdfs` bucket is private
(`public = false`, `allowed_mime_types = ['application/pdf']`,
`file_size_limit = 8 MB`) — there is no public/signed URL anywhere in this
flow. RLS policies on `storage.objects` restrict each `authenticated`
teacher to paths under their own `auth.uid()` folder, mirroring the
`is_quiz_owner()` pattern used for `quizzes`/`questions`/`answers`. Upload
and download both go through the same RLS-scoped server client used
everywhere else (`src/lib/supabase/server.ts`) — never the service-role
client, since this is a normal teacher operation with a real owner to
scope RLS against. Verified directly (not just by code review): a second
teacher's session gets `Object not found` downloading or listing another
teacher's PDF path, the same "indistinguishable from nonexistent" pattern
RLS already gives every other table.

**Gemini never gets more trust than any other untrusted input.** The
model's raw output is parsed and Zod-checked for *shape* only;
`validate.ts` is the actual authority on correctness, and its acceptance
criteria are the same ones a human reviewer would apply — this mirrors the
pipeline documented (before any of it existed) in
[docs/ai-pipeline.md](./ai-pipeline.md).

**Duplicate-generation guard, in two layers.** The application checks the
question count before ever calling Gemini (cheap, avoids wasting an API
call), and `create_quiz_questions` independently re-checks and raises if
the quiz already has questions — verified directly by calling the RPC a
second time as the real owning teacher and confirming it's rejected
without adding a duplicate row. The MVP resolution for "quiz already has
questions" is the simpler option the product spec allowed for: require an
explicit `clearGeneratedQuestions()` call first, not an automatic
replace-in-place.

**Upload UX honesty.** The panel's states (empty → file selected →
uploading → processing → success/error) map to two real, separately
awaited network calls (`uploadQuizPdf` then `generateQuestions`) — there's
no timer-based fake progress and no state that claims to be "done" before
its request actually resolved. The "AI processing" state shows one
accurate message (the real requested MC/TF counts) rather than fabricated
sub-phase timing that can't actually be observed from a single
request/response Gemini call.

## Question review and management (Phase 5)

```
Draft quiz with questions (from Phase 4 generation and/or manual add)
  → src/lib/quizzes/question-actions.ts: addQuestion / updateQuestion /
    deleteQuestion / reorderQuestions / setQuestionReviewStatus
  → src/lib/quizzes/ownership.ts: requireSession + loadOwnedDraftQuiz
    (friendly, fast-fail "is this my draft quiz?" check — never the real
    security boundary)
  → Postgres RPCs (add_quiz_question / update_quiz_question /
    delete_quiz_question / reorder_quiz_questions), each re-deriving
    ownership itself via is_quiz_owner()/is_question_owner() — the actual
    boundary, independent of whatever quizId/questionId the client sent
  → questions.review_status ('pending' | 'approved'), quizzes.
    multiple_choice_count/true_false_count/total_questions kept in sync
```

**Review status.** `questions.review_status` (migration
`20260830120000_add_question_management.sql`) is `'pending'` by default —
true for both AI-generated and manually-added questions, and reset back to
`'pending'` by `update_quiz_question` on every edit, since the previously-
approved content no longer exists once changed. Approving/un-approving
(`setQuestionReviewStatus`) is a single-row `questions` update — no RPC
needed, since RLS's existing `questions_update_own` policy (already scoped
through `is_quiz_owner`) is the real boundary there, same as any other
question write.

**Shared validation, not duplicated.** `src/lib/quizzes/question-rules.ts`
(`validateQuestionShape`) is the one authority for MC/TF answer-shape rules
— exact counts, exact correct-answer counts, non-empty text, no duplicate
MC options, the fixed True/False vocabulary. Both the Gemini batch
validator (`src/lib/gemini/validate.ts`, which additionally checks the
requested totals across a whole batch) and the manual add/edit Server
Actions call into it, so a teacher-typed question is held to exactly the
same bar as an AI-generated one. This is a refactor of what was, until
Phase 5, inline logic duplicated nowhere yet but shaped identically —
extracting it here means Phase 5 didn't reinvent the Phase 4 rules.

**Atomic multi-table writes, same pattern as Phase 4.** Add/update/delete
all touch `questions`, `answers`, and `quizzes`' per-type counters
together, so each is a single `security invoker` Postgres function (one
implicit transaction) rather than several sequential client calls that
could leave inconsistent state if one failed partway:

- `add_quiz_question` — inserts the question + its answers at the next
  `order_index`, then increments the matching `multiple_choice_count`/
  `true_false_count` and `total_questions` on `quizzes` in the same
  statement (so `quizzes_question_counts_match` is never transiently
  violated).
- `update_quiz_question` — replaces the answer set (delete + reinsert) and
  the question row; if the type changed (MC ↔ TF) it also shifts the two
  per-type counters by one each, in one statement.
- `delete_quiz_question` — deletes the question (answers cascade),
  resequences the quiz's remaining questions' `order_index` to stay
  contiguous (0..n-1) using the same deferred-unique-constraint trick Phase
  1 built for exactly this purpose, then decrements the matching counter.
- `reorder_quiz_questions` — requires the caller to supply every question
  id the quiz currently has (validated inside the function, not just the
  client) and assigns a full new `order_index` set in one statement — no
  sequence of individual updates that could transiently collide.

All four are `security invoker` (run as the calling teacher, so the
existing RLS insert/update/delete policies on `questions`/`answers` still
apply) and explicitly `grant execute ... to authenticated` — new routines
are never auto-granted on this project (see docs/database.md "Table
privileges"), same lesson as Phase 2 and Phase 4.

## Publishing (Phase 6)

```
src/lib/quizzes/publish-actions.ts: publishQuiz(quizId)
  → requireSession + loadOwnedDraftQuiz (same shared helpers every other
    question/quiz action uses — ownership + "is this a draft?" check)
  → re-fetches every question + its answers, independently re-derives:
      • at least 1 question exists
      • every question.review_status === 'approved'
      • actual MC/TF/total counts match quizzes.multiple_choice_count/
        true_false_count/total_questions
      • every question still passes validateQuestionShape (the same
        authority every write path already goes through)
  → generateAccessToken() (24 random bytes, base64url — src/lib/quizzes/
    access-token.ts) written to quizzes.access_code
  → single UPDATE: status='published', published_at=now(), access_code=<token>
```

**No schema change.** `quizzes.status` already supported `'published'`,
`published_at` and `ends_at` (the deadline) already existed, and
`access_code` — added in Phase 1 with exactly this future use already
anticipated (`unique`, nullable, "assigned on publish") — is reused
directly as the opaque student-facing token. `duration_minutes` (already
teacher-configurable since Phase 3) is reused as-is for the session time
limit; Phase 6 stores it, nothing more — the countdown itself is Phase 7.

**"Ready" is a UI hint, never the authority.** The quiz detail page shows
the "Publish" button only when its own quick check (`reviewedCount ===
questionCount > 0`) passes, but `publishQuiz` re-verifies everything above
independently — a stale or manipulated client can't publish a quiz that
doesn't actually qualify.

**Access token.** `generateAccessToken()` is `crypto.randomBytes(24)`
base64url-encoded — 32 URL-safe characters, ~192 bits of entropy. Never
the quiz's UUID, never sequential, never derived from the title or a
timestamp — the token carries no information, so guessing or enumerating
one is infeasible. On the astronomically unlikely event of a collision
with `quizzes.access_code`'s `unique` constraint, `publishQuiz` retries
with a fresh token up to 3 times before giving up with a clear error.

**Published-quiz immutability required zero new code.** Every question
mutation (`addQuestion`, `updateQuestion`, `deleteQuestion`,
`reorderQuestions`, `setQuestionReviewStatus`, the bulk-approve actions)
already called `loadOwnedDraftQuiz` before touching anything, and every
question RPC (`add_quiz_question`, `update_quiz_question`,
`delete_quiz_question`, `reorder_quiz_questions`) already independently
re-checked `status = 'draft'` inside the SQL function itself. The moment
`publishQuiz` flips `status` to `'published'`, both layers reject every
one of those operations automatically — verified directly, including as
the quiz's own owning teacher calling the RPCs straight (not just through
the UI), not only as a different, non-owning teacher. `quizFormSchema`'s
edit page and `deleteQuiz` (Phase 3) already had the same `status !==
'draft'` guard for the quiz row itself, so nothing there needed touching
either. No Phase 6 code introduces a new immutability check — it
consistently inherited the one every prior phase already built.

**Do not confuse `access_code` with a `quiz_sessions.session_token`.**
`quizzes.access_code` is the public, shareable, long-lived join link for
the *quiz* (one per published quiz). A future Phase 7 `quiz_sessions`
session identifier would be a *different*, per-participant, single-use
value — the two must never be conflated or interchanged.

## Student access — blocked pending a service_role grant decision

Phase 6's task explicitly required verifying `service_role`'s real table
privileges *before* building student-facing participant/session creation,
and explicitly required stopping — not silently granting anything — if
they were insufficient. They are: confirmed live (`information_schema.
role_table_grants`) that `service_role` has only `REFERENCES`/`TRIGGER`/
`TRUNCATE` on every `public` table — no `SELECT`/`INSERT`/`UPDATE` on
`quizzes`, `participants`, or `quiz_sessions`. This is the same "no
auto-grant on this project" characteristic Phase 2 found for
`authenticated` (see database.md → "Table privileges"), just never
exercised by `service_role` before now, since Phase 1–5's admin-client
usage (`auth.admin.*`, Storage) isn't gated by these table grants at all.

Concretely, this blocks the entire public `/join/{token}` route: a
student's browser has no Supabase session (no `authenticated` role), so
the only way to read a quiz by its `access_code` or write a `participants`/
`quiz_sessions` row server-side is the service-role admin client — and it
currently can't do either. Building `/join/{token}` today would mean
either (a) applying a `service_role` grant migration, or (b) adding a new
`anon`-facing RLS policy on `quizzes` — both are exactly the kind of
schema/RLS change this task's instructions require stopping for. Neither
was applied. See [database.md](./database.md) → "service_role privileges"
for the proposed minimal grant (not yet applied) and the full reasoning
for why option (a) — not a new anon RLS policy — is the right shape when
this is approved.

**"Ready for publishing" is computed, never persisted** — see "Quiz
lifecycle" above.

## Data-loading errors

A Supabase query error must never be allowed to quietly look like "no
data" — a `permission denied` or dropped-connection error is not the same
thing as a teacher genuinely having zero quizzes, and treating them the
same hides real bugs (this happened once already — see docs/database.md's
"Table privileges" section). `src/lib/supabase/assert-no-error.ts` throws
when a query's `error` is set; page components call it after every
Supabase read that feeds real UI state (stat counts, lists, profile
fields), and the throw is caught by that route segment's `error.tsx`
(`(admin)/error.tsx`), which renders a plain "Something went wrong" state
with a retry button instead of a 200 response with fake zeros.

This deliberately does not extend to `(admin)/layout.tsx`'s own profile
lookup (used only to display the teacher's name in the header): a
segment's `error.tsx` wraps its `children`, not the layout itself, so a
thrown layout error isn't caught there and would take down the whole
shell. That query instead logs the error server-side and falls back to the
email already available from the verified JWT — still real data, just not
the more specific field, which is an acceptable degrade for a
non-critical piece of chrome. Pages that actually display profile detail
(`/settings`) do use `assertNoError` and surface a real error there.

## Environment configuration

`src/lib/env.ts` validates every required environment variable with Zod
the first time `getEnv()` is called (not at import time, so a page that
doesn't touch Supabase/Gemini keeps working even before those credentials
exist) and throws one readable error listing everything missing/invalid.
`isSupabaseConfigured()` offers a cheap, non-throwing presence check for
code — currently just `proxy.ts` — that must degrade gracefully instead.

## AI pipeline isolation

Gemini access is centralized in `src/lib/gemini/` (built in Phase 4 — see
"PDF upload and AI question generation" above for the full flow):
`client.ts` (server-only `GoogleGenAI` instance, `GEMINI_API_KEY` via
`getEnv()`), `prompt.ts`, `schema.ts` (Zod shape + derived JSON Schema for
`responseJsonSchema`), `validate.ts` (the actual correctness authority).
Only `src/lib/quizzes/generate-actions.ts` calls into it — no Gemini call
happens outside a Server Action.

Nothing downstream of "draft questions persisted" trusts the AI output
further — the teacher review screen (`/quizzes/[id]/review`, Phase 5) is
where every question (AI-generated or manually added) must be explicitly
approved, and only a future Phase 6 publish action can move a quiz out of
draft.

## Correctness and randomization

Multiple Choice correctness is stored as a foreign key
(`answers.is_correct` per answer row, resolved to a `correct_answer_id` at
grading time), never as a positional letter. When a student session is
created, question order and MC option order are shuffled and that
per-session order is persisted (so re-rendering the same session is
consistent), but the underlying answer records — and which one is
correct — never change. Grading always re-resolves the submitted
`selected_answer_id` against the answer table server-side.

## Availability and timing enforcement

`starts_at`, `ends_at`, and `duration_minutes` on the quiz are enforced
server-side at two points: (1) session creation is refused outside the
availability window, (2) every mutation on an existing session
(answer submission, completion) re-checks `expires_at` computed from
`started_at + duration_minutes`, independent of any client-reported timer.

## Directory structure (grows per phase)

```
src/
  app/                    Routes (App Router)
    layout.tsx            Root layout + metadata
    page.tsx              Public landing/status page
    globals.css           Design tokens (Tailwind v4 @theme)
    icon.png, apple-icon.png  Favicon / Apple touch icon (real logo, Phase 0)
    login/                Phase 2 — public login page + client form
    (admin)/              Phase 2 — protected teacher shell
      layout.tsx            Auth gate + profile load + Sidebar/Header chrome
      error.tsx             Error boundary for every page below
      dashboard/            Stat cards + recent quizzes (real Supabase data)
      quizzes/              "My Quizzes" — real list (Phase 3), sorted newest first
        new/                  Phase 3 — create-quiz form
        [id]/                 Phase 3 — draft detail (view/edit/delete)
          edit/                 Phase 3 — edit-quiz form (pre-filled)
          review/                 Phase 5 — question review/edit/add/delete/reorder
            _components/            question-list/-card.tsx, question-editor-dialog.tsx, add-question-button.tsx
          _components/          delete-quiz-button.tsx, pdf-generation-panel.tsx (Phase 4),
                                 publish-quiz-button.tsx, student-access-link.tsx (Phase 6)
        _components/          quiz-form.tsx — shared create/edit form
      results/              Empty-state shell, Phase 9/10 fill it in
      settings/             Read-only account info (real profile data)
      _components/          Sidebar, Header, StatCard, mobile nav (Sheet-based)
    (student)/join/[token]/ Phase 7+ — blocked on a service_role grant
                             decision, see "Student access" above
  components/
    ui/                   shadcn/ui primitives
  lib/
    utils.ts              cn() helper (shadcn)
    env.ts                 Phase 1 — Zod-validated environment variables
    auth/
      actions.ts            Phase 2 — login/logout Server Actions
    quizzes/
      schema.ts              Phase 3 — Zod schema shared by create/edit
      actions.ts              Phase 3 — createQuiz/updateQuiz/deleteQuiz
      pdf.ts                   Phase 4 — bucket/size/magic-byte constants + validation
      generate-actions.ts       Phase 4 — uploadQuizPdf/generateQuestions/clearGeneratedQuestions
      ownership.ts               Phase 5 — requireSession/loadOwnedDraftQuiz, shared by generate-actions.ts too
      question-rules.ts           Phase 5 — validateQuestionShape, shared with gemini/validate.ts
      question-schema.ts           Phase 5 — Zod shape for manual question input
      question-actions.ts           Phase 5 — add/update/delete/reorder/setReviewStatus
      access-token.ts                Phase 6 — generateAccessToken() (crypto.randomBytes)
      publish-actions.ts              Phase 6 — publishQuiz
    gemini/
      client.ts               Phase 4 — server-only GoogleGenAI client
      prompt.ts                Phase 4 — extraction prompt builder
      schema.ts                 Phase 4 — Zod shape + derived JSON Schema for Gemini
      validate.ts                Phase 4 — the actual correctness authority
    supabase/
      server.ts            Phase 1 — RLS-respecting server client (cookie-bound)
      client.ts             Phase 1 — browser client (Client Components)
      admin.ts               Phase 1 — service-role client (bypasses RLS)
      middleware.ts           Phase 1/2 — session refresh + claims for proxy.ts
      assert-no-error.ts       Phase 2 — throw-on-Supabase-error helper
  proxy.ts                 Phase 1/2 — session refresh + optimistic redirects
supabase/
  migrations/              Phase 1–5 — SQL schema + RLS + grants + Storage + RPC, via Supabase CLI
docs/                     Reference documentation (this directory)
```

## Deployment

Vercel, deploying the Next.js app directly. Supabase project is provisioned
separately (its own dashboard/CLI, not part of this repo's build step).
Environment variables are configured per-environment in Vercel; local
development uses `.env.local`.
