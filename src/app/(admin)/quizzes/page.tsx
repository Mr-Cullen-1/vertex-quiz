import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  ClipboardList,
  ListChecks,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { QUIZ_STATUS_LABEL, type QuizStatus } from "@/lib/quizzes/status";
import { computeSessionOverview } from "@/lib/quizzes/session-overview";
import { StatCard } from "../_components/stat-card";
import { HorizontalBarChart, type BarChartDatum } from "../_components/horizontal-bar-chart";

export const metadata: Metadata = {
  title: "My Quizzes — Vertex Quiz",
};

/** Quizzes counted as "Active" in the activity overview — a quiz has real activity to summarize once it's ever gone live. */
const ACTIVE_STATUSES: QuizStatus[] = ["published", "closed"];

/** Caps the "Sessions by quiz" chart so a teacher with many quizzes still gets readable bars/labels. */
const MAX_CHART_ROWS = 8;

type Quiz = {
  id: string;
  title: string;
  status: QuizStatus;
  multiple_choice_count: number;
  true_false_count: number;
  total_questions: number;
  ends_at: string | null;
  created_at: string;
};

// Restrained, distinguishable-but-not-colorful per status — text always
// carries the actual meaning, color is a secondary cue only.
const STATUS_BADGE_CLASS: Record<Quiz["status"], string> = {
  draft: "border-border bg-transparent text-muted-foreground",
  published: "border-accent/25 bg-accent/10 text-accent",
  closed: "border-transparent bg-muted text-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function QuizzesPage() {
  const supabase = await createClient();
  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select(
      "id, title, status, multiple_choice_count, true_false_count, total_questions, ends_at, created_at"
    )
    .order("created_at", { ascending: false })
    .overrideTypes<Quiz[], { merge: false }>();

  assertNoError(error, "Failed to load quizzes");

  const hasQuizzes = (quizzes?.length ?? 0) > 0;

  // "Quick activity overview" summarizes activity on quizzes that have
  // ever gone live — a draft has no sessions to summarize. One extra query
  // for every such quiz's sessions at once (never one query per quiz),
  // reusing the exact same session/participant definitions as the
  // dedicated Analytics page via `computeSessionOverview`.
  const activeQuizzes = (quizzes ?? []).filter((q) => ACTIVE_STATUSES.includes(q.status));
  const activeQuizIds = activeQuizzes.map((q) => q.id);

  let sessionRows: { quiz_id: string; status: string; score: number | null }[] = [];
  if (activeQuizIds.length > 0) {
    const { data, error: sessionsError } = await supabase
      .from("quiz_sessions")
      .select("quiz_id, status, score")
      .in("quiz_id", activeQuizIds);
    assertNoError(sessionsError, "Failed to load quiz activity");
    sessionRows = data ?? [];
  }

  const overview = computeSessionOverview(sessionRows);

  const sessionCountByQuiz = new Map<string, number>();
  for (const row of sessionRows) {
    sessionCountByQuiz.set(row.quiz_id, (sessionCountByQuiz.get(row.quiz_id) ?? 0) + 1);
  }
  const chartData: BarChartDatum[] = activeQuizzes
    .map((q) => ({ label: q.title, value: sessionCountByQuiz.get(q.id) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_CHART_ROWS);
  const hiddenChartRows = activeQuizzes.length - chartData.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            My Quizzes
          </h2>
          <p className="text-sm text-muted-foreground">
            Every quiz you&apos;ve created, in one place.
          </p>
        </div>
        {hasQuizzes ? (
          <Button nativeButton={false} render={<Link href="/quizzes/new" />}>
            <Plus className="size-4" />
            New quiz
          </Button>
        ) : null}
      </div>

      {hasQuizzes ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-foreground">Quick activity overview</h3>

          {/*
            Deliberately activity/management metrics only — no "Avg. score"
            here, that's a performance metric and belongs on Results (see
            src/app/(admin)/results/page.tsx) so the two pages don't end up
            showing the same four tiles. "Quizzes" is the full inventory
            (every status, matching the card list below); "Active quizzes"
            is the published/closed subset that can actually have sessions.
          */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Quizzes" value={String(quizzes?.length ?? 0)} icon={ListChecks} />
            <StatCard label="Active quizzes" value={String(activeQuizzes.length)} icon={Send} />
            <StatCard label="Sessions" value={String(overview.sessions)} icon={Activity} />
            <StatCard label="Participants" value={String(overview.sessions)} icon={Users} />
          </div>

          {chartData.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <h4 className="mb-4 text-sm font-medium text-foreground">Sessions by quiz</h4>
              <HorizontalBarChart data={chartData} />
              {hiddenChartRows > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the top {MAX_CHART_ROWS} of {activeQuizzes.length} quizzes by sessions.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-sm font-medium text-foreground">No activity yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Publish a quiz and invite students to see results here.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {hasQuizzes ? (
        <ul className="flex flex-col gap-3 sm:gap-4">
          {quizzes!.map((quiz) => (
            <li
              key={quiz.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent sm:size-11">
                    <ListChecks className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-base font-semibold text-balance text-foreground">
                      {quiz.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {quiz.total_questions} question
                      {quiz.total_questions === 1 ? "" : "s"} ·{" "}
                      {quiz.multiple_choice_count} Multiple Choice ·{" "}
                      {quiz.true_false_count} True/False
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(quiz.created_at)}
                      {quiz.ends_at
                        ? ` · Due ${formatDate(quiz.ends_at)}`
                        : ""}
                      {sessionCountByQuiz.has(quiz.id)
                        ? ` · ${sessionCountByQuiz.get(quiz.id)} session${sessionCountByQuiz.get(quiz.id) === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                </div>

                {/*
                  The card itself carries no navigation at all — only this
                  "Open quiz" link does. Grouping it with the status badge in
                  one right-aligned stack (instead of the badge sitting in
                  the header row and the button spanning its own full row
                  below) is what keeps a short quiz's card short: the card's
                  height comes from whichever side (text block vs. this
                  stack) is naturally taller, not from an extra fixed row.
                */}
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Badge
                    variant="outline"
                    className={cn("h-6 shrink-0 gap-1 px-2.5", STATUS_BADGE_CLASS[quiz.status])}
                  >
                    {quiz.status === "published" ? <Check className="size-3" /> : null}
                    {QUIZ_STATUS_LABEL[quiz.status]}
                  </Badge>
                  <Link
                    href={`/quizzes/${quiz.id}`}
                    className={cn(buttonVariants({ size: "default" }), "h-11 w-full sm:w-auto")}
                  >
                    Open quiz
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No quizzes yet
              </p>
              <p className="text-sm text-muted-foreground">
                Upload a PDF and let Vertex Quiz draft your first quiz.
              </p>
            </div>
            <Button
              className="mt-1"
              nativeButton={false}
              render={<Link href="/quizzes/new" />}
            >
              <Plus className="size-4" />
              Create your first quiz
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
