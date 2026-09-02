import "server-only";
import { GoogleGenAI } from "@google/genai";
import { getEnv } from "@/lib/env";

/**
 * `gemini-flash-latest` — Google's rolling alias for the current
 * recommended Flash model, rather than a dated snapshot (e.g.
 * `gemini-2.5-flash`). Fast and inexpensive, and more than capable of
 * document-grounded extraction/structured-output tasks like this one.
 * Swap for `gemini-pro-latest` if extraction quality ever needs to trade
 * speed/cost for more careful reasoning.
 */
export const GEMINI_MODEL = "gemini-flash-latest";

/**
 * Without an explicit `httpOptions.timeout`, the SDK leaves Node's
 * underlying HTTP client (undici) at its own default headers timeout —
 * 5 minutes — so a stalled Gemini connection leaves the teacher staring
 * at "Generating..." for that entire time before finally failing (seen
 * for real: `UND_ERR_HEADERS_TIMEOUT` at ~5.1 minutes). 2 minutes is
 * generous for a single PDF extraction call on `gemini-flash-latest`
 * while failing fast enough that "Try again" is a reasonable next step
 * rather than another multi-minute wait.
 */
export const GEMINI_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

let cached: GoogleGenAI | null = null;

/**
 * Server-only Gemini client. `GEMINI_API_KEY` is read once via
 * `getEnv()` (Zod-validated, never exposed to the client — see
 * src/lib/env.ts) and never touches a client bundle, guarded by the
 * `server-only` import.
 */
export function getGeminiClient(): GoogleGenAI {
  if (!cached) {
    const env = getEnv();
    cached = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return cached;
}
