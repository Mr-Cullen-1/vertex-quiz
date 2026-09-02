import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

/**
 * The PKCE landing point every Supabase auth email (password recovery,
 * today; invites/magic links if this project ever adds them) redirects to.
 * Supabase's own server appends a one-time `?code=`, which must be
 * exchanged for a session here — server-side, via the same cookie-bound
 * client every other Server Action uses — before the destination page
 * (`next`) has an authenticated session to act on. The code itself is
 * never logged, only `error.message` on failure.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("Failed to exchange recovery code for a session:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=reset-link-invalid`);
}
