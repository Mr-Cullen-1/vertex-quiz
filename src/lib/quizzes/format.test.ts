import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_DIFFICULTIES, ALLOWED_QUESTION_TYPES, isDifficultyAllowed, isQuestionTypeAllowed } from "./format.ts";

test("comprehension allows exactly B1 and B2, never C1", () => {
  assert.deepEqual(ALLOWED_DIFFICULTIES.comprehension, ["B1", "B2"]);
  assert.equal(isDifficultyAllowed("comprehension", "B1"), true);
  assert.equal(isDifficultyAllowed("comprehension", "B2"), true);
  assert.equal(isDifficultyAllowed("comprehension", "C1"), false);
});

test("vocabulary allows B1, B2, and C1", () => {
  assert.deepEqual(ALLOWED_DIFFICULTIES.vocabulary, ["B1", "B2", "C1"]);
  assert.equal(isDifficultyAllowed("vocabulary", "B1"), true);
  assert.equal(isDifficultyAllowed("vocabulary", "B2"), true);
  assert.equal(isDifficultyAllowed("vocabulary", "C1"), true);
});

test("an unrecognized difficulty string is never allowed for either format", () => {
  assert.equal(isDifficultyAllowed("comprehension", "A2"), false);
  assert.equal(isDifficultyAllowed("vocabulary", "A2"), false);
});

test("comprehension allows both Multiple Choice and True/False", () => {
  assert.deepEqual(ALLOWED_QUESTION_TYPES.comprehension, ["multiple_choice", "true_false"]);
  assert.equal(isQuestionTypeAllowed("comprehension", "multiple_choice"), true);
  assert.equal(isQuestionTypeAllowed("comprehension", "true_false"), true);
});

test("vocabulary allows only Multiple Choice — True/False is rejected", () => {
  assert.deepEqual(ALLOWED_QUESTION_TYPES.vocabulary, ["multiple_choice"]);
  assert.equal(isQuestionTypeAllowed("vocabulary", "multiple_choice"), true);
  assert.equal(isQuestionTypeAllowed("vocabulary", "true_false"), false);
});
