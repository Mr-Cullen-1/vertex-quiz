# CLAUDE.md — Vertex Quiz project context

This file is the persistent context for AI-assisted development on Vertex
Quiz. Read it before making changes. It is kept up to date at the end of
every phase.

## 1. Project overview

**Vertex Quiz** (brand: **Vertex Studio**) is an AI-powered interactive quiz
platform for teachers and students.

Flow:

```
PDF → Gemini → structured questions → validation → draft
    → teacher review/edit → publish → student session → results → analytics
```

A teacher uploads a structured educational PDF. Gemini extracts and
structures quiz questions from it. The teacher reviews, edits, and configures
the quiz, then publishes it. Students open a join URL/access code, enter
their first and last name, take the quiz under a timer, and see their score.
The teacher gets participant results and basic analytics.

Full requirements: [docs/product-spec.md](./docs/product-spec.md).

## 2. Core product principle

**AI never publishes a quiz automatically.** Gemini output is always a
**draft**. Only the teacher can approve, edit, and publish. This is
non-negotiable and must not be weakened by any future feature.

## 3. MVP scope

- Two question types only: **Multiple Choice** (exactly 4 options, 1
  correct) and **True/False** (exactly 1 correct boolean).
- The teacher controls the question mix (total / MC count / TF count, with
  optional presets) — never hardcode a fixed ratio.
- PDF only, in a predefined structured format. No DOCX/PPTX/OCR/images.
- Students never create accounts; they join via `/join/{ACCESS_CODE}` with a
  first + last name and get a unique session.
- Out of scope for MVP (do not build unless explicitly requested): templates,
  AI result analysis, leaderboards, teams, real-time multiplayer, DOCX/PPTX,
  OCR, open-ended questions, billing, orgs/roles, mobile app, question bank,
  advanced reporting.

## 4. Tech stack

- **Framework:** Next.js (App Router) + TypeScript, `src/` layout
- **Styling:** Tailwind CSS v4 (CSS-based `@theme`)
- **UI:** shadcn/ui (`base-nova` style, base-ui primitives) + Lucide React icons
- **Backend:** Next.js Server Components, Server Actions, Route Handlers
- **Database:** Supabase PostgreSQL with Row Level Security
- **Auth:** Supabase Auth — teachers only; students are anonymous sessions
- **Storage:** Supabase Storage — uploaded PDFs
- **AI:** Google Gemini API via `@google/genai` (the current official SDK —
  the older `@google/generative-ai` is superseded), model
  `gemini-flash-latest`. Called server-side only, from
  `src/lib/gemini/` (Phase 4).
- **Validation:** Zod, at every AI-output and user-input boundary
- **Deployment:** Vercel · **Package manager:** npm

### Next.js 16 — important, non-obvious constraints

This project was scaffolded on **Next.js 16**, which has real breaking
changes vs. older Next.js knowledge. Before writing framework-adjacent code,
skim `node_modules/next/dist/docs/`. Key points already load-bearing for this
project:

- `cookies()`, `headers()`, `draftMode()`, `params`, and `searchParams` are
  **always async** — no synchronous compatibility mode. Relevant to Supabase
  Auth server clients (Phase 1) and every dynamic route.
- Route protection middleware is the **`proxy.ts`** convention (exported
  function `proxy`), not `middleware.ts`/`middleware`. `edge` runtime is not
  supported in `proxy` — it always runs on `nodejs`.
- Turbopack is the default for both `next dev` and `next build` — no
  `--turbopack` flag needed.
- `cacheComponents` / Partial Prerendering is **opt-in** and deliberately
  **not enabled** for this MVP — it adds `<Suspense>`-boundary and caching
  requirements the project doesn't need yet. Revisit only if a real
  performance need justifies it (see development principle: no
  over-engineering).
- `next lint` was removed; linting runs through the ESLint CLI directly
  (`npm run lint`), using flat config (`eslint.config.mjs`).

## 5. Architecture

- **Admin (teacher) app** — SaaS dashboard, Supabase-authenticated, lives
  under an `(admin)` route group. Shell (login/dashboard/results/settings)
  built in Phase 2; quiz draft creation/editing/deletion
  (`/quizzes/new`, `/quizzes/[id]`, `/quizzes/[id]/edit`) added in Phase 3;
  PDF upload + Gemini question generation (`generateQuestions`,
  `uploadQuizPdf`) added in Phase 4; question review/edit/add/delete/
  reorder (`/quizzes/[id]/review`) added in Phase 5. Server Components
  read data; Server Actions mutate it; business rules (ownership,
  publishing rules, correctness) are enforced server-side, never trusted
  from the client. Quiz lifecycle: `draft (metadata)` → `draft (with
  generated/manual questions)` → `draft (all questions approved →
  "ready for publishing", computed not persisted — Phase 5, done)` →
  (Phase 6 publish) → `published → closed` — nothing past `draft` exists
  yet; see [docs/architecture.md](./docs/architecture.md) → "Quiz
  lifecycle".
- **Student app** — public, unauthenticated, lives under a `(student)` route
  group. Reached via `/join/{ACCESS_CODE}` (Phase 6: token validation, name
  entry, participant/session creation); the real quiz-taking player at
  `/quiz/{session_token}` (randomized order, answer persistence, timer,
  submit) was added in Phase 7. Interactive, game-inspired but not a
  Kahoot clone.
- **AI pipeline** — isolated server-side service, `src/lib/gemini/`
  (Phase 4, implemented). Never called from the client; the Gemini API key
  never leaves the server. Gemini's raw output is Zod-shape-checked only —
  `src/lib/gemini/validate.ts` is the actual correctness authority (exact
  counts, exact answers, exact correctness), matching
  [docs/ai-pipeline.md](./docs/ai-pipeline.md)'s original design.
- Full detail: [docs/architecture.md](./docs/architecture.md) and
  [docs/ai-pipeline.md](./docs/ai-pipeline.md).

## 6. Database structure (implemented — Phase 1)

Core tables: `profiles`, `quizzes`, `questions`, `answers`, `participants`,
`quiz_sessions`, `responses`, as SQL migrations under
`supabase/migrations/`. UUID primary keys, explicit foreign keys,
timestamps, and constraints — including a deferred constraint trigger
enforcing the answer-count/correctness invariant per question (a backstop
behind Zod + application validation, not a replacement for it). Row Level
Security scopes teachers to their own quizzes/data; students never see
teacher/admin data — student-facing writes go through a service-role admin
client server-side instead of an RLS policy. Correctness is always keyed by
answer **ID**, never by letter (no `correct = "B"`). Full schema:
[docs/database.md](./docs/database.md).

**Applied to the real Supabase project** via `supabase db push`
(2026-08-29) and independently re-verified against the live database —
tables, PKs/FKs/`ON DELETE` behavior, indexes, `CHECK` constraints, RLS
enabled + all 17 policies, and a live functional test of the deferred
answer trigger (rolled back, no residual data). `.env.local` now holds real
project credentials. The graceful-degradation path (`src/lib/env.ts`,
`isSupabaseConfigured()`) stays in the code — it's what keeps the app from
crashing in any environment where Supabase isn't configured (e.g. a fresh
clone before `.env.local` is filled in), not a statement about the current
environment.

**Non-obvious gotcha, learned the hard way in Phase 2:** RLS policies do
nothing if the underlying role has no table-level `GRANT`. This project's
Supabase instance does **not** auto-expose new tables to
`anon`/`authenticated` — Phase 1 assumed it would, and every real query
silently failed with `permission denied` until
`20260829120200_grant_teacher_table_privileges.sql` granted exactly what
each table's RLS policies already allow. If a *new* table is ever added,
it needs an explicit `GRANT` migration too — don't assume Supabase does
this automatically. Full story:
[docs/database.md](./docs/database.md) → "Table privileges".

**Phase 4 additions — no table/column changes:** a private `quiz-pdfs`
Storage bucket + `storage.objects` RLS policies (same one-folder-per-owner
pattern as every teacher-scoped table), and one Postgres function,
`create_quiz_questions()`, so a whole Gemini-generated batch commits or
rolls back atomically. Details: [docs/database.md](./docs/database.md) →
"Storage and RPC".

**Phase 5 additions — one column, four functions:**
`questions.review_status` (`pending`/`approved`, default `pending`), plus
`add_quiz_question()`/`update_quiz_question()`/`delete_quiz_question()`/
`reorder_quiz_questions()` for atomic multi-table question management —
each keeps `quizzes.multiple_choice_count`/`true_false_count`/
`total_questions` in sync with the real row count. No `quizzes.status`
change: "ready for publishing" is computed from `review_status`, never
persisted. Also discovered (documented, not fixed — a future-phase
concern): `service_role` has no table grants on this project either, same
gotcha as the one below but for the admin client. Details:
[docs/database.md](./docs/database.md) → "Question management RPCs" and
"Table privileges".

**Phase 6 — no table/column schema change; one privilege migration.**
`quizzes.status`'s `'published'` value, `published_at`, `ends_at`
(deadline), `access_code` (the quiz-level join token), and
`quiz_sessions.session_token` (the per-participant session token,
`generateAccessToken()` reused verbatim for both) all already existed
from Phase 1. Published-quiz immutability needed zero new code — every
question mutation/RPC already gated on `status = 'draft'`. `service_role`
had zero table grants (found in Phase 5, confirmed still true when Phase
6 started) — reported rather than worked around, then fixed with exactly
the proposed minimal grant (`quizzes`: `SELECT`; `participants`/
`quiz_sessions`: `SELECT, INSERT`) once approved, via
`20260830130000_grant_student_access_privileges.sql`. Verified live
afterward: `service_role` has exactly those five grants and nothing
more, `anon` unchanged. Details: [docs/database.md](./docs/database.md)
→ "service_role privileges".

Note on phase numbering: this closes out what an earlier version of the
table below called Phase 7 ("Student entry and session") too — the
approved Phase 6 task explicitly scoped in `/join/{token}`, participant
creation, and quiz_session creation. The table in §10 has since been
renumbered so the next real work (the actual question-answering UI) is
Phase 7, not Phase 8 — see the note under that table.

**Phase 7 — no table/column schema change; one privilege migration.**
`quiz_sessions.question_order` and its `in_progress`/`completed`/
`expired` status values, plus the entire `responses` table, all already
existed from Phase 1 and sat unused until now. `service_role` again had
zero grants on `questions`/`answers`/`responses` (re-checked live, same
discipline as Phase 6) — fixed via
`20260902120000_grant_student_quiz_player_privileges.sql`
(`questions`/`answers`: `SELECT`; `quiz_sessions`: adds `UPDATE` to its
existing `SELECT, INSERT`; `responses`: `SELECT, INSERT, UPDATE`).
Verified live afterward: exactly those grants, nothing more, `anon`
unchanged. Randomized per-session question/answer order is generated once
and persisted onto `quiz_sessions.question_order` (a compare-and-swap on
`status` prevents two racing loads from disagreeing); answers are upserted
into `responses` on its existing `unique (session_id, question_id)`
constraint, with `is_correct` always computed server-side from the real
`answers` row, never from the client. Details:
[docs/database.md](./docs/database.md) → "service_role privileges".

**Phase 8 — no schema change, no privilege migration at all.**
`quiz_sessions.score`/`.correct_answers` already existed from Phase 1 and
sat unused until now; `service_role`'s Phase 7 `UPDATE` on `quiz_sessions`
and `SELECT` on `responses`, plus `authenticated`'s Phase 2 `SELECT`
grants scoped by Phase 1's RLS, were already exactly what scoring and a
teacher results page need — checked live before writing any code, same
discipline as every other phase, and confirmed sufficient rather than
assumed. `src/lib/student/scoring.ts`'s `finalizeSession()` computes a
result from `responses.is_correct` (never re-touching `answers`, never
trusting the client) and persists it in one `UPDATE` guarded by a
compare-and-swap on `status`, so a double submit or a submit racing an
expiry detection can't produce two different results. Details:
[docs/database.md](./docs/database.md) → "service_role privileges" and
[docs/architecture.md](./docs/architecture.md) → "Scoring and results".

Full verification logs (Phase 1–8):
[docs/development-progress.md](./docs/development-progress.md).

## 7. Development rules

1. Work **phase by phase** (see §10) — implement, run, fix, review, update
   docs, commit, report, then **stop** for confirmation before continuing.
2. Production-quality, reusable, simply-architected code. No speculative
   abstractions, no unused dependencies, no half-finished features.
3. TypeScript strict mode stays on.
4. Validate all user input and all AI output with Zod at the boundary.
5. Keep business logic server-side. Never trust the client for score,
   correctness, availability windows, session expiry, or ownership.
6. Build meaningful error/empty states, not just the happy path.
7. Responsive at desktop and mobile widths.
8. Don't silently change product requirements — explain the reasoning first
   if a change seems warranted, then wait for a decision.
9. Commit per completed phase with a clear `feat: ...` message, never one
   giant commit.

## 8. Security rules

- Never expose `SUPABASE_SECRET_KEY` or `GEMINI_API_KEY` to the client,
  and never prefix them with `NEXT_PUBLIC_`.
- Secrets live in `.env.local` (gitignored); `.env.example` documents the
  shape only.
- Row Level Security enforced on every table holding teacher or student data.
- Server always recomputes: quiz availability window, session expiry,
  question correctness, and score. Client-submitted values for these are
  never trusted.
- Multiple-choice correctness is tracked by `correct_answer_id`
  (answer-record reference), never by a display letter — display order is
  randomized per student session without ever changing which record is
  correct.

## 9. Design system — "Vertex Studio"

Tokens live in `src/app/globals.css` as CSS variables consumed through
Tailwind's `@theme inline`, following shadcn/ui conventions (`bg-primary`,
`text-muted-foreground`, etc.). Semantic additions beyond shadcn defaults:
`success`, `warning`, and `ai` (for AI-processing states), each with a
`-foreground` pair.

- **Primary:** deep navy — professional, SaaS-grade.
- **Background:** very light neutral; **cards:** white; **borders:** subtle.
- **Accent:** Vertex violet-indigo — used sparingly for interactive/brand/AI
  moments, not on every card.
- **Sidebar:** intentionally dark navy in both light and dark mode, per the
  admin dashboard reference direction — the one deliberate exception to the
  light/white admin surface.
- **Radius:** `0.5rem` base — slightly tighter than shadcn's default, to
  read more precise/premium in line with the logo's angular geometry.
- **Admin surface:** professional SaaS/analytics feel, restrained rounded
  corners, generous whitespace, one controlled accent used for emphasis
  only (not color-coding every card).
- **Student surface:** same token system, but layouts should feel more
  interactive/game-like (large question, prominent timer/progress, clear
  selection state) — inspired by Kahoot's energy, not a copy of its look.
- Rounded corners, spacing, and color usage should stay restrained — color
  communicates status/interaction/AI-processing, not decoration. Avoid
  excessive gradients, shadows, or glassmorphism, and avoid a generic
  "AI landing page" or childish-EdTech look.

### Brand assets

The real Vertex Studio logo (an angular "V" mark, white on a solid black
square — no transparency) is used as-is, never recreated or substituted with
a text placeholder:

- Source archive: `photos/logo.png`
- Shipped copy: `public/brand/logo.png` (rendered via `next/image`)
- Favicon: `src/app/icon.png` · Apple touch icon: `src/app/apple-icon.png`

Because the source file has no alpha channel, the logo is always displayed
at a small fixed size with rounded corners (a "logo chip"), not stretched or
placed on a background that would expose its square edges as an artifact.

Full provenance and the extracted visual-reference principles (from
`photos/style.webp`, a third-party dashboard used as inspiration only, never
copied into `public/`): [REFERENCES.md](./REFERENCES.md).

## 10. Development phases

Phases are implemented one at a time. After each: implement → run → fix →
review → update docs (`docs/development-progress.md`) → commit → report what
was done and what to manually test → **stop** and wait for explicit
confirmation to continue.

| # | Phase | Status |
|---|-------|--------|
| 0 | Project initialization | ✅ Done |
| 1 | Supabase foundation (auth, schema, RLS) | ✅ Done — applied and verified on the real project |
| 2 | Teacher authentication and dashboard | ✅ Done — verified end-to-end with a real login |
| 3 | Create Quiz and PDF upload | ✅ Done — PDF upload landed as part of Phase 4 |
| 4 | Gemini AI extraction | ✅ Done — verified end-to-end with a real PDF and a real Gemini call |
| 5 | Question review and editor | ✅ Done — approve/edit/add/delete/reorder, verified end-to-end |
| 6 | Quiz publishing and student access | ✅ Done — publishing, access token, `/join/{token}`, participant + session creation; student entry/session folded in here too (an earlier version of this table listed that as a separate Phase 7 — see below) |
| 7 | Student quiz player | ✅ Done — randomized per-session order, answer persistence, server-enforced timer, submit; verified end-to-end |
| 8 | Scoring and results | ✅ Done — server-side scoring on submit/expiry, student result screen, teacher per-quiz results table; verified end-to-end |
| 9 | Analytics | Not started |
| 10 | Final MVP polish | Not started |

**Current phase:** 8 (Scoring and results) — **complete**. Every session
that ends — explicit submit or expiry — is scored server-side from its
saved `responses` (never from anything the client sends) and the result
is persisted onto `quiz_sessions.score`/`.correct_answers` — columns
Phase 1 provisioned and left unused until now. A student sees their own
result (score %, correct/incorrect/unanswered/total, their name, the quiz
title) on the same `/quiz/{session_token}` route the moment their session
ends. A teacher sees every student's result for a quiz they own at
`/quizzes/[id]/results`, linked from a new `/results` directory and from
the quiz detail page. Needed **zero** new migrations or grants — Phase 7
had already granted everything scoring requires, and Phase 2's teacher
grants plus Phase 1's RLS already covered the results page; this was
verified live before writing any code, not assumed. No analytics,
charts, or per-question breakdowns — those are Phase 9.
**Next phase:** 9 — Analytics (quiz-level aggregates: participants,
completion rate, average/high/low score).

Note on the table above: an earlier version numbered "Student entry and
session" as its own Phase 7 (folded into Phase 6 once the actual approved
task scoped it that way) and "Student quiz experience" as Phase 8. The
table has been renumbered so the phase just completed is Phase 7 and
Results/Analytics/Final polish shift down to 8/9/10 — no scope changed,
only the numbering.

Live status detail: [docs/development-progress.md](./docs/development-progress.md).
