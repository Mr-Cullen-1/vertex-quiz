import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Vertex Quiz",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const resetSucceeded = searchParams?.reset === "success";

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
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
              Vertex Quiz
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your teacher dashboard
            </p>
          </div>
        </div>

        {resetSucceeded ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" />
            Password updated. Sign in with your new password.
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Teacher accounts are provisioned by your Vertex Studio administrator.
        </p>
      </div>
    </div>
  );
}
