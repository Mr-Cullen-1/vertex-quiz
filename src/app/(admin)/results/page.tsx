import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Percent, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { QUIZ_STATUS_LABEL, type QuizStatus } from "@/lib/quizzes/status";
import { QUIZ_FORMAT_LABEL, type QuizDifficulty, type QuizFormat } from "@/lib/quizzes/format";
import { computeSessionOverview } from "@/lib/quizzes/session-overview";
import { StatCard } from "../_components/stat-card";
import { HorizontalBarChart, type BarChartDatum } from "../_components/horizontal-bar-chart";

export const metadata: Metadata = {
  title: "Results — Vertex Quiz",
};

/** Caps the compact chart so a teacher with many quizzes still gets readable bars/labels. */
const MAX_CHART_ROWS = 8;

type Quiz = {
  id: string;
  title: string;
  status: QuizStatus;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  total_questions: number;
};

/**
 * A directory into each quiz's own results table
 * (`/quizzes/[id]/results`), not a flat list of every session — the
 * per-quiz table is where the actual score breakdown lives (Phase 8).
 * Session counts are computed from one `quiz_sessions` read (RLS already
 * scopes it to quizzes this teacher owns) rather than one query per quiz.
 */
export default async function ResultsPage() {
  const supabase = await createClient();

  const { data: quizzes, error: quizzesError } = await supabase
    .from("quizzes")
    .select("id, title, status, format, difficulty, total_questions")
    .order("created_at", { ascending: false })
    .overrideTypes<Quiz[], { merge: false }>();

  assertNoError(quizzesError, "Failed to load quizzes");

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const sessionCountByQuiz = new Map<string, number>();
  // `status`/`score` ride along on the same read that already computed
  // per-quiz session counts — one query, reused for both the quiz cards
  // below and the new overview/chart, never a second round trip.
  const sessionsByQuiz = new Map<string, { status: string; score: number | null }[]>();
  let allSessions: { quiz_id: string; status: string; score: number | null }[] = [];
  if (quizIds.length > 0) {
    const { data: sessions, error: sessionsError } = await supabase
      .from("quiz_sessions")
      .select("quiz_id, status, score")
      .in("quiz_id", quizIds);
    assertNoError(sessionsError, "Failed to load results");
    allSessions = sessions ?? [];
    for (const session of allSessions) {
      sessionCountByQuiz.set(session.quiz_id, (sessionCountByQuiz.get(session.quiz_id) ?? 0) + 1);
      const list = sessionsByQuiz.get(session.quiz_id) ?? [];
      list.push({ status: session.status, score: session.score });
      sessionsByQuiz.set(session.quiz_id, list);
    }
  }

  const quizzesWithResults = (quizzes ?? []).filter((q) => (sessionCountByQuiz.get(q.id) ?? 0) > 0);
  const hasResults = quizzesWithResults.length > 0;

  // Reuses the exact same definitions as the dedicated Analytics page
  // (`computeSessionOverview`, shared with `src/lib/quizzes/analytics.ts`)
  // — both for the totals below and for each quiz's average score.
  const overview = computeSessionOverview(allSessions);

  const scoreChartData: BarChartDatum[] = quizzesWithResults
    .map((q) => {
      const averageScore = computeSessionOverview(sessionsByQuiz.get(q.id) ?? []).averageScore;
      return averageScore != null
        ? { label: q.title, value: averageScore, valueLabel: `${averageScore}%` }
        : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_CHART_ROWS);

  // Falls back to session counts when no quiz has a scored session yet
  // (e.g. every session is still in progress) — comparing average scores
  // that don't exist yet would be misleading, per the same "no data, not a
  // real zero" rule as the metric tiles below.
  const sessionsChartData: BarChartDatum[] = quizzesWithResults
    .map((q) => ({ label: q.title, value: sessionCountByQuiz.get(q.id) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_CHART_ROWS);

  const usingScoreChart = scoreChartData.length > 0;
  const chartData = usingScoreChart ? scoreChartData : sessionsChartData;
  const chartTitle = usingScoreChart ? "Average score by quiz" : "Sessions by quiz";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
        <p className="text-sm text-muted-foreground">
          Participant results across every quiz you&apos;ve published.
        </p>
      </div>

      {hasResults ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-foreground">Performance overview</h3>

          {/*
            Outcome metrics only — this page answers "how did students do",
            not "how many quizzes do I have" (that's My Quizzes' "Quick
            activity overview", see src/app/(admin)/quizzes/page.tsx). No
            "Quizzes" tile here on purpose, so the two pages' overviews
            never end up showing the same four numbers.
          */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Sessions" value={String(overview.sessions)} icon={BarChart3} />
            <StatCard label="Participants" value={String(overview.sessions)} icon={Users} />
            <StatCard
              label="Avg. score"
              value={overview.averageScore != null ? `${overview.averageScore}%` : "—"}
              icon={Percent}
            />
            <StatCard
              label="Completion"
              value={overview.completionRate != null ? `${overview.completionRate}%` : "—"}
              icon={CheckCircle2}
            />
          </div>

          {chartData.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h4 className="mb-4 text-sm font-medium text-foreground">{chartTitle}</h4>
              <HorizontalBarChart data={chartData} />
            </div>
          ) : null}
        </div>
      ) : null}

      {hasResults ? (
        <ul className="flex flex-col gap-3 sm:gap-4">
          {quizzesWithResults.map((quiz) => {
            const sessionCount = sessionCountByQuiz.get(quiz.id) ?? 0;
            return (
              <li
                key={quiz.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent sm:size-11">
                      <BarChart3 className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-base font-semibold text-balance text-foreground">
                        {quiz.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {quiz.total_questions} question{quiz.total_questions === 1 ? "" : "s"} ·{" "}
                        {QUIZ_FORMAT_LABEL[quiz.format]} · {quiz.difficulty}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sessionCount} session{sessionCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Badge variant="secondary" className="h-6 shrink-0 px-2.5">
                      {QUIZ_STATUS_LABEL[quiz.status]}
                    </Badge>
                    <Link
                      href={`/quizzes/${quiz.id}/results`}
                      className={cn(buttonVariants({ size: "default" }), "h-11 w-full sm:w-auto")}
                    >
                      View results
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No results yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Once you publish a quiz and students complete it, their
                results will show up here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
