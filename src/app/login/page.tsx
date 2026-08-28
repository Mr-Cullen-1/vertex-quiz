import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Vertex Quiz",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/dashboard");
  }

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
