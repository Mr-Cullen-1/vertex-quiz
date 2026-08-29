import { z } from "zod";

/**
 * Shape-only check on a teacher-submitted question from the review UI.
 * Deliberately loose on `options` length (2–4, matching the Gemini shape
 * schema) — the exact-count/exact-correctness business rules are enforced
 * separately by `validateQuestionShape` (src/lib/quizzes/question-rules.ts),
 * not baked into this schema. Options are always full option text: for
 * True/False the client sends the fixed ["True", "False"] pair rather than
 * letting the teacher type free text, since the product spec fixes that
 * vocabulary.
 */
export const questionInputSchema = z.object({
  type: z.enum(["multiple_choice", "true_false"]),
  questionText: z.string().trim().min(1, "Question text is required"),
  options: z.array(z.string()).min(2).max(4),
  correctIndex: z.number().int().min(0),
});

export type QuestionInputValues = z.infer<typeof questionInputSchema>;
