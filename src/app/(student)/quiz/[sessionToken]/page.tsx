import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { loadPlayableSession } from "@/lib/student/quiz-session";
import type { QuizResult } from "@/lib/student/scoring";
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

function ResultCard({
  tone,
  heading,
  note,
  quizTitle,
  participantName,
  result,
}: {
  tone: "success" | "warning";
  heading: string;
  note: string;
  quizTitle: string;
  participantName: string;
  result: QuizResult;
}) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <Image
          src="/brand/logo.png"
          alt="Vertex Studio"
          width={44}
          height={44}
          priority
          className="mx-auto mb-6 rounded-lg"
        />
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <div
            className={
              "mx-auto mb-3 flex size-11 items-center justify-center rounded-full " +
              (tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")
            }
          >
            {tone === "success" ? <CheckCircle2 className="size-5" /> : <Clock className="size-5" />}
          </div>
          <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{note}</p>

          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">{quizTitle}</p>
            <p className="text-sm text-muted-foreground">{participantName}</p>

            <p className="mt-4 text-5xl font-bold tabular-nums text-foreground">
              {result.scorePercentage}%
            </p>

            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Correct</dt>
                <dd className="text-lg font-semibold tabular-nums text-success">
                  {result.correctAnswers}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Incorrect</dt>
                <dd className="text-lg font-semibold tabular-nums text-destructive">
                  {result.incorrectAnswers}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Unanswered</dt>
                <dd className="text-lg font-semibold tabular-nums text-muted-foreground">
                  {result.unansweredQuestions}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-muted-foreground">
              {result.totalQuestions} question{result.totalQuestions === 1 ? "" : "s"} total
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The student quiz-taking + result route (Phase 7 player, Phase 8 result).
 * Everything is resolved from the opaque `session_token` alone — never a
 * raw id, never anything the browser sends as an ownership claim — via
 * `loadPlayableSession`, which also owns the expiry/completed/not-found
 * branching (and, for the two terminal states, the score itself — computed
 * server-side from `responses`, never from anything the client sends) so
 * this page only renders whatever state comes back. `notFound()` is
 * deliberately not used for an invalid token: it would produce Next's
 * generic 404 page, but "not_found" here covers wrong tokens, drafts, and
 * closed quizzes alike, and a plain status card keeps that
 * indistinguishable, same pattern as `/join/[token]`.
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
      <ResultCard
        tone="warning"
        heading="Time's up"
        note="The deadline passed before you submitted — here's your result from the answers you saved."
        quizTitle={view.quizTitle}
        participantName={view.participantName}
        result={view.result}
      />
    );
  }

  if (view.state === "completed") {
    return (
      <ResultCard
        tone="success"
        heading="Your Result"
        note="Quiz submitted — nice work!"
        quizTitle={view.quizTitle}
        participantName={view.participantName}
        result={view.result}
      />
    );
  }

  return <QuizPlayer session={view.session} />;
}
