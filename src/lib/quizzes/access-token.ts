import { randomBytes } from "node:crypto";

/**
 * Generates the opaque student-facing access token stored in
 * `quizzes.access_code` and used in the public `/join/{token}` URL.
 * Deliberately NOT the quiz's UUID, a sequential id, or anything derived
 * from the title/timestamp — 24 cryptographically random bytes, base64url
 * encoded (32 URL-safe characters, ~192 bits of entropy), so the token
 * itself carries no information and can't be guessed or enumerated.
 */
export function generateAccessToken(): string {
  return randomBytes(24).toString("base64url");
}
