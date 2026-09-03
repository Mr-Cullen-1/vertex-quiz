import { isQuestionTypeAllowed, type QuestionTypeValue, type QuizFormat } from "./format.ts";

export type { QuestionTypeValue };

export type QuestionAnswerInput = {
  text: string;
  is_correct: boolean;
};

export type QuestionShapeInput = {
  type: QuestionTypeValue;
  question_text: string;
  answers: QuestionAnswerInput[];
};

export type QuestionShapeResult =
  | { success: true; question: QuestionShapeInput }
  | { success: false; error: string };

/**
 * The single per-question authority for Multiple Choice/True-False shape
 * rules — exact answer counts, exact correct-answer counts, non-empty
 * text, no duplicate MC options, and the fixed True/False vocabulary.
 * Shared by the Gemini batch validator (src/lib/gemini/validate.ts, which
 * additionally checks the requested totals across the whole batch) and the
 * manual add/edit question actions (src/lib/quizzes/question-actions.ts),
 * so a teacher-authored question is held to exactly the same rules as an
 * AI-generated one — never a looser bar for a human just because a human
 * typed it.
 */
export function validateQuestionShape(
  question: QuestionShapeInput,
  label: string
): QuestionShapeResult {
  const questionText = question.question_text.trim();
  if (!questionText) {
    return { success: false, error: `${label} has empty text.` };
  }

  const answers = question.answers.map((a) => ({
    text: a.text.trim(),
    is_correct: a.is_correct,
  }));

  if (answers.some((a) => !a.text)) {
    return { success: false, error: `${label} has an empty answer option.` };
  }

  const correctCount = answers.filter((a) => a.is_correct).length;

  if (question.type === "multiple_choice") {
    if (answers.length !== 4) {
      return {
        success: false,
        error: `${label} (Multiple Choice) has ${answers.length} answers instead of exactly 4.`,
      };
    }
    if (correctCount !== 1) {
      return {
        success: false,
        error: `${label} (Multiple Choice) has ${correctCount} correct answers instead of exactly 1.`,
      };
    }
    const normalized = answers.map((a) => a.text.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return {
        success: false,
        error: `${label} (Multiple Choice) has duplicate answer options.`,
      };
    }
  } else {
    if (answers.length !== 2) {
      return {
        success: false,
        error: `${label} (True/False) has ${answers.length} answers instead of exactly 2.`,
      };
    }
    if (correctCount !== 1) {
      return {
        success: false,
        error: `${label} (True/False) has ${correctCount} correct answers instead of exactly 1.`,
      };
    }
    const labels = new Set(answers.map((a) => a.text.toLowerCase()));
    if (!(labels.size === 2 && labels.has("true") && labels.has("false"))) {
      return {
        success: false,
        error: `${label} (True/False) must have exactly "True" and "False" as its two answers.`,
      };
    }
  }

  return {
    success: true,
    question: { type: question.type, question_text: questionText, answers },
  };
}

/**
 * Same authority as `validateQuestionShape`, plus the one rule that
 * depends on the quiz's format rather than the question alone: a
 * Vocabulary Quiz question must be Multiple Choice — True/False is a
 * Comprehension-only question type. Called everywhere a question (AI
 * -generated or teacher-authored) is about to be validated against a quiz
 * whose format is known: `src/lib/gemini/validate.ts`,
 * `src/lib/quizzes/question-actions.ts`, and `src/lib/quizzes/publish-actions.ts`.
 */
export function validateQuestionForFormat(
  question: QuestionShapeInput,
  format: QuizFormat,
  label: string
): QuestionShapeResult {
  if (!isQuestionTypeAllowed(format, question.type)) {
    return {
      success: false,
      error: `${label} is True/False, but Vocabulary Quiz questions must be Multiple Choice.`,
    };
  }
  return validateQuestionShape(question, label);
}
