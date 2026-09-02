import "server-only";

/**
 * `expires_at` is always the authoritative check — never a persisted
 * status. What happens once a session is discovered to be expired (marking
 * it `expired` and computing its result) lives in `./scoring`'s
 * `finalizeSession`, not here.
 */
export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
