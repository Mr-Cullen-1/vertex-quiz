# Vertex Quiz

AI-powered interactive quiz platform by **Vertex Studio**. A teacher uploads a
structured educational PDF, Google Gemini drafts quiz questions from it, the
teacher reviews and publishes the quiz, and students take it through a
shareable link with just a first and last name.

> **AI never publishes a quiz automatically.** Gemini only produces a draft —
> the teacher must review, edit, and explicitly publish it.

## Features

- **AI-drafted questions** — upload a structured PDF and Gemini extracts
  Multiple Choice (exactly 4 options, 1 correct) and True/False questions,
  in a mix the teacher controls.
- **Teacher review workflow** — approve, edit, add, delete, and reorder
  questions before anything can be published.
- **Publishing & access control** — a published quiz gets a unique join
  link/access code; questions become immutable once published.
- **Anonymous student sessions** — students join with just a first and
  last name, no account required.
- **Randomized, persistent order** — question and answer order are
  shuffled once per session and stay stable across refreshes/tabs.
- **Server-enforced timer and deadlines** — remaining time and quiz
  availability windows are always re-checked server-side, never trusted
  from the client.
- **Scoring & results** — server-computed scoring, a student result
  screen, and a teacher-facing results table.
- **Analytics** — per-quiz completion rate, score distribution, and
  question-by-question success rate.

## Tech stack

| Layer          | Choice                                              |
| -------------- | ---------------------------------------------------- |
| Framework      | Next.js (App Router), TypeScript                     |
| Styling        | Tailwind CSS                                         |
| UI components  | shadcn/ui, Lucide React icons                        |
| Backend        | Next.js Server Components, Server Actions, Route Handlers |
| Database       | Supabase (PostgreSQL) with Row Level Security        |
| Auth           | Supabase Auth (teachers only — students are anonymous sessions) |
| Storage        | Supabase Storage (uploaded PDFs)                     |
| AI             | Google Gemini API (server-side only)                 |
| Validation     | Zod                                                   |
| Deployment     | Vercel                                                |

## Architecture

- **Admin (teacher) app** — a Supabase-authenticated SaaS dashboard under
  the `(admin)` route group. Server Components read data, Server Actions
  mutate it; ownership, publishing rules, and correctness are always
  enforced server-side.
- **Student app** — public and unauthenticated, under the `(student)`
  route group, reached via `/join/{ACCESS_CODE}`.
- **AI pipeline** — an isolated server-side module (`src/lib/gemini/`),
  never called from the client. Gemini's raw output is only
  shape-checked with Zod; a separate validation layer
  (`src/lib/gemini/validate.ts`) is the actual authority on exact
  question/answer counts and correctness.

See [CLAUDE.md](./CLAUDE.md) for the full project context (principles,
architecture, database, security rules, design system, and phase status),
and [docs/](./docs) for deeper reference docs (database schema,
architecture notes, the AI pipeline design, and development history).

## Prerequisites

- Node.js 20 or later, and npm
- A [Supabase](https://supabase.com) project (free tier is enough for
  local development)
- A [Google Gemini API key](https://aistudio.google.com/apikey)
- (Optional) the [Supabase CLI](https://supabase.com/docs/guides/cli), to
  apply migrations with `supabase db push`

## Local installation

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Gemini credentials, see below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See [.env.example](./.env.example) for the full list. `GEMINI_API_KEY` and
`SUPABASE_SECRET_KEY` are server-only secrets and must never be prefixed
with `NEXT_PUBLIC_` or referenced from client code — see
[Security notes](#security-notes).

## Supabase setup

1. Create a Supabase project and copy its URL, publishable (anon) key,
   and secret (service-role) key into `.env.local`.
2. Apply the schema: every table, RLS policy, grant, and RPC lives in
   `supabase/migrations/`, applied in order. With the Supabase CLI linked
   to your project, run:
   ```bash
   supabase db push
   ```
   (or apply each file in `supabase/migrations/` through the SQL editor,
   in filename order, if you're not using the CLI).
3. Create a **private** Storage bucket named `quiz-pdfs` if it wasn't
   created by the migrations in your Supabase version — see
   [docs/database.md](./docs/database.md) for the exact bucket/RLS setup
   this project expects.

## Gemini API setup

Create an API key at [Google AI Studio](https://aistudio.google.com/apikey)
and set it as `GEMINI_API_KEY` in `.env.local`. The key is read once,
server-side only (`src/lib/gemini/client.ts`), and is never sent to the
browser.

## Scripts

| Command            | Purpose                                     |
| ------------------ | -------------------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack)            |
| `npm run build`     | Production build                            |
| `npm run start`     | Run the production build                    |
| `npm run lint`      | Lint the codebase                           |
| `npm test`          | Run the unit tests (Node's built-in runner) |
| `npm run lint:sql`  | Lint the Supabase migration SQL files       |

## Project structure

```
src/
  app/
    (admin)/     # Teacher dashboard, quiz creation/review/results/analytics
    (student)/   # Public join + quiz-taking + result pages
  components/ui/ # Shared shadcn/ui-based primitives (Button, Dialog, ...)
  lib/
    gemini/      # Server-only Gemini client, prompt, schema, validation
    quizzes/     # Teacher-side server actions (create/edit/publish/review)
    student/     # Student-side server actions (join/answer/submit/scoring)
    supabase/    # Server, browser, and admin (service-role) Supabase clients
supabase/
  migrations/    # SQL schema, RLS policies, grants, and RPCs, in order
docs/            # Architecture, database, and AI-pipeline reference docs
```

## Security notes

- `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` are read only in
  `server-only`-guarded modules and are never sent to the browser.
- Row Level Security is enabled on every table holding teacher or student
  data; student-facing writes go through a service-role admin client
  server-side rather than a client-side RLS policy (see
  [docs/database.md](./docs/database.md)).
- The server always recomputes quiz availability, session expiry,
  question correctness, and score — client-submitted values for these are
  never trusted.
- `.env.local` is gitignored; only `.env.example` (names, no values) is
  committed.

## Current MVP scope

Two question types (Multiple Choice, True/False), PDF-only input in a
predefined structured format, no student accounts, and a teacher-controlled
question mix. Explicitly out of scope for this MVP: templates, AI result
analysis, leaderboards, teams, real-time multiplayer, DOCX/PPTX, OCR,
open-ended questions, billing, and a question bank. See
[CLAUDE.md](./CLAUDE.md) for the full, current list.

## Project status

Vertex Quiz is built in controlled phases; each phase is implemented, tested,
documented, and committed before the next one begins. See
[docs/development-progress.md](./docs/development-progress.md) for current
status.
