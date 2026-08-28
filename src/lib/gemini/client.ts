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
