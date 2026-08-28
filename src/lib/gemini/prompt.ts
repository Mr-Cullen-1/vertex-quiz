export function buildExtractionPrompt({
  multipleChoiceCount,
  trueFalseCount,
}: {
  multipleChoiceCount: number;
  trueFalseCount: number;
}): string {
  const total = multipleChoiceCount + trueFalseCount;

  return `You are generating a quiz from the attached educational PDF for the Vertex Quiz platform.

Follow these rules exactly:

1. Analyze only the attached PDF. Do not use any outside knowledge and do not invent facts that are not supported by the document.
2. Produce exactly ${total} questions in total: exactly ${multipleChoiceCount} of type "multiple_choice" and exactly ${trueFalseCount} of type "true_false". Never return more or fewer questions than requested, and never return any other question type.
3. For every "multiple_choice" question, return exactly 4 entries in "answers", with exactly one having "is_correct": true and the other three "is_correct": false.
   - If the PDF already presents multiple-choice options for a question, preserve the question and its options, and identify the correct one from the source material.
   - If the PDF only presents a question or fact without options, write 3 plausible but incorrect distractors using only facts, terms, or concepts that actually appear in the PDF.
4. For every "true_false" question, return exactly 2 entries in "answers": one with text exactly "True" and one with text exactly "False", with exactly one marked "is_correct": true based on the source material.
5. Question text must be understandable on its own and grounded in the PDF's actual content.
6. Do not include explanations, headers, markdown formatting, or any commentary — return only the structured JSON matching the provided response schema.`;
}
