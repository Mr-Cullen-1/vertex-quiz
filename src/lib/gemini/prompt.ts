import type { QuizDifficulty, QuizFormat } from "@/lib/quizzes/format";

/**
 * Language/cognitive-difficulty guidance for Comprehension, keyed by CEFR
 * level. Deliberately says nothing about content/facts — that boundary is
 * set once, in `buildSourceInstructions`, and applies regardless of level.
 */
const COMPREHENSION_CEFR_GUIDANCE: Record<"B1" | "B2", string> = {
  B1: `Target CEFR level B1 (intermediate): use accessible, mostly everyday vocabulary; keep sentence structures clear and mostly simple or compound; comprehension should mostly be direct, with only occasional basic inference; distractors should be plausible but clearly distinguishable once the passage is understood.`,
  B2: `Target CEFR level B2 (upper-intermediate): use more sophisticated, upper-intermediate vocabulary; sentence structures may be more complex, with subordinate clauses and varied grammar; require stronger inference rather than only direct lookup; distractors should be more nuanced and closer to the correct answer, testing real understanding rather than surface skimming.`,
};

/** Vocabulary-difficulty guidance for the Vocabulary Quiz format, keyed by CEFR level. */
const VOCABULARY_CEFR_GUIDANCE: Record<QuizDifficulty, string> = {
  B1: `Target CEFR level B1: choose common, everyday or academic words and phrases that actually appear in the document; keep the tested meaning distinctions clear and avoid unnecessarily obscure vocabulary.`,
  B2: `Target CEFR level B2: choose more sophisticated vocabulary from the document, with more nuanced meanings; distractors should be closer synonyms or related-but-wrong meanings, not obviously unrelated words.`,
  C1: `Target CEFR level C1: choose the most advanced, nuanced vocabulary genuinely present in the document — including idiomatic or abstract expressions where the document actually contains them; distractors should require real precision to rule out. If the document does not contain enough sufficiently advanced vocabulary to sustain C1 throughout, use the strongest vocabulary the document actually supports rather than inventing or importing words that are not grounded in it.`,
};

function buildSourceInstructions(): string {
  return `You are generating a quiz from the attached educational PDF for the Vertex Quiz platform.

The attached PDF is the only source of truth. Analyze only its content — never use outside knowledge, and never invent facts, words, or meanings that are not supported by the document.`;
}

function buildFormatInstructions(format: QuizFormat, difficulty: QuizDifficulty): string {
  if (format === "vocabulary") {
    return `Quiz format: VOCABULARY QUIZ — test knowledge of vocabulary drawn from the document, not general reading comprehension.
First identify meaningful, pedagogically useful words or phrases that actually appear in the document and are relevant to its context. Then write questions in patterns such as: choosing the meaning of a word as used in context, choosing the closest synonym or meaning in context, choosing the correct word to complete a sentence drawn from or consistent with the document, identifying the meaning of a phrase or expression, or distinguishing between similar words when the document supports the distinction.
Avoid vocabulary unrelated to the document, obscure words not justified by the source, questions that depend on outside knowledge, arbitrary dictionary definitions disconnected from context, and questions where more than one option could reasonably be correct.
${VOCABULARY_CEFR_GUIDANCE[difficulty]}`;
  }

  const level = difficulty === "B2" ? "B2" : "B1";
  return `Quiz format: COMPREHENSION — test understanding of the document's content and meaning.
${COMPREHENSION_CEFR_GUIDANCE[level]}
The requested CEFR level describes the language and cognitive difficulty of the questions only — it is never permission to introduce information the document does not contain.`;
}

function buildQuestionTypeInstructions({
  format,
  multipleChoiceCount,
  trueFalseCount,
  total,
}: {
  format: QuizFormat;
  multipleChoiceCount: number;
  trueFalseCount: number;
  total: number;
}): string {
  if (format === "vocabulary") {
    return `Produce exactly ${total} question${total === 1 ? "" : "s"} in total, ALL of type "multiple_choice". Never return a "true_false" question for a Vocabulary Quiz, and never return more or fewer than ${total} questions.
For every question, return exactly 4 entries in "answers", with exactly one having "is_correct": true and the other three "is_correct": false — plausible but incorrect options grounded in the same document.`;
  }

  return `Produce exactly ${total} questions in total: exactly ${multipleChoiceCount} of type "multiple_choice" and exactly ${trueFalseCount} of type "true_false". Never return more or fewer questions than requested, and never return any other question type.
For every "multiple_choice" question, return exactly 4 entries in "answers", with exactly one having "is_correct": true and the other three "is_correct": false.
   - If the PDF already presents multiple-choice options for a question, preserve the question and its options, and identify the correct one from the source material.
   - If the PDF only presents a question or fact without options, write 3 plausible but incorrect distractors using only facts, terms, or concepts that actually appear in the PDF.
For every "true_false" question, return exactly 2 entries in "answers": one with text exactly "True" and one with text exactly "False", with exactly one marked "is_correct": true based on the source material.`;
}

function buildOutputInstructions(): string {
  return `Question text must be understandable on its own and grounded in the PDF's actual content. Do not include explanations, headers, markdown formatting, or any commentary — return only the structured JSON matching the provided response schema.`;
}

export function buildExtractionPrompt({
  format,
  difficulty,
  multipleChoiceCount,
  trueFalseCount,
}: {
  format: QuizFormat;
  difficulty: QuizDifficulty;
  multipleChoiceCount: number;
  trueFalseCount: number;
}): string {
  const total = multipleChoiceCount + trueFalseCount;

  return [
    buildSourceInstructions(),
    buildFormatInstructions(format, difficulty),
    buildQuestionTypeInstructions({ format, multipleChoiceCount, trueFalseCount, total }),
    buildOutputInstructions(),
  ].join("\n\n");
}
