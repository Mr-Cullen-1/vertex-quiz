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

Route protection uses the Next.js 16 `proxy.ts` convention (exported
`proxy` function, at `src/proxy.ts` — same level as `src/app`), not the
deprecated `middleware.ts`. As of Phase 1, `proxy.ts` only refreshes the
Supabase auth session cookie on every request (via
`src/lib/supabase/middleware.ts`) — there is nothing to redirect yet, since
`(admin)` doesn't exist until Phase 2. It no-ops when Supabase isn't
configured (see Environment configuration below), so the app keeps working
before real credentials exist. Proxy-level checks are optimistic in any
case: real authorization always happens at the data layer via RLS, per the
Next.js authentication guide's Data Access Layer guidance
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`).

## Server/client boundary

- Server Components read data directly via a server-side Supabase client
  (`src/lib/supabase/server.ts`, RLS-respecting).
- Mutations go through **Server Actions** (teacher dashboard forms, student
  quiz submission) or **Route Handlers** where a plain HTTP endpoint is a
  better fit (e.g. file upload, potential webhook-style calls).
- Client Components are used only where interactivity requires it: quiz
  taking UI (timer, answer selection, transitions), question editor
  interactions, file upload progress. They get a Supabase client from
  `src/lib/supabase/client.ts` when they need one directly (e.g. the Phase 2
  login form).
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

## Environment configuration

`src/lib/env.ts` validates every required environment variable with Zod
the first time `getEnv()` is called (not at import time, so a page that
doesn't touch Supabase/Gemini keeps working even before those credentials
exist) and throws one readable error listing everything missing/invalid.
`isSupabaseConfigured()` offers a cheap, non-throwing presence check for
code — currently just `proxy.ts` — that must degrade gracefully instead.

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
    icon.png, apple-icon.png  Favicon / Apple touch icon (real logo, Phase 0)
    (admin)/              Phase 2+
    (student)/join/[code]/ Phase 7+
  components/
    ui/                   shadcn/ui primitives
  lib/
    utils.ts              cn() helper (shadcn)
    env.ts                 Phase 1 — Zod-validated environment variables
    supabase/
      server.ts            Phase 1 — RLS-respecting server client (cookie-bound)
      client.ts             Phase 1 — browser client (Client Components)
      admin.ts               Phase 1 — service-role client (bypasses RLS)
      middleware.ts           Phase 1 — session-refresh helper used by proxy.ts
    ai/                     Phase 4 — Gemini service + schemas
  proxy.ts                 Phase 1 — session-refresh Proxy (see Route groups)
supabase/
  migrations/              Phase 1 — SQL schema + RLS, applied via Supabase CLI
docs/                     Reference documentation (this directory)
```

## Deployment

Vercel, deploying the Next.js app directly. Supabase project is provisioned
separately (its own dashboard/CLI, not part of this repo's build step).
Environment variables are configured per-environment in Vercel; local
development uses `.env.local`.
