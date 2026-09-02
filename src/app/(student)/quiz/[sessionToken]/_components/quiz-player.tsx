"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Clock, Loader2 } from "lucide-react";
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
import type { ActiveSession } from "@/lib/student/quiz-session";

const OPTION_LABELS = ["A", "B", "C", "D"];

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function QuizPlayer({ session }: { session: ActiveSession }) {
  const router = useRouter();
  const { sessionToken, questions } = session;

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
  const answeredCount = questions.filter((q) => selections[q.id] != null).length;
  const isLastQuestion = currentIndex === questions.length - 1;

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

  const lowTime = remainingMs !== null && remainingMs <= 60_000;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/logo.png"
              alt=""
              width={24}
              height={24}
              className="rounded-md"
            />
            <div className="text-sm font-medium text-muted-foreground">
              Question {currentIndex + 1} of {questions.length}
            </div>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
              lowTime ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
            )}
          >
            <Clock className="size-3.5" />
            {remainingMs === null ? "--:--" : formatClock(remainingMs)}
          </div>
        </div>
        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8">
        {timedOut ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Clock className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Time&apos;s up.</p>
            <p className="text-sm text-muted-foreground">Loading your result…</p>
          </div>
        ) : (
          <div key={current.id} className="flex flex-col gap-6">
            <h1 className="text-xl leading-snug font-semibold text-balance text-foreground sm:text-2xl">
              {current.text}
            </h1>

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
                      "group flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {current.type === "multiple_choice"
                        ? OPTION_LABELS[index]
                        : answer.text.trim().toLowerCase() === "true"
                          ? "T"
                          : "F"}
                    </span>
                    <span className="flex-1">{answer.text}</span>
                    {isSaving ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : isSelected ? (
                      <Check className="size-4 shrink-0 text-primary" />
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

            <nav className="flex flex-wrap gap-1.5" aria-label="Jump to question">
              {questions.map((q, index) => (
                <button
                  key={q.id}
                  type="button"
                  disabled={locked}
                  onClick={() => setCurrentIndex(index)}
                  aria-current={index === currentIndex}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors disabled:pointer-events-none",
                    index === currentIndex
                      ? "bg-primary text-primary-foreground"
                      : selections[q.id] != null
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {index + 1}
                </button>
              ))}
            </nav>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button
                variant="outline"
                disabled={locked || currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              >
                <ArrowLeft className="size-4" />
                Previous
              </Button>

              {isLastQuestion ? (
                <AlertDialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
                  <AlertDialogTrigger render={<Button disabled={locked} />}>
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    {isSubmitting ? "Submitting…" : "Submit quiz"}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Submit this quiz?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You&apos;ve answered {answeredCount} of {questions.length} questions.
                        You won&apos;t be able to change your answers after you submit.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
                      <AlertDialogAction className="w-full" onClick={handleConfirmSubmit}>
                        Submit
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  disabled={locked}
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
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
  );
}
