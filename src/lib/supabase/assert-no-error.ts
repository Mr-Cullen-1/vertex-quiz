import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Throws when a Supabase query returned an error, instead of letting a
 * denied/failed query quietly fall through as if it had returned no rows.
 * A thrown error inside a page component is caught by the nearest
 * `error.tsx` boundary — the caller should not also catch this.
 */
export function assertNoError(
  error: PostgrestError | null,
  context: string
): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}
