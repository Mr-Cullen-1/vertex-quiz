# Vertex Quiz

AI-powered interactive quiz platform by **Vertex Studio**. A teacher uploads a
structured educational PDF, Google Gemini drafts quiz questions from it, the
teacher reviews and publishes the quiz, and students take it through a
shareable link with just a first and last name.

> **AI never publishes a quiz automatically.** Gemini only produces a draft —
> the teacher must review, edit, and explicitly publish it.

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

See [CLAUDE.md](./CLAUDE.md) for the full project context (principles,
architecture, database, security rules, design system, and phase status), and
[docs/](./docs) for deeper reference docs.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Gemini credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Purpose                          |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the dev server (Turbopack)  |
| `npm run build` | Production build                  |
| `npm run start` | Run the production build          |
| `npm run lint`  | Lint the codebase                 |

## Environment variables

See [.env.example](./.env.example). `GEMINI_API_KEY` and
`SUPABASE_SECRET_KEY` are server-only secrets and must never be
prefixed with `NEXT_PUBLIC_` or referenced from client code.

## Project status

Vertex Quiz is built in controlled phases; each phase is implemented, tested,
documented, and committed before the next one begins. See
[docs/development-progress.md](./docs/development-progress.md) for current
status.
