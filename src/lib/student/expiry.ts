import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/** `expires_at` is always the authoritative check — never a persisted status. */
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Best-effort: records that a session has expired the first time anything
 * (a page load or a write attempt) discovers `expires_at` has passed while
 * it was still started/in_progress. Failures are swallowed — `expires_at`
 * remains the real source of truth regardless of whether this write lands.
 */
export async function markSessionExpired(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string
): Promise<void> {
  const { error } = await admin
    .from("quiz_sessions")
    .update({ status: "expired" })
    .eq("id", sessionId)
    .in("status", ["started", "in_progress"]);
  if (error) {
    console.error("Failed to mark session expired:", error.message);
  }
}
