# Product specification

Source of truth for what Vertex Quiz's MVP must do. If an implementation
detail here ever conflicts with the code, the code review step should treat
that as a bug to fix or a spec change to flag explicitly — not something to
silently diverge on.

## What it is

Vertex Quiz (brand: Vertex Studio) is an AI-powered interactive quiz
platform. A teacher uploads a structured educational PDF; Google Gemini
extracts and structures quiz questions from it; the teacher reviews, edits,
and configures the quiz; the teacher publishes it; students join via a
temporary URL/access code, complete the quiz, and the teacher gets results
and basic analytics.

## Core principle

AI never publishes a quiz automatically. Gemini output is always a **draft**.
Only the teacher can publish.

```
PDF → Gemini → structured questions → validation → draft
    → teacher review → edit → publish → student session → results → analytics
```

## MVP scope

### Teacher

Login · Dashboard · Create Quiz · Upload PDF · Configure question types ·
AI extraction (Gemini) · Question review · Question editing · Add question
manually · Delete question · Regenerate question/answer with AI · Publish
quiz · Set availability period · Set duration · Generate URL/access code ·
View participants · View results · Basic analytics.

### Student

Open quiz URL · Enter first name · Enter last name · Start quiz · Answer
questions · Timer · Progress indicator · Submit quiz · View final score.

## Question types (exactly two)

**Multiple Choice** — options A/B/C/D, exactly one correct answer.
**True/False** — exactly one correct boolean answer.

Rules for AI-generated questions:

- Multiple Choice: exactly 4 options, exactly 1 correct, options meaningful
  and non-empty, no duplicate options, no duplicate correct answers,
  question understandable, meaning preserved from the source material.
- True/False: exactly 1 statement, exactly 1 correct boolean.
- The AI must not invent unrelated information — questions are grounded in
  the uploaded PDF.

## Question mix

The teacher controls the total question count and the split between
Multiple Choice and True/False — **never hardcode a fixed ratio (e.g.
70/30)**. Convenient presets (100% MC, 70/30, 50/50, 30/70, 100% TF) may be
offered, but manual exact counts must remain possible. Invariant:

```
multiple_choice_count + true_false_count = total_questions
```

The composition belongs to the quiz; every student receives the same number
of each question type (question order and MC option order may still be
randomized per session — see below).

## PDF scope

PDF only, following a predefined structured format communicated clearly to
the teacher. No DOCX, PPTX, images, OCR, or arbitrary scanned documents in
the MVP.

## AI (Google Gemini)

- Gemini extracts and structures questions from the PDF; it must return
  structured data, never trusted directly.
- Pipeline: `PDF → Gemini → structured JSON → Zod validation → application
  validation → draft questions`.
- Gemini calls happen **server-side only**. The API key is `GEMINI_API_KEY`
  (server-only) — never `NEXT_PUBLIC_GEMINI_API_KEY`.

## Teacher review (critical)

After generation the quiz stays a **draft**. Every question is editable:
edit question text, edit answer text, change correct answer, change
True/False answer, delete, add manually, regenerate a question or an
incorrect answer with AI, reorder. The teacher must always be able to see
which answer is currently marked correct. Only the teacher can publish.

## Randomization and correctness

Question order and Multiple Choice option order may be randomized per
student session. Correctness is **never** stored as a letter
(`correct = "B"`) — it is always linked to an answer record/ID
(`correct_answer_id`). The visible A/B/C/D position is generated
dynamically per session; the backend always resolves the real answer ID.
Randomization must never change which answer is correct. True/False
question presentation may stay visually consistent (no need to shuffle
True/False order).

## Student access

Students do not create accounts. Flow: `quiz URL → access validation →
student registration (first + last name) → session creation → start quiz`.
The join URL contains a public access code, e.g. `/join/X7K92P` — the URL
alone is not an account. Each participant gets a unique session with its own
secure identifier/token.

## Quiz availability

Teacher-configured: `starts_at`, `ends_at`, `duration_minutes`. A student
cannot start a new session after `ends_at`. A session already in progress
follows the quiz's duration rules. **Server-side validation is required** —
frontend timers alone are not sufficient and must not be the source of
truth.

## Student quiz experience

Significantly more interactive/game-like than the admin dashboard, but with
its own Vertex Studio identity — Kahoot is UX inspiration only, not a
template to copy. Needs: large question display, clear answer cards,
progress indicator, timer, visual feedback, smooth transitions, a clear
selected state, and a mobile-friendly layout that stays uncluttered.

## Results

After submission, students see score, correct-answer count, and total
questions (e.g. "85% · 17 / 20"). Students do **not** see which answers were
correct/incorrect in the MVP. Teachers can see detailed per-student results.

## Analytics (MVP scope)

- **Quiz:** participants, completed count, average score, highest score,
  lowest score, average completion time.
- **Question:** number of responses, correct responses, incorrect responses,
  percentage correct.
- **Student results table:** first name, last name, score, correct answers,
  total questions, completion time, status.

No advanced AI-driven analytics in the MVP.

## Data models (see [database.md](./database.md) for the full schema)

**Quiz:** id, teacher_id, title, description, status (`draft` | `published` |
`closed`), total_questions, multiple_choice_count, true_false_count,
starts_at, ends_at, duration_minutes, access_code, created_at, updated_at,
published_at.

**Question:** id, quiz_id, type (`multiple_choice` | `true_false`),
question_text, order_index, created_at, updated_at.

**Answer:** id, question_id, answer_text, is_correct, order_index,
created_at. Multiple Choice has exactly 4 answers; True/False has exactly 2.

**Quiz session:** id, quiz_id, participant_id, status (`started` |
`in_progress` | `completed` | `expired`), started_at, completed_at,
expires_at, score, correct_answers, total_questions, created_at.

**Response:** id, session_id, question_id, selected_answer_id, is_correct,
answered_at, time_spent_seconds. The server always determines `is_correct`
— it is never trusted from the client.

## Security posture

Never trust the client for: score, correct answer, quiz availability,
session expiration, teacher ownership, or question correctness — all
validated server-side. Row Level Security enforced in Supabase. Service-role
and Gemini credentials are server-only secrets and never committed to git.

## Explicitly out of scope for the MVP

Quiz templates, AI result analysis, leaderboards, teams, real-time
multiplayer, DOCX/PPTX/OCR, open-ended questions, subscriptions/billing,
organization management, advanced roles, a mobile app, a question bank,
advanced reporting. Do not implement these unless explicitly requested
later.

## Decision priority

When a technical trade-off comes up, in order: **correctness → security →
simplicity → maintainability → UX → performance.**
