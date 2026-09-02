import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, Check, Circle, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-background px-6 py-12 text-center">
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
 * The score's focal visual — an SVG ring rather than a chart dependency.
 * Always drawn in the Vertex primary color regardless of the percentage:
 * a quiz result isn't a "good/bad" traffic light, and the number itself
 * (rendered as real text, not baked into the graphic) already carries the
 * actual information for anyone not reading color at all.
 */
function ScoreRing({ percentage }: { percentage: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  return (
    <div className="relative mx-auto flex size-28 shrink-0 items-center justify-center sm:size-32">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
          {percentage}%
        </span>
        <span className="text-xs font-medium text-muted-foreground">Your score</span>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  toneClass,
  label,
  value,
}: {
  icon: ReactNode;
  toneClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 text-center shadow-sm">
      <div className={cn("flex size-7 items-center justify-center rounded-full", toneClass)}>
        {icon}
      </div>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PerformanceRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{value}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** A short, score-only characterization — never implies more than the percentage itself. */
function resultMessage(scorePercentage: number): string {
  if (scorePercentage >= 90) return "Excellent work";
  if (scorePercentage >= 70) return "Great work";
  if (scorePercentage >= 50) return "Good effort";
  return "Keep practicing";
}

function ResultCard({
  eyebrow,
  eyebrowIcon,
  note,
  quizTitle,
  quizDescription,
  participantFirstName,
  result,
}: {
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  note?: string;
  quizTitle: string;
  quizDescription: string | null;
  participantFirstName: string;
  result: QuizResult;
}) {
  return (
    <div className="min-h-dvh bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-md sm:max-w-lg">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/brand/logo.png"
            alt="Vertex Studio"
            width={32}
            height={32}
            priority
            className="rounded-lg"
          />
          <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {eyebrowIcon}
            {eyebrow}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-balance text-foreground sm:text-2xl">
            {resultMessage(result.scorePercentage)}, {participantFirstName}!
          </h1>
          {note ? <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{note}</p> : null}

          <div className="mt-3 border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">{quizTitle}</p>
            {quizDescription ? (
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{quizDescription}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {result.totalQuestions} question{result.totalQuestions === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <ScoreRing percentage={result.scorePercentage} />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {result.correctAnswers} correct out of {result.totalQuestions} question
            {result.totalQuestions === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:gap-3">
          <StatTile
            icon={<Check className="size-4" />}
            toneClass="bg-success/10 text-success"
            label="Correct"
            value={result.correctAnswers}
          />
          <StatTile
            icon={<X className="size-4" />}
            toneClass="bg-destructive/10 text-destructive"
            label="Incorrect"
            value={result.incorrectAnswers}
          />
          <StatTile
            icon={<Circle className="size-4" />}
            toneClass="bg-muted text-muted-foreground"
            label="Unanswered"
            value={result.unansweredQuestions}
          />
        </div>

        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <PerformanceRow
            label="Questions completed"
            value={`${result.answeredQuestions} / ${result.totalQuestions}`}
            percent={
              result.totalQuestions > 0
                ? (result.answeredQuestions / result.totalQuestions) * 100
                : 0
            }
          />
          <PerformanceRow
            label="Accuracy"
            value={`${result.scorePercentage}%`}
            percent={result.scorePercentage}
          />
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

  // Only the first name is shown — participantName is already just a
  // display string built from the session's own first/last name, so this
  // is a presentational split, not a new query or extra personal data.
  const participantFirstName = view.state !== "active" ? view.participantName.split(" ")[0] : "";

  if (view.state === "expired") {
    return (
      <ResultCard
        eyebrow="Time's up"
        eyebrowIcon={<Clock className="size-3.5" />}
        note="The deadline passed before you submitted — here's your result from the answers you saved."
        quizTitle={view.quizTitle}
        quizDescription={view.quizDescription}
        participantFirstName={participantFirstName}
        result={view.result}
      />
    );
  }

  if (view.state === "completed") {
    return (
      <ResultCard
        eyebrow="Quiz completed"
        quizTitle={view.quizTitle}
        quizDescription={view.quizDescription}
        participantFirstName={participantFirstName}
        result={view.result}
      />
    );
  }

  return <QuizPlayer session={view.session} />;
}
