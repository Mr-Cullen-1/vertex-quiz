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
- **AI:** Google Gemini API, called server-side only
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
  under an `(admin)` route group (added in Phase 2). Server Components read
  data; Server Actions mutate it; business rules (ownership, publishing
  rules, correctness) are enforced server-side, never trusted from the
  client.
- **Student app** — public, unauthenticated, lives under a `(student)` route
  group (added in Phase 7). Reached via `/join/{ACCESS_CODE}`. Interactive,
  game-inspired but not a Kahoot clone.
- **AI pipeline** — isolated server-side service (Phase 4). Never called from
  the client; the Gemini API key never leaves the server.
- Full detail: [docs/architecture.md](./docs/architecture.md) and
  [docs/ai-pipeline.md](./docs/ai-pipeline.md).

## 6. Database structure (planned — implemented in Phase 1)

Core tables: `profiles`, `quizzes`, `questions`, `answers`, `participants`,
`quiz_sessions`, `responses`. UUID primary keys, explicit foreign keys,
timestamps, and constraints. Row Level Security scopes teachers to their own
quizzes/data; students never see teacher/admin data. Correctness is always
keyed by answer **ID**, never by letter (no `correct = "B"`). Full schema:
[docs/database.md](./docs/database.md).

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

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to the client,
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
- **Admin surface:** professional SaaS/analytics feel, restrained rounded
  corners, generous whitespace.
- **Student surface:** same token system, but layouts should feel more
  interactive/game-like (large question, prominent timer/progress, clear
  selection state) — inspired by Kahoot's energy, not a copy of its look.
- Rounded corners, spacing, and color usage should stay restrained — color
  communicates status/interaction/AI-processing, not decoration.

## 10. Development phases

Phases are implemented one at a time. After each: implement → run → fix →
review → update docs (`docs/development-progress.md`) → commit → report what
was done and what to manually test → **stop** and wait for explicit
confirmation to continue.

| # | Phase | Status |
|---|-------|--------|
| 0 | Project initialization | ✅ Done |
| 1 | Supabase foundation (auth, schema, RLS) | ⏳ Next |
| 2 | Teacher authentication and dashboard | Not started |
| 3 | Create Quiz and PDF upload | Not started |
| 4 | Gemini AI extraction | Not started |
| 5 | Question review and editor | Not started |
| 6 | Quiz settings and publishing | Not started |
| 7 | Student entry and session | Not started |
| 8 | Student quiz experience | Not started |
| 9 | Results | Not started |
| 10 | Analytics | Not started |
| 11 | Final MVP polish | Not started |

**Current phase:** 0 (initialization) — complete.
**Next phase:** 1 — Supabase foundation.

Live status detail: [docs/development-progress.md](./docs/development-progress.md).
