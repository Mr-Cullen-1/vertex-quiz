import { z } from "zod";

/**
 * Shape Gemini is asked to return (see prompt.ts). Deliberately loose on
 * array lengths here (2–4 answers) — the exact-count/exact-correctness
 * business rules are enforced separately in validate.ts, not baked into
 * this schema. Gemini's structured-output support is a constrained subset
 * of JSON Schema; keeping this shape simple (no unions, no cross-field
 * conditionals) maximizes the chance the model actually honors it, and
 * this schema is never the sole guard anyway — validate.ts is.
 */
export const geminiAnswerSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
});

export const geminiQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "true_false"]),
  question: z.string().min(1),
  answers: z.array(geminiAnswerSchema).min(2).max(4),
});

export const geminiExtractionSchema = z.object({
  questions: z.array(geminiQuestionSchema),
});

export type GeminiExtraction = z.infer<typeof geminiExtractionSchema>;

/** JSON Schema derived from the Zod schema above, passed to Gemini as `responseJsonSchema`. */
export const geminiResponseJsonSchema = z.toJSONSchema(geminiExtractionSchema);
