"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { submitAnswer, submitQuiz } from "@/lib/student/response-actions";
import type { ActiveSession, PlayableQuestion } from "@/lib/student/quiz-session";

const OPTION_LABELS = ["A", "B", "C", "D"];

// Presentational thresholds only — the server (expires_at) is always the
// authoritative deadline; these just decide when the countdown pill
// switches to a more urgent visual treatment.
const LOW_TIME_MS = 60_000;
const NEARING_TIME_MS = 5 * 60_000;

/**
 * A session with neither a per-quiz duration nor a deadline falls back to a
 * long server-side window (see `join-actions.ts`'s `NO_LIMIT_FALLBACK_MS`),
 * which previously rendered as an overflowing, confusing `MM:SS` (minutes
 * in the hundreds). Formatting hours explicitly once the remaining time
 * crosses an hour keeps the display honest about what's actually left
 * without needing to know *why* the window is long.
 */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

function QuestionNavigator({
  questions,
  selections,
  currentIndex,
  locked,
  onNavigate,
  className,
}: {
  questions: PlayableQuestion[];
  selections: Record<string, string | null>;
  currentIndex: number;
  locked: boolean;
  onNavigate: (index: number) => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label="Jump to question">
      {questions.map((q, index) => {
        const isAnswered = selections[q.id] != null;
        return (
          <button
            key={q.id}
            type="button"
            disabled={locked}
            onClick={() => onNavigate(index)}
            aria-current={index === currentIndex}
            aria-label={`Question ${index + 1}${isAnswered ? " (answered)" : ""}`}
            className={cn(
              "flex size-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xs font-semibold outline-none transition-colors disabled:pointer-events-none focus-visible:ring-3 focus-visible:ring-ring/50",
              index === currentIndex
                ? "bg-primary text-primary-foreground"
                : isAnswered
                  ? "bg-accent/10 text-accent"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {index + 1}
          </button>
        );
      })}
    </nav>
  );
}

export function QuizPlayer({ session }: { session: ActiveSession }) {
  const router = useRouter();
  const { sessionToken, quizTitle, questions } = session;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.selectedAnswerId]))
  );
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // null until the first tick — Date.now() can't be called during render
  // (it's impure), so the countdown starts ticking only once the effect
  // below runs on the client.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const expiresAtMs = new Date(session.expiresAt).getTime();
    // Corrects for client/server clock skew using the single server
    // timestamp captured when this session was loaded — not a substitute
    // for the server's own re-check on every write, just a display
    // refinement so the countdown roughly matches what the server enforces.
    const offsetMs = new Date(session.serverNow).getTime() - Date.now();

    function tick() {
      setRemainingMs(expiresAtMs - (Date.now() + offsetMs));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session.expiresAt, session.serverNow]);

  const timedOut = remainingMs !== null && remainingMs <= 0;

  useEffect(() => {
    if (!timedOut) return;
    // The server is the source of truth for expiry — this just moves the
    // student off the now-locked player and lets loadPlayableSession's own
    // (already-enforced) expiry check render the right state.
    const timeout = setTimeout(() => router.refresh(), 1200);
    return () => clearTimeout(timeout);
  }, [timedOut, router]);

  const locked = timedOut || isSubmitting;
  const current = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => selections[q.id] != null).length;
  const unansweredCount = totalQuestions - answeredCount;
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;

  const handleSelect = useCallback(
    async (questionId: string, answerId: string) => {
      if (locked) return;
      setAnswerError(null);
      setSelections((prev) => ({ ...prev, [questionId]: answerId }));
      setSavingQuestionId(questionId);

      const result = await submitAnswer(sessionToken, questionId, answerId);

      setSavingQuestionId((prev) => (prev === questionId ? null : prev));
      if (!result.success) {
        if (result.stale) {
          router.refresh();
          return;
        }
        setAnswerError(result.error);
      }
    },
    [locked, sessionToken, router]
  );

  async function handleConfirmSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitDialogOpen(false);
    setIsSubmitting(true);

    const result = await submitQuiz(sessionToken);
    if (!result.success) {
      submittingRef.current = false;
      setIsSubmitting(false);
      setAnswerError(result.error);
      return;
    }
    router.refresh();
  }

  const isLowTime = remainingMs !== null && remainingMs <= LOW_TIME_MS;
  const isNearingTime = remainingMs !== null && !isLowTime && remainingMs <= NEARING_TIME_MS;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col xl:flex-row xl:items-start xl:gap-8 xl:px-6 xl:py-8">
        {/* Desktop-only branding + navigator rail — the mobile/tablet header and
            in-flow navigator below cover the same ground at narrower widths. */}
        <aside className="hidden xl:sticky xl:top-8 xl:flex xl:w-64 xl:shrink-0 xl:flex-col xl:gap-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image src="/brand/logo.png" alt="" width={32} height={32} className="shrink-0 rounded-lg" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-foreground">Vertex Quiz</p>
              <p className="truncate text-xs text-muted-foreground">{quizTitle}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              {answeredCount} of {totalQuestions} answered
            </p>
            <QuestionNavigator
              questions={questions}
              selections={selections}
              currentIndex={currentIndex}
              locked={locked}
              onNavigate={setCurrentIndex}
            />
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col xl:min-h-0">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm xl:static xl:rounded-xl xl:border xl:bg-card xl:shadow-sm">
            <div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3 md:max-w-3xl xl:max-w-none">
              <div className="flex min-w-0 items-center gap-2.5 xl:hidden">
                <Image src="/brand/logo.png" alt="" width={24} height={24} className="shrink-0 rounded-md" />
                <p className="truncate text-sm font-medium text-muted-foreground">{quizTitle}</p>
              </div>
              <p className="hidden text-sm font-medium text-muted-foreground xl:block">
                Question {currentIndex + 1} of {totalQuestions}
              </p>
              <div
                className={cn(
                  "ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                  isLowTime
                    ? "bg-destructive/10 text-destructive"
                    : isNearingTime
                      ? "bg-warning/20 text-foreground"
                      : "bg-muted text-foreground"
                )}
              >
                <Clock className="size-3.5" aria-hidden="true" />
                <span className="sr-only">Time remaining:</span>
                <span>{remainingMs === null ? "--:--" : formatCountdown(remainingMs)}</span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-muted xl:rounded-b-xl">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-6 md:max-w-3xl xl:max-w-none xl:justify-start xl:px-0">
            {timedOut ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
                <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <Clock className="size-5" />
                </div>
                <p className="text-sm font-medium text-foreground">Time&apos;s up.</p>
                <p className="text-sm text-muted-foreground">Loading your result…</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <p className="text-sm font-medium text-muted-foreground xl:hidden">
                  Question {currentIndex + 1} of {totalQuestions}
                </p>

                <div
                  key={current.id}
                  className="flex min-h-28 flex-col justify-center rounded-xl border border-border bg-card p-5 shadow-sm sm:min-h-32 sm:p-6"
                >
                  <h1 className="text-lg leading-snug font-semibold text-balance text-foreground sm:text-xl">
                    {current.text}
                  </h1>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {current.answers.map((answer, index) => {
                    const isSelected = selections[current.id] === answer.id;
                    const isSaving = savingQuestionId === current.id && isSelected;
                    return (
                      <button
                        key={answer.id}
                        type="button"
                        disabled={locked}
                        onClick={() => handleSelect(current.id, answer.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          "group flex min-h-14 items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50",
                          isSelected
                            ? "border-warning bg-warning/15 text-foreground ring-1 ring-warning"
                            : "border-border bg-card text-foreground hover:border-accent/40 hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            isSelected
                              ? "bg-warning text-warning-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {current.type === "multiple_choice"
                            ? OPTION_LABELS[index]
                            : answer.text.trim().toLowerCase() === "true"
                              ? "T"
                              : "F"}
                        </span>
                        <span className="flex-1 text-pretty">{answer.text}</span>
                        {isSaving ? (
                          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : isSelected ? (
                          <Check className="size-4 shrink-0 text-foreground" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {answerError ? (
                  <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    {answerError}
                  </p>
                ) : null}

                <QuestionNavigator
                  questions={questions}
                  selections={selections}
                  currentIndex={currentIndex}
                  locked={locked}
                  onNavigate={setCurrentIndex}
                  className="xl:hidden"
                />

                <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11"
                    disabled={locked || currentIndex === 0}
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  >
                    <ArrowLeft className="size-4" />
                    Previous
                  </Button>

                  {isLastQuestion ? (
                    <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
                      <AlertDialogTrigger
                        render={<Button variant="warning" size="lg" className="h-11" disabled={locked} />}
                      >
                        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                        {isSubmitting ? "Submitting…" : "Submit Quiz"}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Submit this quiz?</AlertDialogTitle>
                          <AlertDialogDescription>
                            You&apos;ve answered {answeredCount} of {totalQuestions} questions.
                            {unansweredCount === 0
                              ? " You won't be able to change your answers after you submit."
                              : null}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {unansweredCount > 0 ? (
                          <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-left text-sm text-foreground">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                            <span>
                              {unansweredCount} question{unansweredCount === 1 ? "" : "s"}{" "}
                              {unansweredCount === 1 ? "is" : "are"} unanswered. You can still
                              submit, but unanswered questions won&apos;t earn any points.
                            </span>
                          </p>
                        ) : null}
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-11">Keep reviewing</AlertDialogCancel>
                          <AlertDialogAction className="h-11" onClick={handleConfirmSubmit}>
                            Submit
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button
                      size="lg"
                      className="h-11"
                      disabled={locked}
                      onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
                    >
                      Next
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
