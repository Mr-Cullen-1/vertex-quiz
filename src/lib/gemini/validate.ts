import type { GeminiExtraction } from "./schema";
import { validateQuestionShape, type QuestionShapeInput } from "@/lib/quizzes/question-rules";

export type ValidatedAnswer = QuestionShapeInput["answers"][number];
export type ValidatedQuestion = QuestionShapeInput;

export type ValidationResult =
  | { success: true; questions: ValidatedQuestion[] }
  | { success: false; error: string };

/**
 * The authoritative correctness check on Gemini's output. `schema.ts` only
 * confirms the JSON has the right *shape* (zod parses it); this enforces
 * the actual business rules the product spec requires — exact totals
 * across the whole batch, then (via `validateQuestionShape`, shared with
 * the manual question actions) exact per-question answer counts, exact
 * correct-answer counts, and the fixed True/False vocabulary. Never trust
 * the AI response past this point: any failure here rejects the entire
 * batch, nothing partial is ever passed on to be saved.
 */
export function validateExtraction(
  extraction: GeminiExtraction,
  expected: { multipleChoiceCount: number; trueFalseCount: number }
): ValidationResult {
  const { questions } = extraction;
  const expectedTotal = expected.multipleChoiceCount + expected.trueFalseCount;

  if (questions.length !== expectedTotal) {
    return {
      success: false,
      error: `The AI returned ${questions.length} question${questions.length === 1 ? "" : "s"}, but ${expectedTotal} were requested.`,
    };
  }

  const mcCount = questions.filter((q) => q.type === "multiple_choice").length;
  const tfCount = questions.filter((q) => q.type === "true_false").length;

  if (mcCount !== expected.multipleChoiceCount) {
    return {
      success: false,
      error: `The AI returned ${mcCount} Multiple Choice question${mcCount === 1 ? "" : "s"}, but ${expected.multipleChoiceCount} were requested.`,
    };
  }
  if (tfCount !== expected.trueFalseCount) {
    return {
      success: false,
      error: `The AI returned ${tfCount} True/False question${tfCount === 1 ? "" : "s"}, but ${expected.trueFalseCount} were requested.`,
    };
  }

  const validated: ValidatedQuestion[] = [];

  for (const [index, q] of questions.entries()) {
    const result = validateQuestionShape(
      { type: q.type, question_text: q.question, answers: q.answers },
      `Question ${index + 1}`
    );
    if (!result.success) {
      return result;
    }
    validated.push(result.question);
  }

  return { success: true, questions: validated };
}
