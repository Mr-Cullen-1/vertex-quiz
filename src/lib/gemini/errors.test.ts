import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@google/genai";
import {
  classifyGeminiFailure,
  GEMINI_FAILURE_MESSAGE,
  GEMINI_MAX_ATTEMPTS,
  GEMINI_RETRYABLE_STATUS_CODES,
} from "./errors.ts";

/**
 * These tests cover exactly what this codebase owns: the retry *policy*
 * (which status codes are retryable, how many attempts) and the failure
 * -> user-message classification. They deliberately do NOT re-implement
 * or mock `@google/genai`'s actual retry loop (`attempts`/
 * `httpStatusCodes` -> `p-retry` inside the SDK) — that's third-party
 * code with its own contract (read directly from
 * `node_modules/@google/genai/dist/node/index.mjs` while diagnosing the
 * original issue): a response whose status is in `httpStatusCodes` is
 * retried up to `attempts` times; any other status (or a genuine
 * success) is returned immediately, no retry attempted. Re-testing that
 * contract here would mean re-implementing the SDK, not testing our
 * code. No real Gemini call is made — everything below is a constructed
 * `ApiError`/`Error`, never live network I/O.
 */

test("retry policy targets exactly the two transient statuses seen in production (503, 504)", () => {
  assert.deepEqual(GEMINI_RETRYABLE_STATUS_CODES, [503, 504]);
});

test("retry policy allows exactly one retry (2 attempts total), not more", () => {
  assert.equal(GEMINI_MAX_ATTEMPTS, 2);
});

test("retry policy is actually enabled (more than a single attempt)", () => {
  // `attempts` is a ceiling the SDK treats as "no retries" at 0 or 1 —
  // guards against ever accidentally disabling retries by setting this
  // to 1 while believing retries are still configured.
  assert.ok(GEMINI_MAX_ATTEMPTS > 1);
});

test("a persistent 503 (all retry attempts exhausted) classifies as transient_unavailable", () => {
  const err = new ApiError({ message: "high demand", status: 503 });
  assert.equal(classifyGeminiFailure(err), "transient_unavailable");
  assert.equal(
    GEMINI_FAILURE_MESSAGE[classifyGeminiFailure(err)],
    "AI service is temporarily unavailable. Please try again in a few minutes."
  );
});

test("a persistent 504 (all retry attempts exhausted) classifies as transient_unavailable", () => {
  const err = new ApiError({ message: "deadline exceeded", status: 504 });
  assert.equal(classifyGeminiFailure(err), "transient_unavailable");
});

for (const status of [400, 401, 403]) {
  test(`a ${status} response is never treated as retryable/transient (no retry, generic message)`, () => {
    const err = new ApiError({ message: "bad request", status });
    assert.notEqual(GEMINI_RETRYABLE_STATUS_CODES.includes(status), true);
    assert.equal(classifyGeminiFailure(err), "other");
    assert.equal(
      GEMINI_FAILURE_MESSAGE[classifyGeminiFailure(err)],
      "The AI service failed to process this PDF. Please try again."
    );
  });
}

test("a client-side abort/timeout classifies as timed_out, not transient_unavailable", () => {
  const err = new DOMException("This operation was aborted", "AbortError");
  assert.equal(classifyGeminiFailure(err), "timed_out");
  assert.equal(
    GEMINI_FAILURE_MESSAGE[classifyGeminiFailure(err)],
    "The AI service took too long to respond. Please try again."
  );
});

test("an unrelated error (e.g. a parsing failure) falls back to the generic message, not the retry-specific one", () => {
  const err = new Error("Unexpected token in JSON");
  assert.equal(classifyGeminiFailure(err), "other");
});

test("a non-Error thrown value (defensive) falls back to the generic message rather than throwing", () => {
  assert.equal(classifyGeminiFailure("not an Error instance"), "other");
  assert.equal(classifyGeminiFailure(undefined), "other");
});
