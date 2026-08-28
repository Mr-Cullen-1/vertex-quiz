import type { GeminiExtraction } from "./schema";

export type ValidatedAnswer = {
  text: string;
  is_correct: boolean;
};

export type ValidatedQuestion = {
  type: "multiple_choice" | "true_false";
  question_text: string;
  answers: ValidatedAnswer[];
};

export type ValidationResult =
  | { success: true; questions: ValidatedQuestion[] }
  | { success: false; error: string };

/**
 * The authoritative correctness check on Gemini's output. `schema.ts`
 * only confirms the JSON has the right *shape* (zod parses it); this
 * enforces the actual business rules the product spec requires — exact
 * counts, exact answer counts, exact correct-answer counts, and the fixed
 * True/False vocabulary. Never trust the AI response past this point:
 * any failure here rejects the entire batch, nothing partial is ever
 * passed on to be saved.
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
    const position = index + 1;
    const questionText = q.question.trim();
    if (!questionText) {
      return { success: false, error: `Question ${position} has empty text.` };
    }

    const answers = q.answers.map((a) => ({
      text: a.text.trim(),
      is_correct: a.is_correct,
    }));

    if (answers.some((a) => !a.text)) {
      return { success: false, error: `Question ${position} has an empty answer option.` };
    }

    const correctCount = answers.filter((a) => a.is_correct).length;

    if (q.type === "multiple_choice") {
      if (answers.length !== 4) {
        return {
          success: false,
          error: `Question ${position} (Multiple Choice) has ${answers.length} answers instead of exactly 4.`,
        };
      }
      if (correctCount !== 1) {
        return {
          success: false,
          error: `Question ${position} (Multiple Choice) has ${correctCount} correct answers instead of exactly 1.`,
        };
      }
      const normalized = answers.map((a) => a.text.toLowerCase());
      if (new Set(normalized).size !== normalized.length) {
        return {
          success: false,
          error: `Question ${position} (Multiple Choice) has duplicate answer options.`,
        };
      }
    } else {
      if (answers.length !== 2) {
        return {
          success: false,
          error: `Question ${position} (True/False) has ${answers.length} answers instead of exactly 2.`,
        };
      }
      if (correctCount !== 1) {
        return {
          success: false,
          error: `Question ${position} (True/False) has ${correctCount} correct answers instead of exactly 1.`,
        };
      }
      const labels = new Set(answers.map((a) => a.text.toLowerCase()));
      if (!(labels.size === 2 && labels.has("true") && labels.has("false"))) {
        return {
          success: false,
          error: `Question ${position} (True/False) must have exactly "True" and "False" as its two answers.`,
        };
      }
    }

    validated.push({ type: q.type, question_text: questionText, answers });
  }

  return { success: true, questions: validated };
}
