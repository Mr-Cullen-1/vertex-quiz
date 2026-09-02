import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { loadPlayableSession } from "@/lib/student/quiz-session";
import { QuizPlayer } from "./_components/quiz-player";

export const metadata: Metadata = {
  title: "Vertex Quiz",
};

function StatusCard({
  icon,
  tone,
  title,
  description,
}: {
  icon: ReactNode;
  tone: "success" | "warning" | "destructive";
  title: string;
  description: string;
}) {
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
          <div
            className={
              "mx-auto mb-3 flex size-11 items-center justify-center rounded-full " +
              (tone === "success"
                ? "bg-success/10 text-success"
                : tone === "warning"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive")
            }
          >
            {icon}
          </div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The Phase 7 quiz-taking route. Everything is resolved from the opaque
 * `session_token` alone — never a raw id, never anything the browser sends
 * as an ownership claim — via `loadPlayableSession`, which also owns the
 * expiry/completed/not-found branching so this page only renders whatever
 * state comes back. `notFound()` is deliberately not used for an invalid
 * token: it would produce Next's generic 404 page, but "not_found" here
 * covers wrong tokens, drafts, and closed quizzes alike, and a plain status
 * card keeps that indistinguishable, same pattern as `/join/[token]`.
 */
export default async function QuizSessionPage(
  props: PageProps<"/quiz/[sessionToken]">
) {
  const { sessionToken } = await props.params;
  const view = await loadPlayableSession(sessionToken);

  if (view.state === "not_found") {
    return (
      <StatusCard
        icon={<AlertCircle className="size-5" />}
        tone="destructive"
        title="This quiz session isn't available."
        description="Double-check the link, or ask your teacher for a new one."
      />
    );
  }

  if (view.state === "expired") {
    return (
      <StatusCard
        icon={<Clock className="size-5" />}
        tone="warning"
        title="Time's up."
        description={`Your session for "${view.quizTitle}" has expired.`}
      />
    );
  }

  if (view.state === "completed") {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-5" />}
        tone="success"
        title="Quiz submitted!"
        description={`Thanks, ${view.participantFirstName} — your answers for "${view.quizTitle}" have been recorded.`}
      />
    );
  }

  return <QuizPlayer session={view.session} />;
}
