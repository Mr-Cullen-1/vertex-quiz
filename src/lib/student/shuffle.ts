import { randomInt } from "node:crypto";

/**
 * Fisher-Yates shuffle using a cryptographically strong RNG — consistent
 * with the rest of this codebase's token generation (see
 * `src/lib/quizzes/access-token.ts`), even though the security stakes of a
 * question order are low. Returns a new array; the input is untouched.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
