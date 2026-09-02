import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "Set a new password — Vertex Quiz",
};

/**
 * Reached only after `/auth/confirm` has exchanged a recovery link's code
 * for a session — so "is there a session" is the actual, server-verified
 * signal for "is this link valid", not something read from the URL. A
 * visit with no session (expired link, already used, or navigated here
 * directly) renders an error state instead of a form that would just fail
 * on submit.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims);

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/brand/logo.png"
            alt="Vertex Studio"
            width={44}
            height={44}
            priority
            className="rounded-lg"
          />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Set a new password
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a new password for your teacher account.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {hasSession ? (
            <UpdatePasswordForm />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="size-5" />
              </div>
              <p className="text-sm text-foreground">
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
