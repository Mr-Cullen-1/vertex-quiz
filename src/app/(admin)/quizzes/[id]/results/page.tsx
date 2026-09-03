import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { QUIZ_FORMAT_LABEL, type QuizDifficulty, type QuizFormat } from "@/lib/quizzes/format";
import { ResultsAnalyticsNav } from "../_components/results-analytics-nav";

type QuizHeader = {
  id: string;
  title: string;
  status: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  total_questions: number;
};

type SessionRow = {
  id: string;
  status: "started" | "in_progress" | "completed" | "expired";
  score: number | null;
  correct_answers: number | null;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
  participants: { first_name: string; last_name: string } | null;
};

const STATUS_LABEL: Record<SessionRow["status"], string> = {
  started: "Started",
  in_progress: "In progress",
  completed: "Completed",
  expired: "Expired",
};

const STATUS_VARIANT: Record<SessionRow["status"], "secondary" | "outline"> = {
  started: "outline",
  in_progress: "outline",
  completed: "secondary",
  expired: "outline",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata(
  props: PageProps<"/quizzes/[id]/results">
): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("title").eq("id", id).maybeSingle();
  return { title: quiz ? `Results — ${quiz.title} — Vertex Quiz` : "Results — Vertex Quiz" };
}

/**
 * Per-quiz teacher results (Phase 8). Reuses the exact same ownership
 * pattern as every other `/quizzes/[id]/*` page: a plain RLS-scoped read
 * (`quizzes_select_own`) — another teacher's quiz id comes back as no row
 * at all, indistinguishable from a nonexistent one, so this never needs a
 * bespoke ownership check. `quiz_sessions`/`participants`/`responses` are
 * all read through the same authenticated client, scoped by their own
 * existing `*_select_own_quiz` RLS policies from Phase 1 — no new grant or
 * policy was needed for this page (verified live before writing this).
 */
export default async function QuizResultsPage(
  props: PageProps<"/quizzes/[id]/results">
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, status, format, difficulty, total_questions")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<QuizHeader, { merge: false }>();

  assertNoError(quizError, "Failed to load quiz");
  if (!quiz) {
    notFound();
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("quiz_sessions")
    .select(
      "id, status, score, correct_answers, total_questions, started_at, completed_at, participants(first_name, last_name)"
    )
    .eq("quiz_id", quiz.id)
    // Newest session first — `started_at` is never null (unlike
    // `completed_at`, which an in-progress session doesn't have yet), so it
    // gives every row a stable, always-present sort key.
    .order("started_at", { ascending: false })
    .overrideTypes<SessionRow[], { merge: false }>();

  assertNoError(sessionsError, "Failed to load results");

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const answeredBySession = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: responseRows, error: responsesError } = await supabase
      .from("responses")
      .select("session_id")
      .in("session_id", sessionIds);
    assertNoError(responsesError, "Failed to load response counts");
    for (const row of responseRows ?? []) {
      answeredBySession.set(row.session_id, (answeredBySession.get(row.session_id) ?? 0) + 1);
    }
  }

  const hasSessions = (sessions?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          nativeButton={false}
          render={<Link href={`/quizzes/${quiz.id}`} />}
        >
          <ArrowLeft className="size-4" />
          Back to quiz
        </Button>
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
        <p className="text-sm text-muted-foreground">{quiz.title}</p>
        <p className="text-sm text-muted-foreground">
          {QUIZ_FORMAT_LABEL[quiz.format]} · {quiz.difficulty} · {quiz.total_questions} question
          {quiz.total_questions === 1 ? "" : "s"}
        </p>
      </div>

      <ResultsAnalyticsNav quizId={quiz.id} active="results" />

      {hasSessions ? (
        <ul className="flex flex-col gap-3 sm:gap-4">
          {sessions!.map((session) => {
            const answered = answeredBySession.get(session.id) ?? 0;
            const unanswered = session.total_questions - answered;
            const incorrect =
              session.correct_answers != null ? answered - session.correct_answers : null;
            const studentName = session.participants
              ? `${session.participants.first_name} ${session.participants.last_name}`
              : "Unknown student";

            return (
              <li
                key={session.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent sm:size-11">
                      <User className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-base font-semibold text-foreground">
                        {studentName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.completed_at ? formatDateTime(session.completed_at) : "Not completed"}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm tabular-nums">
                        {session.score != null ? (
                          <span className="font-medium text-foreground">
                            {Math.round(session.score)}% score
                          </span>
                        ) : null}
                        {session.correct_answers != null ? (
                          <span className="text-success">{session.correct_answers} correct</span>
                        ) : null}
                        {incorrect != null ? (
                          <span className="text-destructive">{incorrect} incorrect</span>
                        ) : null}
                        {unanswered > 0 ? (
                          <span className="text-muted-foreground">{unanswered} unanswered</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <Badge variant={STATUS_VARIANT[session.status]} className="shrink-0">
                    {STATUS_LABEL[session.status]}
                  </Badge>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No sessions yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {quiz.status === "published"
                  ? "Students haven't completed this quiz yet."
                  : "Publish this quiz and share the join link to start collecting results."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
