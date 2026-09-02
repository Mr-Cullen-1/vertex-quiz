import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { ResultsAnalyticsNav } from "../_components/results-analytics-nav";

type QuizHeader = { id: string; title: string; status: string };

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
    .select("id, title, status")
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
      </div>

      <ResultsAnalyticsNav quizId={quiz.id} active="results" />

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        {hasSessions ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Correct</th>
                  <th className="py-2 pr-4 font-medium">Incorrect</th>
                  <th className="py-2 pr-4 font-medium">Unanswered</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions!.map((session) => {
                  const answered = answeredBySession.get(session.id) ?? 0;
                  const unanswered = session.total_questions - answered;
                  const incorrect =
                    session.correct_answers != null ? answered - session.correct_answers : null;

                  return (
                    <tr key={session.id}>
                      <td className="py-3 pr-4 font-medium text-foreground">
                        {session.participants
                          ? `${session.participants.first_name} ${session.participants.last_name}`
                          : "Unknown student"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-foreground">
                        {session.score != null ? `${Math.round(session.score)}%` : "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-success">
                        {session.correct_answers ?? "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-destructive">
                        {incorrect ?? "—"}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-muted-foreground">{unanswered}</td>
                      <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                        {session.total_questions}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={STATUS_VARIANT[session.status]}>
                          {STATUS_LABEL[session.status]}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {session.completed_at ? formatDateTime(session.completed_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No results yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {quiz.status === "published"
                  ? "Once students join and complete this quiz, their results will show up here."
                  : "Publish this quiz and share the join link to start collecting results."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
