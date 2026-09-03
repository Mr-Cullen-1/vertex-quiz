import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuestionForFormat, validateQuestionShape } from "./question-rules.ts";

const mc4 = (correctIndex: number) => ({
  type: "multiple_choice" as const,
  question_text: "What is the capital of France?",
  answers: ["Paris", "Berlin", "Madrid", "Rome"].map((text, i) => ({
    text,
    is_correct: i === correctIndex,
  })),
});

const tf = (correctIsTrue: boolean) => ({
  type: "true_false" as const,
  question_text: "The sky is blue.",
  answers: [
    { text: "True", is_correct: correctIsTrue },
    { text: "False", is_correct: !correctIsTrue },
  ],
});

// --- validateQuestionShape: pre-existing behavior, unchanged by this feature ---

test("backward compatibility: a well-formed Multiple Choice question still validates", () => {
  const result = validateQuestionShape(mc4(0), "Q1");
  assert.equal(result.success, true);
});

test("backward compatibility: a well-formed True/False question still validates", () => {
  const result = validateQuestionShape(tf(true), "Q1");
  assert.equal(result.success, true);
});

test("backward compatibility: Multiple Choice with fewer than 4 answers is rejected", () => {
  const bad = { ...mc4(0), answers: mc4(0).answers.slice(0, 3) };
  const result = validateQuestionShape(bad, "Q1");
  assert.equal(result.success, false);
});

test("backward compatibility: Multiple Choice with 2 correct answers is rejected", () => {
  const bad = mc4(0);
  bad.answers[1].is_correct = true;
  const result = validateQuestionShape(bad, "Q1");
  assert.equal(result.success, false);
});

test("backward compatibility: True/False with anything other than exactly 2 answers is rejected", () => {
  const bad = { ...tf(true), answers: [...tf(true).answers, { text: "Maybe", is_correct: false }] };
  const result = validateQuestionShape(bad, "Q1");
  assert.equal(result.success, false);
});

// --- validateQuestionForFormat: the new format-aware gate ---

test("comprehension quiz: a Multiple Choice question is accepted", () => {
  const result = validateQuestionForFormat(mc4(0), "comprehension", "Q1");
  assert.equal(result.success, true);
});

test("comprehension quiz: a True/False question is accepted", () => {
  const result = validateQuestionForFormat(tf(true), "comprehension", "Q1");
  assert.equal(result.success, true);
});

test("vocabulary quiz: a Multiple Choice question is accepted", () => {
  const result = validateQuestionForFormat(mc4(0), "vocabulary", "Q1");
  assert.equal(result.success, true);
});

test("vocabulary quiz: a True/False question is rejected — never reaches the shape check", () => {
  const result = validateQuestionForFormat(tf(true), "vocabulary", "Q1");
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /Multiple Choice/);
  }
});
