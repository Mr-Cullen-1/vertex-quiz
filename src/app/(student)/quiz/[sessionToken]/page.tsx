import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

type SessionSummary = {
  status: string;
  quizzes: { title: string } | null;
  participants: { first_name: string } | null;
};

export const metadata: Metadata = {
  title: "You're in — Vertex Quiz",
};

/**
 * The Phase 7 quiz-taking entry point. Today this only confirms the
 * session was created and identifies it by the opaque
 * `quiz_sessions.session_token` — never the row's raw id, and never any
 * other internal identifier — exactly the value `startSession()` handed
 * back to the student. Reading it back uses the service-role client for
 * the same reason the join flow does: no Supabase Auth session exists to
 * scope RLS to. No question-answering UI belongs here yet.
 */
export default async function QuizSessionPage(
  props: PageProps<"/quiz/[sessionToken]">
) {
  const { sessionToken } = await props.params;
  const admin = createAdminClient();

  const { data: session, error } = await admin
    .from("quiz_sessions")
    .select("status, quizzes(title), participants(first_name)")
    .eq("session_token", sessionToken)
    .maybeSingle()
    .overrideTypes<SessionSummary, { merge: false }>();

  if (error) {
    console.error("Failed to load quiz session:", error.message);
  }
  if (!session) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12 text-center">
      <div className="w-full max-w-sm">
        <Image
          src="/brand/logo.png"
          alt="Vertex Studio"
          width={44}
          height={44}
          priority
          className="mx-auto mb-6 rounded-lg"
        />
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            You&apos;re in, {session.participants?.first_name}!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your session for &ldquo;{session.quizzes?.title}&rdquo; has started.
            The quiz itself will open here in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
