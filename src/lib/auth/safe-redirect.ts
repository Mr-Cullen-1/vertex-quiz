/**
 * Validates a `?next=` redirect target from an auth email link. That value
 * comes from a URL an email client, proxy, or the user themselves could
 * alter, so it's treated as untrusted input, not a safe redirect — this is
 * the one thing standing between `/auth/confirm` and an open-redirect bug.
 * Only a same-app relative path (`/foo`) is accepted; anything else
 * (absolute URLs, protocol-relative `//host` paths, or nothing at all)
 * falls back to `/`.
 */
export function getSafeRedirectPath(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}
