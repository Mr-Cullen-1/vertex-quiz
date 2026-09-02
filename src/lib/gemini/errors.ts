import { ApiError } from "@google/genai";

/**
 * Retry only the two failure modes a live diagnostic actually observed
 * Gemini returning during a real "high demand" incident — `503
 * UNAVAILABLE` and `504 DEADLINE_EXCEEDED` — never a 4xx (bad request,
 * auth, or anything else the caller did wrong, which retrying would
 * never fix and would just repeat needlessly). `attempts` includes the
 * initial call, so this is one retry, not an extra retry loop. Each
 * attempt still gets the full `GEMINI_REQUEST_TIMEOUT_MS` budget (see
 * `./client.ts`) — the per-attempt timeout is unchanged, so the worst
 * case (both attempts genuinely time out) is bounded at roughly 2x that,
 * not unbounded.
 *
 * Deliberately has no `server-only` guard, unlike `client.ts` — nothing
 * here touches an API key or environment variable, and keeping it plain
 * is what lets `classifyGeminiFailure` be unit-tested directly (see
 * `errors.test.ts`) without needing a server-rendering context.
 */
export const GEMINI_MAX_ATTEMPTS = 2;
export const GEMINI_RETRYABLE_STATUS_CODES = [503, 504];

export type GeminiFailureReason = "transient_unavailable" | "timed_out" | "other";

/**
 * Classifies a `generateContent()` failure into exactly the outcome
 * `generateQuestions` needs to pick a safe, useful message for — never
 * the raw SDK error, which could carry a response body or other internal
 * detail that shouldn't reach a teacher.
 *
 * - `transient_unavailable`: every retry attempt was exhausted and the
 *   *last* one still came back 503/504 — Gemini itself, not us.
 * - `timed_out`: our own `GEMINI_REQUEST_TIMEOUT_MS` (or the SDK's own
 *   deadline) aborted the request before any response arrived at all.
 * - `other`: anything else — a 4xx, a malformed request, or anything
 *   retrying would never have fixed.
 */
export function classifyGeminiFailure(err: unknown): GeminiFailureReason {
  if (err instanceof ApiError && GEMINI_RETRYABLE_STATUS_CODES.includes(err.status)) {
    return "transient_unavailable";
  }
  if (err instanceof Error && (err.name === "AbortError" || /timeout/i.test(err.message))) {
    return "timed_out";
  }
  return "other";
}

/** Safe, generic, user-facing text for each classified outcome — no secrets, no raw SDK detail. */
export const GEMINI_FAILURE_MESSAGE: Record<GeminiFailureReason, string> = {
  transient_unavailable: "AI service is temporarily unavailable. Please try again in a few minutes.",
  timed_out: "The AI service took too long to respond. Please try again.",
  other: "The AI service failed to process this PDF. Please try again.",
};
