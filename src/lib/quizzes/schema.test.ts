import { test } from "node:test";
import assert from "node:assert/strict";
import { quizFormSchema } from "./schema.ts";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Chapter 4",
    description: "",
    format: "comprehension",
    difficulty: "B1",
    multipleChoiceCount: 5,
    trueFalseCount: 3,
    durationMinutes: "",
    deadline: "",
    ...overrides,
  };
}

// --- FORMAT VALIDATION ---

test("format validation: comprehension is accepted", () => {
  const result = quizFormSchema.safeParse(baseInput({ format: "comprehension" }));
  assert.equal(result.success, true);
});

test("format validation: vocabulary is accepted", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ format: "vocabulary", difficulty: "B1", trueFalseCount: 0 })
  );
  assert.equal(result.success, true);
});

test("format validation: an invalid format is rejected", () => {
  const result = quizFormSchema.safeParse(baseInput({ format: "grammar" }));
  assert.equal(result.success, false);
});

// --- DIFFICULTY VALIDATION ---

test("difficulty validation (comprehension): B1 is accepted", () => {
  const result = quizFormSchema.safeParse(baseInput({ format: "comprehension", difficulty: "B1" }));
  assert.equal(result.success, true);
});

test("difficulty validation (comprehension): B2 is accepted", () => {
  const result = quizFormSchema.safeParse(baseInput({ format: "comprehension", difficulty: "B2" }));
  assert.equal(result.success, true);
});

test("difficulty validation (comprehension): C1 is rejected", () => {
  const result = quizFormSchema.safeParse(baseInput({ format: "comprehension", difficulty: "C1" }));
  assert.equal(result.success, false);
});

test("difficulty validation (vocabulary): B1 is accepted", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ format: "vocabulary", difficulty: "B1", trueFalseCount: 0 })
  );
  assert.equal(result.success, true);
});

test("difficulty validation (vocabulary): B2 is accepted", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ format: "vocabulary", difficulty: "B2", trueFalseCount: 0 })
  );
  assert.equal(result.success, true);
});

test("difficulty validation (vocabulary): C1 is accepted", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ format: "vocabulary", difficulty: "C1", trueFalseCount: 0 })
  );
  assert.equal(result.success, true);
});

// --- Vocabulary Quiz can never carry True/False questions ---

test("vocabulary quiz with a nonzero True/False count is rejected", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ format: "vocabulary", difficulty: "B1", trueFalseCount: 1 })
  );
  assert.equal(result.success, false);
});

// --- BACKWARD COMPATIBILITY: pre-existing comprehension composition rules ---

test("backward compatibility: at least one question is still required", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ multipleChoiceCount: 0, trueFalseCount: 0 })
  );
  assert.equal(result.success, false);
});

test("backward compatibility: a comprehension quiz with only Multiple Choice still validates", () => {
  const result = quizFormSchema.safeParse(
    baseInput({ multipleChoiceCount: 10, trueFalseCount: 0 })
  );
  assert.equal(result.success, true);
});
