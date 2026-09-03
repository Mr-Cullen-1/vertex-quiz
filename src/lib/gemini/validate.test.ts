import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExtraction } from "./validate.ts";

function mcQuestion(correctIndex = 0) {
  return {
    type: "multiple_choice" as const,
    question: "What is the capital of France?",
    answers: ["Paris", "Berlin", "Madrid", "Rome"].map((text, i) => ({
      text,
      is_correct: i === correctIndex,
    })),
  };
}

function tfQuestion(correctIsTrue = true) {
  return {
    type: "true_false" as const,
    question: "The sky is blue.",
    answers: [
      { text: "True", is_correct: correctIsTrue },
      { text: "False", is_correct: !correctIsTrue },
    ],
  };
}

// --- GENERATION VALIDATION: Comprehension ---

test("comprehension: exact MC/TF counts with valid shapes succeed", () => {
  const result = validateExtraction(
    { questions: [mcQuestion(), mcQuestion(1), tfQuestion()] },
    { multipleChoiceCount: 2, trueFalseCount: 1, format: "comprehension" }
  );
  assert.equal(result.success, true);
});

test("comprehension: fewer questions than requested is rejected (backward-compatible strictness)", () => {
  const result = validateExtraction(
    { questions: [mcQuestion()] },
    { multipleChoiceCount: 2, trueFalseCount: 1, format: "comprehension" }
  );
  assert.equal(result.success, false);
});

test("comprehension: wrong MC/TF split (right total) is rejected", () => {
  const result = validateExtraction(
    { questions: [mcQuestion(), tfQuestion(), tfQuestion()] },
    { multipleChoiceCount: 2, trueFalseCount: 1, format: "comprehension" }
  );
  assert.equal(result.success, false);
});

test("comprehension: a Multiple Choice question without exactly 4 answers is rejected", () => {
  const malformed = { ...mcQuestion(), answers: mcQuestion().answers.slice(0, 3) };
  const result = validateExtraction(
    { questions: [malformed] },
    { multipleChoiceCount: 1, trueFalseCount: 0, format: "comprehension" }
  );
  assert.equal(result.success, false);
});

test("comprehension: a True/False question without exactly 2 answers is rejected", () => {
  const malformed = { ...tfQuestion(), answers: [...tfQuestion().answers, { text: "Maybe", is_correct: false }] };
  const result = validateExtraction(
    { questions: [malformed] },
    { multipleChoiceCount: 0, trueFalseCount: 1, format: "comprehension" }
  );
  assert.equal(result.success, false);
});

test("comprehension: a question with zero or multiple correct answers is rejected", () => {
  const noneCorrect = { ...mcQuestion(), answers: mcQuestion().answers.map((a) => ({ ...a, is_correct: false })) };
  const result = validateExtraction(
    { questions: [noneCorrect] },
    { multipleChoiceCount: 1, trueFalseCount: 0, format: "comprehension" }
  );
  assert.equal(result.success, false);
});

// --- GENERATION VALIDATION: Vocabulary ---

test("vocabulary: exact question count, all Multiple Choice, succeeds", () => {
  const result = validateExtraction(
    { questions: [mcQuestion(), mcQuestion(1), mcQuestion(2)] },
    { multipleChoiceCount: 3, trueFalseCount: 0, format: "vocabulary" }
  );
  assert.equal(result.success, true);
});

test("vocabulary: a True/False question anywhere in the batch is rejected", () => {
  const result = validateExtraction(
    { questions: [mcQuestion(), mcQuestion(1), tfQuestion()] },
    { multipleChoiceCount: 2, trueFalseCount: 1, format: "vocabulary" }
  );
  assert.equal(result.success, false);
});

test("vocabulary: fewer or more questions than requested is rejected", () => {
  const tooFew = validateExtraction(
    { questions: [mcQuestion()] },
    { multipleChoiceCount: 3, trueFalseCount: 0, format: "vocabulary" }
  );
  assert.equal(tooFew.success, false);

  const tooMany = validateExtraction(
    { questions: [mcQuestion(), mcQuestion(1), mcQuestion(2), mcQuestion(3)] },
    { multipleChoiceCount: 3, trueFalseCount: 0, format: "vocabulary" }
  );
  assert.equal(tooMany.success, false);
});

test("vocabulary: a Multiple Choice question without exactly 4 answers is rejected", () => {
  const malformed = { ...mcQuestion(), answers: mcQuestion().answers.slice(0, 3) };
  const result = validateExtraction(
    { questions: [malformed] },
    { multipleChoiceCount: 1, trueFalseCount: 0, format: "vocabulary" }
  );
  assert.equal(result.success, false);
});

// --- BACKWARD COMPATIBILITY ---

test("backward compatibility: a pre-existing comprehension-style extraction (MC + TF) still validates exactly as before", () => {
  const result = validateExtraction(
    { questions: [mcQuestion(), mcQuestion(1), mcQuestion(2), tfQuestion(), tfQuestion(false)] },
    { multipleChoiceCount: 3, trueFalseCount: 2, format: "comprehension" }
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.questions.length, 5);
  }
});
