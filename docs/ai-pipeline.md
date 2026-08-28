# AI pipeline

**Status:** implemented in Phase 4, verified end-to-end with a real PDF and
a real Gemini call (see docs/development-progress.md Phase 4). This
documents how Gemini fits into Vertex Quiz and why each guardrail exists.

## Goal

Turn a teacher-uploaded, structurally predictable PDF into a set of
**draft** quiz questions matching the teacher's requested composition —
without ever letting unvalidated AI output reach a student.

## Pipeline

```
1. Teacher uploads PDF            → Supabase Storage, private "quiz-pdfs" bucket
2. Teacher configures composition → multiple_choice_count / true_false_count (set at quiz creation, Phase 3)
3. Server Action                  → downloads the PDF, calls Gemini (server-side only)
4. Gemini responds                → structured JSON (responseJsonSchema-constrained)
5. Zod validation                 → shape, types, required fields (src/lib/gemini/schema.ts)
6. Application validation         → domain invariants (src/lib/gemini/validate.ts)
7. Persist as draft questions     → one atomic batch (create_quiz_questions RPC); quizzes.status stays "draft"
8. Teacher review                 → edit/add/delete/reorder/regenerate (Phase 5, not built yet)
9. Teacher publishes              → only human action that flips status (Phase 6, not built yet)
```

Steps 5 and 6 are separate on purpose: Zod guarantees *shape* (the JSON
parses into the expected TypeScript type), application validation
guarantees *domain correctness* (the invariants below), and only output
that survives both is written to Postgres — as one all-or-nothing batch,
not row by row.

## Request shape

- Model: `gemini-flash-latest` (`@google/genai`) — see
  [architecture.md](./architecture.md) for the SDK choice.
- Input: the PDF as inline base64 data (`createPartFromBase64`) plus a text
  prompt (`src/lib/gemini/prompt.ts`) stating the exact requested
  `multiple_choice_count`/`true_false_count` and the per-type answer rules.
- Output: requested via `responseMimeType: "application/json"` and
  `responseJsonSchema` (a JSON Schema generated from the Zod schema below
  via `z.toJSONSchema()`), so the model is constrained rather than
  returning free text that has to be parsed out of prose.

## Zod schema (shape) — `src/lib/gemini/schema.ts`

```ts
const geminiAnswerSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
});

const geminiQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "true_false"]),
  question: z.string().min(1),
  answers: z.array(geminiAnswerSchema).min(2).max(4),
});

const geminiExtractionSchema = z.object({
  questions: z.array(geminiQuestionSchema),
});
```

This is deliberately looser than the actual business rules (2–4 answers,
no discriminated union tying the type to an exact answer count) — it only
confirms the response *parses into the right shape*. Two reasons: Gemini's
structured-output support is a constrained JSON Schema subset, so a
simpler shape is more reliably honored; and this schema was never meant to
be the real authority — `validate.ts` is.

## Application-level validation (domain invariants) — `src/lib/gemini/validate.ts`

Checked in order, on the whole batch:

- Total question count matches `multiple_choice_count + true_false_count`
  exactly; MC count and TF count each match exactly.
- Every `multiple_choice` question has exactly 4 answers with exactly 1
  `is_correct`, and no duplicate answer text (case-insensitive).
- Every `true_false` question has exactly 2 answers with exactly 1
  `is_correct`, and the two answer texts are literally "True" and "False"
  (case-insensitive) — not paraphrased alternatives.
- Question text and every answer text are non-empty after trimming.

**Any single failure rejects the entire batch** — nothing partial is ever
written. This is stricter than an earlier sketch of this document, which
allowed dropping individual bad questions and surfacing an "18 of 20
generated" partial state; the actual Phase 4 requirements were explicit
that partial results must never be saved, so that's what's implemented.
Silently dropping or "fixing" a malformed question would reintroduce
exactly the trust problem validation exists to prevent — the teacher sees
one clear, specific error (e.g. "The AI returned 9 questions, but 10 were
requested.") and can retry generation from the same PDF.

## Error states surfaced to the teacher

- Gemini request failure/timeout → "The AI service failed to process this
  PDF. Please try again." (raw error logged server-side, never shown).
- Empty or non-JSON Gemini response → treated as a generation failure with
  its own message, same retry affordance.
- Response fails Zod shape validation → "unexpected response format"
  message, same retry affordance.
- Response fails domain validation → the specific mismatch is shown
  verbatim (it's already teacher-appropriate wording, not a technical
  error) — e.g. wrong total, wrong per-type count, wrong answer count,
  wrong correct-answer count, duplicate options, non-"True"/"False" labels.
- Quiz already has generated questions → generation is refused before
  Gemini is ever called: "Questions already generated. Clear existing
  draft questions before generating again." (also enforced a second time,
  independently, inside `create_quiz_questions` itself).

## Regeneration

Per-question/per-answer "regenerate" (Phase 5, not built yet) would call
the same server-side Gemini service with a narrower prompt scoped to one
question/answer, run through the same Zod + domain validation before
replacing the existing draft row. A regenerate should never touch
`quizzes.status` — the quiz stays in draft/review regardless. What Phase 4
*does* implement today is whole-quiz regeneration: clear all generated
questions (`clearGeneratedQuestions`), then generate again from the same
(or a newly-uploaded) PDF.

## Security

- `GEMINI_API_KEY` is read only in `src/lib/gemini/client.ts`, guarded by
  the `server-only` package and validated by `src/lib/env.ts` — never
  imported by a client component, never sent to the browser. Verified
  directly: grepped a production build's `.next/static` for the literal
  key value — zero matches.
- The PDF is read server-side from the private `quiz-pdfs` Storage bucket
  using the authenticated (RLS-respecting) server client — never proxied
  through client code, and never through the service-role client (this is
  a normal teacher operation with a real owner RLS can check against).
