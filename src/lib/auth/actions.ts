"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const emailSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export type LoginState = {
  error: string | null;
};

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (normalized.includes("email not confirmed")) {
    return "This account's email hasn't been confirmed yet.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Something went wrong while signing in. Please try again.";
}

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type RequestPasswordResetState = {
  error: string | null;
  success: boolean;
};

/**
 * Requests a recovery email. Always resolves to a generic success message
 * regardless of whether the address belongs to a real account — Supabase
 * itself doesn't distinguish "sent" from "no such user" in this response,
 * so mirroring that here (rather than surfacing a Supabase error for an
 * unknown email) avoids turning this form into an account-existence oracle.
 *
 * `redirectTo` points at `/auth/confirm`, not `/update-password` directly:
 * Supabase's recovery link lands there first with a one-time `?code=`,
 * which must be exchanged for a session server-side (PKCE) before
 * `/update-password` has anything to act on. Built from
 * `NEXT_PUBLIC_APP_URL`, never a hardcoded host, so the exact same code
 * path produces a `localhost:3000` link in dev and a
 * `vertex-quiz.vercel.app` link in production.
 */
export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: false };
  }

  const supabase = await createClient();
  const { NEXT_PUBLIC_APP_URL } = getEnv();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent("/update-password")}`,
  });

  if (error) {
    console.error("Password reset request failed:", error.message);
    return { error: "Something went wrong. Please try again in a moment.", success: false };
  }

  return { error: null, success: true };
}

export type UpdatePasswordState = {
  error: string | null;
};

/**
 * Sets a new password for the CURRENT session only — there is no id/email
 * parameter here, deliberately: `updateUser` always acts on whichever
 * account the request's own session cookie belongs to, so this can never
 * be pointed at another account. That session is expected to be the
 * short-lived one `/auth/confirm` just established from the recovery
 * link; if there isn't one (an expired/already-used/tampered link), this
 * fails safely with a message rather than silently doing nothing.
 */
export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("Password update failed:", error.message);
    return { error: "Failed to update your password. Please try again." };
  }

  // Ends the recovery session rather than leaving it active: the teacher
  // signs in fresh with the new password, and it also means `/login`'s own
  // "already signed in -> /dashboard" redirect (proxy.ts) doesn't fire and
  // swallow the success message below.
  await supabase.auth.signOut();
  redirect("/login?reset=success");
}
