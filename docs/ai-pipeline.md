# AI pipeline

**Status:** designed here, implemented in Phase 4. Documents how Gemini fits
into Vertex Quiz and why each guardrail exists.

## Goal

Turn a teacher-uploaded, structurally predictable PDF into a set of
**draft** quiz questions matching the teacher's requested composition —
without ever letting unvalidated AI output reach a student.

## Pipeline

```
1. Teacher uploads PDF            → Supabase Storage
2. Teacher configures composition → total / multiple_choice_count / true_false_count
3. Server Action / Route Handler  → reads PDF, calls Gemini (server-side only)
4. Gemini responds                → structured JSON (schema-constrained)
5. Zod validation                 → shape, types, required fields
6. Application validation         → domain invariants (see below)
7. Persist as draft questions     → quizzes.status stays "draft"
8. Teacher review                 → edit/add/delete/reorder/regenerate
9. Teacher publishes              → only human action that flips status
```

Steps 5 and 6 are separate on purpose: Zod guarantees *shape*
(the JSON parses into the expected TypeScript type), application validation
guarantees *domain correctness* (the invariants below), and only output that
survives both becomes a draft question.

## Request shape

- Input: the PDF content plus the requested `multiple_choice_count` and
  `true_false_count`.
- Output: requested via Gemini's structured-output mode so the model is
  constrained to a JSON schema matching the Zod schema below, rather than
  free text that has to be parsed.

## Zod schema (shape)

```ts
const AnswerDraft = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
});

const QuestionDraft = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    questionText: z.string().min(1),
    answers: z.array(AnswerDraft).length(4),
  }),
  z.object({
    type: z.literal("true_false"),
    questionText: z.string().min(1),
    answers: z.array(AnswerDraft).length(2),
  }),
]);

const ExtractionResult = z.object({
  questions: z.array(QuestionDraft),
});
```

## Application-level validation (domain invariants)

Run after Zod parsing succeeds, per question:

- Multiple Choice: exactly 4 answers, exactly 1 `isCorrect === true`, no
  duplicate `text` values (case-insensitive/trim-normalized), no empty/
  whitespace-only text.
- True/False: exactly 2 answers, exactly 1 `isCorrect === true`, answer
  texts are the two boolean labels.
- Question text is non-empty and not a near-duplicate of another question in
  the same batch (basic normalized-string check — not a semantic dedupe).
- Aggregate: generated counts should match the requested
  `multiple_choice_count` / `true_false_count`. If Gemini under- or
  over-produces a type, the extra is dropped and the shortfall surfaces to
  the teacher as an explicit "N of M questions generated" state rather than
  silently padding with invalid data (see error states below).

Any question failing validation is **dropped**, not repaired by guessing —
silently "fixing" AI output would reintroduce exactly the trust problem
validation exists to prevent.

## Error states surfaced to the teacher

- AI generation failure (Gemini request error/timeout) → retry affordance,
  plain-language message, no raw stack trace.
- Invalid AI response (fails Zod) → treated the same as a generation
  failure from the teacher's point of view.
- No questions generated → explicit empty state, not a blank screen.
- Insufficient questions (fewer valid questions than requested) → explicit
  "18 of 20 questions generated" style state; teacher can add the rest
  manually or regenerate.

## Regeneration

"Regenerate this question" and "regenerate this answer" (Phase 5) call the
same server-side Gemini service with a narrower prompt scoped to one
question/answer, run through the same Zod + domain validation before
replacing the existing draft row. A regenerate never touches
`quizzes.status` — the quiz stays in draft/review regardless.

## Security

- `GEMINI_API_KEY` is read only in server-only modules (`src/lib/ai/`,
  Server Actions, Route Handlers) — never imported by client components,
  never sent to the browser.
- The PDF is read server-side from Supabase Storage using a server client;
  it is not proxied through client code.
