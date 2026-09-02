import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, CheckCircle2, Clock, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { loadQuizAnalytics } from "@/lib/quizzes/analytics";
import { ResultsAnalyticsNav } from "../_components/results-analytics-nav";
import { ScoreDistributionChart } from "./_components/score-distribution-chart";
import { QuestionPerformance } from "./_components/question-performance";

function formatPercent(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
      </CardContent>
    </Card>
  );
}

export async function generateMetadata(
  props: PageProps<"/quizzes/[id]/analytics">
): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: quiz } = await supabase.from("quizzes").select("title").eq("id", id).maybeSingle();
  return { title: quiz ? `Analytics — ${quiz.title} — Vertex Quiz` : "Analytics — Vertex Quiz" };
}

/**
 * Per-quiz teacher analytics (Phase 9) — aggregate insight, distinct from
 * `/quizzes/[id]/results`' detailed per-student table. All the actual
 * aggregation (ownership check, completed/expired self-healing, every
 * formula) lives in `src/lib/quizzes/analytics.ts`; this file is just the
 * view over whatever it returns.
 */
export default async function QuizAnalyticsPage(
  props: PageProps<"/quizzes/[id]/analytics">
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const analytics = await loadQuizAnalytics(supabase, id);
  if (!analytics) {
    notFound();
  }

  const { overview, distribution, questions } = analytics;
  const hasParticipants = overview.participants > 0;
  const hasScoredSessions = overview.scoredSessionCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          nativeButton={false}
          render={<Link href={`/quizzes/${analytics.quizId}`} />}
        >
          <ArrowLeft className="size-4" />
          Back to quiz
        </Button>
        <h2 className="text-xl font-semibold text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground">{analytics.quizTitle}</p>
      </div>

      <ResultsAnalyticsNav quizId={analytics.quizId} active="analytics" />

      {!hasParticipants ? (
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No student results yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Share the join link from the quiz page — analytics will appear here once students
                start completing this quiz.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard label="Participants" value={String(overview.participants)} icon={Users} />
            <MetricCard label="Completed" value={String(overview.completed)} icon={CheckCircle2} />
            <MetricCard
              label="Completion rate"
              value={formatPercent(overview.completionRate)}
              caption="Completed ÷ participants"
              icon={TrendingUp}
            />
            <MetricCard
              label="Average score"
              value={hasScoredSessions ? formatPercent(overview.averageScore) : "—"}
              caption={hasScoredSessions ? "Completed + expired sessions" : "No completed sessions yet"}
              icon={BarChart3}
            />
          </section>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Highest score"
              value={hasScoredSessions ? formatPercent(overview.highestScore) : "—"}
              icon={TrendingUp}
            />
            <MetricCard
              label="Lowest score"
              value={hasScoredSessions ? formatPercent(overview.lowestScore) : "—"}
              icon={TrendingUp}
            />
            <MetricCard
              label="Average time"
              value={formatDuration(overview.averageCompletionSeconds)}
              caption="Completed sessions only"
              icon={Clock}
            />
            <MetricCard label="Expired" value={String(overview.expired)} icon={Clock} />
          </section>

          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <h3 className="text-sm font-semibold text-foreground">Score distribution</h3>
            {hasScoredSessions ? (
              <div className="mt-4">
                <ScoreDistributionChart distribution={distribution} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No completed sessions yet — the distribution will appear once students finish this
                quiz.
              </p>
            )}
          </div>

          {questions.length > 0 ? (
            <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <h3 className="text-sm font-semibold text-foreground">Question performance</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Success rate = correct responses ÷ total submitted sessions ({overview.scoredSessionCount}
                ) — an unanswered question never counts as incorrect.
              </p>
              <div className="mt-4">
                <QuestionPerformance questions={questions} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
