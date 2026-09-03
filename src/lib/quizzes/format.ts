export type QuestionTypeValue = "multiple_choice" | "true_false";

export const QUIZ_FORMATS = ["comprehension", "vocabulary"] as const;
export type QuizFormat = (typeof QUIZ_FORMATS)[number];

export const QUIZ_DIFFICULTIES = ["B1", "B2", "C1"] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const QUIZ_FORMAT_LABEL: Record<QuizFormat, string> = {
  comprehension: "Comprehension",
  vocabulary: "Vocabulary Quiz",
};

/**
 * The CEFR levels a teacher may pick per quiz format. Comprehension is
 * capped at B2; Vocabulary Quiz additionally allows C1 for advanced,
 * document-grounded vocabulary. Shared by the create/edit quiz form, its
 * Zod schema, the Gemini prompt, and every question-shape validator so the
 * allowed set can never drift out of sync between them.
 */
export const ALLOWED_DIFFICULTIES: Record<QuizFormat, readonly QuizDifficulty[]> = {
  comprehension: ["B1", "B2"],
  vocabulary: ["B1", "B2", "C1"],
};

/** Question types each format may generate or accept — Vocabulary Quiz is Multiple Choice only. */
export const ALLOWED_QUESTION_TYPES: Record<QuizFormat, readonly QuestionTypeValue[]> = {
  comprehension: ["multiple_choice", "true_false"],
  vocabulary: ["multiple_choice"],
};

export function isDifficultyAllowed(
  format: QuizFormat,
  difficulty: string
): difficulty is QuizDifficulty {
  return (ALLOWED_DIFFICULTIES[format] as readonly string[]).includes(difficulty);
}

export function isQuestionTypeAllowed(
  format: QuizFormat,
  type: string
): type is QuestionTypeValue {
  return (ALLOWED_QUESTION_TYPES[format] as readonly string[]).includes(type);
}
