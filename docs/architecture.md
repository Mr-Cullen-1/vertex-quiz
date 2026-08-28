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
                    │   lib/ai (Gemini service)      │──▶ Google Gemini API
                    │                              │
  Student ── code ──▶  (student) route group        │
  browser           │  Server Components + Actions  │
                    └─────────────────────────────┘
```

There is no separate backend service. Route Handlers and Server Actions in
the Next.js app are the entire API surface; Supabase is the only external
system of record besides Gemini.

## Route groups

- `app/(admin)/...` — teacher-facing SaaS dashboard. Requires an
  authenticated Supabase session. Added in Phase 2.
- `app/(student)/join/[code]/...` — public student flow. No authentication;
  identity is a per-session token created on entry. Added in Phase 7.
- `app/page.tsx` — minimal public landing/status page (Phase 0).

Route protection for `(admin)` uses the Next.js 16 `proxy.ts` convention
(exported `proxy` function), not the deprecated `middleware.ts`.

## Server/client boundary

- Server Components read data directly via a server-side Supabase client.
- Mutations go through **Server Actions** (teacher dashboard forms, student
  quiz submission) or **Route Handlers** where a plain HTTP endpoint is a
  better fit (e.g. file upload, potential webhook-style calls).
- Client Components are used only where interactivity requires it: quiz
  taking UI (timer, answer selection, transitions), question editor
  interactions, file upload progress.
- The Gemini API key and the Supabase service-role key are read only inside
  server-only modules (Server Actions / Route Handlers / server utilities in
  `src/lib/*`) and are never imported by a file that ships to the client.

## AI pipeline isolation

Gemini access is centralized behind a server-only service module (planned
`src/lib/ai/`, built in Phase 4):

```
PDF (Supabase Storage) → Gemini request → raw JSON response
  → Zod schema validation → application-level validation
  (option counts, duplicate checks, correctness invariants)
  → draft questions persisted to Postgres (status: draft)
```

Nothing downstream of "draft questions persisted" trusts the AI output
further — the teacher review screen is the only path to `published`.

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
    icon.tsx              Generated favicon
    (admin)/              Phase 2+
    (student)/join/[code]/ Phase 7+
  components/
    ui/                   shadcn/ui primitives
  lib/
    utils.ts              cn() helper (shadcn)
    supabase/              Phase 1 — server/browser Supabase clients
    ai/                     Phase 4 — Gemini service + schemas
docs/                     Reference documentation (this directory)
```

## Deployment

Vercel, deploying the Next.js app directly. Supabase project is provisioned
separately (its own dashboard/CLI, not part of this repo's build step).
Environment variables are configured per-environment in Vercel; local
development uses `.env.local`.
