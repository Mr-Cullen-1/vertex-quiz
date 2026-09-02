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
  edit, add, delete, reorder, approve) added in Phase 5; publishing (the
  "Publish" button, student access link) added in Phase 6 — see "Quiz
  lifecycle" and "Publishing" below.
- `app/(student)/join/[token]/...` — public student flow: validate the
  quiz's access token, show quiz info, collect first/last name, create a
  participant + quiz_session. No authentication; identity is the
  `quiz_sessions.session_token` created on entry. Added in Phase 6. See
  "Student access" below.
- `app/(student)/quiz/[sessionToken]/...` — the real student quiz player:
  randomized question/answer order, answer selection and persistence, a
  server-enforced countdown, and final submit. No authentication here
  either; identity is the same opaque `session_token`. Added in Phase 7 —
  see "Student quiz player" below.
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
published ── student joins via /join/{access_code}, gets a session (Phase 6) ──> closed
```

A student's own `quiz_sessions.status` progresses independently of the
quiz's `status` (which stays `published` throughout): `started` (Phase 6,
on join) → `in_progress` (Phase 7, once the session's question order is
generated) → `completed` (Phase 7, on submit) or `expired` (Phase 7, if
`expires_at` passes before the student submits) — see "Student quiz
player" below.

"Ready for publishing" is intentionally **not** a `quizzes.status` value —
it's computed (both on the review page and the quiz detail page) from
`count(questions.review_status = 'approved') = count(questions.*) > 0`.
That computed value only ever gates whether the *button* is shown; the
actual publish Server Action (`publishQuiz`, Phase 6) independently
re-derives every condition from the database before writing anything — see
"Publishing" below.

**Phase 6 status: complete.** Both halves are built and verified
end-to-end: the teacher-facing side (readiness check, `publishQuiz`,
access token/join-URL, published-quiz immutability) and the student
access side (`/join/{token}`, first/last name collection, participant +
quiz_session creation, deadline enforcement). The student side needed a
scoped `service_role` grant first — found insufficient in Phase 6's first
pass, reported rather than silently fixed, then applied after explicit
approval. See "Student access" below and [database.md](./database.md) →
"service_role privileges" for the full finding and the exact grant
applied.

**Phase 7 status: complete.** The real student quiz player replaces the
Phase 6 placeholder at `/quiz/[sessionToken]`: randomized, per-session-
stable question/answer order; answer selection with change-before-submit;
a server-enforced countdown; and final submit. It needed its own scoped
`service_role` grant, found and applied the same way as Phase 6's — see
"Student quiz player" below and [database.md](./database.md) →
"service_role privileges". No scoring, results, or analytics — those are
Phase 8+.

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
the *quiz* (one per published quiz). `quiz_sessions.session_token` (Phase
6 creates it, Phase 7 is what actually uses it beyond a placeholder) is a
*different*, per-participant, single-use value — the two are never
conflated or interchanged.

## Student access (Phase 6)

**Unblocked by a scoped `service_role` grant, applied after explicit
approval.** Phase 6 initially stopped here — student-facing code has no
Supabase Auth session to key RLS off, so it needs the service-role admin
client for everything, and that client had zero table grants (see
database.md → "service_role privileges" for the full investigation). The
approved fix was the smallest grant that unblocks exactly this flow:

```sql
grant select on public.quizzes to service_role;
grant select, insert on public.participants to service_role;
grant select, insert on public.quiz_sessions to service_role;
```

Applied via migration `20260830130000_grant_student_access_privileges.sql`
and verified live afterward — `service_role` has exactly those five
grants and nothing else (no `UPDATE`/`DELETE` anywhere, no `responses`
access), `anon`'s grants are unchanged (still nothing), and no RLS policy
was touched — `service_role` already has `rolbypassrls = true`, so the
grant alone is sufficient.

```
Student opens /join/{access_code}
  → src/lib/student/access.ts: loadPublishedQuizByToken(token)
      admin client: SELECT quizzes WHERE access_code = token AND status = 'published'
      → no row (wrong token, draft, or closed quiz — all indistinguishable)
        or a past ends_at → same "not available" family of responses
  → renders quiz info (title, MC/TF/total counts, time limit, deadline)
    + first/last name form
  → src/lib/student/join-actions.ts: startSession(token, formData)
      re-validates the token AND the deadline again (never trusts the
      page's earlier check — a student can submit long after page load)
      → INSERT participants (quiz_id from the re-validated token, never
        from the client)
      → INSERT quiz_sessions (status='started', started_at=now(),
        expires_at computed from duration_minutes/ends_at/a 24h fallback,
        session_token = a fresh opaque token, total_questions snapshotted
        from the quiz)
  → redirect to /quiz/{session_token} — a placeholder confirmation page;
    the actual question-answering UI is Phase 7, not built here
```

**Reused the existing token machinery — no second token system.**
`generateAccessToken()` (Phase 6 publishing, `crypto.randomBytes(24)`
base64url) is called again, unchanged, to mint
`quiz_sessions.session_token` — a schema column Phase 1 already
provisioned for exactly this ("a unique session with its own secure
identifier"), sitting unused until now. The quiz-level `access_code` and
the session-level `session_token` are deliberately different values with
different lifetimes (one long-lived link per quiz; one single-use token
per participant) and are never interchangeable.

**Deadline enforcement is server-side and re-checked twice.**
`loadPublishedQuizByToken` compares `ends_at` against `Date.now()` both
when the join page renders *and* again inside `startSession` at submit
time — a student who opens the page before the deadline and submits after
it passes is still blocked, because the second check runs fresh, not
because the first one's result was cached or trusted.

**Duplicate-start protection is a client-side reentrancy guard, not
server-side deduplication.** `JoinForm` guards `handleSubmit` with a
`useRef` flag (not just `isSubmitting` state) checked *before* anything
else runs: a ref mutation is synchronous and visible to the very next
invocation immediately, whereas React state only reaches the DOM's
`disabled` attribute on the next render — which is late enough for two
back-to-back clicks to both start the handler. This was verified to
matter: an initial version using only state let two rapid clicks create
two participants; switching the guard to a ref (still purely client-side,
no server changes) fixed it. Reopening the join link later is intentionally
allowed to start a brand-new, independent session — first + last name are
never treated as a unique identity, and no matching against past
participants is attempted, per the task's own explicit MVP direction.

**No new database identifiers are ever exposed to the student.** The
join URL carries only the quiz's `access_code`; the post-start URL
carries only the session's `session_token`. Neither `quizzes.id`,
`participants.id`, `quiz_sessions.id`, nor the teacher's id ever appears
in a URL, a form field, or rendered text on either student-facing page.

**"Ready for publishing" is computed, never persisted** — see "Quiz
lifecycle" above.

## Student quiz player (Phase 7)

**Unblocked by its own scoped `service_role` grant**, found and applied
the same way as Phase 6's: re-checked live (still zero grants on
`questions`/`answers`/`responses`, no `UPDATE` anywhere) before writing
any code, then a minimal migration —

```sql
grant select on public.questions to service_role;
grant select on public.answers to service_role;
grant update on public.quiz_sessions to service_role;
grant select, insert, update on public.responses to service_role;
```

— applied via `20260902120000_grant_student_quiz_player_privileges.sql`
and verified live: exactly those grants, nothing more, `anon` unchanged.
Full detail: [database.md](./database.md) → "service_role privileges".

```
Student opens /quiz/{session_token}
  → src/lib/student/quiz-session.ts: loadPlayableSession(token)
      admin client: SELECT quiz_sessions WHERE session_token = token,
      joined to quizzes(title, status) and participants(first_name)
      → no row, or quiz status != 'published' → "not_found"
      → status == 'completed' → "completed"
      → expires_at <= now() → lazily mark status='expired' → "expired"
      → otherwise "active":
          question_order empty? generate a Fisher-Yates shuffle of this
          quiz's question ids, and of each question's answer ids, and
          persist it onto quiz_sessions.question_order (compare-and-swap
          on `status` so two racing loads can't disagree) — status also
          moves started -> in_progress here
          load questions/answers in that persisted order, load this
          session's existing responses to pre-fill selections
          → return questions/answers (never is_correct) + expiresAt
  → renders <QuizPlayer>: progress, timer, MC/TF options, prev/next,
    a numbered question-jump row, and Submit on the last question
  → selecting an option: src/lib/student/response-actions.ts submitAnswer()
      re-derive session from token; reject if completed or expires_at
      has passed (lazily marking expired); confirm questionId is one of
      this session's own shuffled questions; confirm answerId genuinely
      belongs to questionId via a fresh answers lookup; compute
      is_correct from that lookup (never from the client); upsert one
      responses row on (session_id, question_id)
  → Submit (confirm dialog) → submitQuiz(): idempotent if already
      completed; rejects if expired; otherwise status='completed',
      completed_at=now() — no score is computed or persisted
```

**Randomization is persisted, not just seeded.** `quiz_sessions.
question_order` (a Phase 1 column, unused until now) stores a jsonb
`{ questions: uuid[], answers: { [questionId]: uuid[] } }` — display order
only; which `answers` row is actually correct never changes. Every load
after the first reads this persisted value, which is what makes "the same
session always sees the same order" hold across refreshes — a
deterministic hash-of-token shuffle was considered (and would have been
the right call if persistence weren't available) but a real random
shuffle plus the column Phase 1 already provisioned for this purpose was
the smaller, more direct solution.

**`is_correct` is computed server-side, from the database, on every
write — never from the client, and never sent to the client.**
`submitAnswer` looks up the real `answers` row for the client-claimed
`answerId` itself; the response it returns to the browser never includes
`is_correct` for any answer, correct or not. `loadPlayableSession`'s
question/answer shapes likewise never carry `is_correct`.

**Every relationship is re-verified on every write, not cached from the
session's own shuffle.** `submitAnswer` confirms `questionId` is one of
this session's own persisted question ids, and separately confirms
`answerId` belongs to that exact `questionId` via a fresh `answers`
lookup — an answer for a different question in the same quiz, or a
question from an entirely different quiz, is rejected either way, and
this was verified directly, not just reasoned about.

**Expiry has two distinct terminal states, and `expires_at` — not
`status` — is the only real authority.** A session that runs out of time
without ever submitting is `expired`; a session the student explicitly
submits (whether or not the clock was close to running out) is
`completed`. `submitQuiz` refuses to complete an already-expired session,
so a slow request can't sneak a late submission past the deadline; every
`submitAnswer` call independently re-checks `expires_at` too, so the
client's own countdown display is never the actual enforcement — it can
lag or drift and the server still rejects the write. Both `quiz-
session.ts` and `response-actions.ts` share one `isSessionExpired()`/
`markSessionExpired()` helper (`src/lib/student/expiry.ts`) so this check
and its "lazily record the expired status" side effect can't drift apart
between the read path and the write path.

**The timer display is a refinement, not the enforcement.** `QuizPlayer`
corrects for client/server clock skew using one server timestamp sampled
when the session loaded, then ticks down client-side — purely for what
the student sees; the real check is always the server's own `expires_at`
comparison on the next write. This codebase's React Compiler lint rules
forbid calling `Date.now()` during render (including inside `useMemo`),
so every impure timer read lives inside a `useEffect`, and "has time run
out" is a value derived from the ticking countdown rather than a second
piece of state a separate effect sets — two real lint errors here were
fixed, not suppressed, during Phase 7 (see development-progress.md).

**No new database identifiers are exposed to the student here either.**
The player receives question/answer ids (needed to know what to submit)
but never a quiz id, a teacher id, or the raw `quiz_sessions.id` — only
the opaque `session_token` already in the URL.

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

Multiple Choice correctness is stored as a foreign key (`answers.
is_correct` per answer row), never as a positional letter. Question order
and every question's answer-option order are shuffled per session (Phase
7, `src/lib/student/shuffle.ts`, a `crypto.randomInt` Fisher-Yates) and
persisted onto `quiz_sessions.question_order` the first time a session is
loaded, so re-rendering the same session is always consistent — but the
underlying `answers` rows, and which one is correct, never change.
`submitAnswer` (Phase 7) resolves a submitted `selected_answer_id` against
the real `answers` table itself on every write, computing `is_correct`
there — never from `question_order`, and never from anything the client
sends. Per-response correctness is recorded this way starting in Phase 7;
aggregate scoring from those responses is Phase 8.

## Availability and timing enforcement

`starts_at`/`ends_at` (the quiz's deadline) and `duration_minutes` are
enforced server-side at two points, by two different phases: (1) Phase 6
— session creation (`startSession`) is refused outside the availability
window, checked both when the join page renders and again at submit
time; `quiz_sessions.expires_at` is computed once, at that point, from
`duration_minutes` → `ends_at` → a 24h fallback, and stored — it is not
recomputed later. (2) Phase 7 — every mutation on an existing session
(`submitAnswer`, `submitQuiz`) independently re-checks that stored
`expires_at` against the current time before writing anything, lazily
recording an `expired` status the first time a check catches it past due
(`src/lib/student/expiry.ts`). Neither point trusts a client-reported
timer; the countdown a student sees is a display only (see "Student quiz
player" above).

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
      results/              Empty-state shell, Phase 8/9 fill it in
      settings/             Read-only account info (real profile data)
      _components/          Sidebar, Header, StatCard, mobile nav (Sheet-based)
    (student)/               Public, no auth, no admin chrome
      join/[token]/            Phase 6 — validate token, show quiz info, collect name, start a session
        _components/             join-form.tsx
      quiz/[sessionToken]/     Phase 7 — the real student quiz player
        _components/             quiz-player.tsx
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
      access-token.ts                Phase 6 — generateAccessToken() (crypto.randomBytes), reused for session_token too
      publish-actions.ts              Phase 6 — publishQuiz
    student/
      schema.ts                Phase 6 — Zod shape for first/last name input
      access.ts                 Phase 6 — loadPublishedQuizByToken (service-role client)
      join-actions.ts             Phase 6 — startSession (participant + quiz_session creation)
      shuffle.ts                    Phase 7 — crypto.randomInt Fisher-Yates
      expiry.ts                      Phase 7 — isSessionExpired/markSessionExpired, shared by the two files below
      quiz-session.ts                  Phase 7 — loadPlayableSession (session state + per-session shuffle)
      response-actions.ts                Phase 7 — submitAnswer/submitQuiz
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
  migrations/              Phase 1–7 — SQL schema + RLS + grants + Storage + RPC, via Supabase CLI
docs/                     Reference documentation (this directory)
```

## Deployment

Vercel, deploying the Next.js app directly. Supabase project is provisioned
separately (its own dashboard/CLI, not part of this repo's build step).
Environment variables are configured per-environment in Vercel; local
development uses `.env.local`.
