import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Send, Users, Percent, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { StatCard } from "../_components/stat-card";

export const metadata: Metadata = {
  title: "Dashboard — Vertex Quiz",
};

type RecentQuiz = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  total_questions: number;
  created_at: string;
};

const STATUS_LABEL: Record<RecentQuiz["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: totalQuizzes, error: totalQuizzesError },
    { count: publishedQuizzes, error: publishedQuizzesError },
    { count: participantsCount, error: participantsError },
    { data: completedSessions, error: completedSessionsError },
    { data: recentQuizzes, error: recentQuizzesError },
  ] = await Promise.all([
    supabase.from("quizzes").select("*", { count: "exact", head: true }),
    supabase
      .from("quizzes")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    supabase.from("participants").select("*", { count: "exact", head: true }),
    supabase.from("quiz_sessions").select("score").eq("status", "completed"),
    supabase
      .from("quizzes")
      .select("id, title, status, total_questions, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .overrideTypes<RecentQuiz[], { merge: false }>(),
  ]);

  assertNoError(totalQuizzesError, "Failed to load total quiz count");
  assertNoError(publishedQuizzesError, "Failed to load published quiz count");
  assertNoError(participantsError, "Failed to load participant count");
  assertNoError(completedSessionsError, "Failed to load completed sessions");
  assertNoError(recentQuizzesError, "Failed to load recent quizzes");

  const hasCompletedSessions = (completedSessions?.length ?? 0) > 0;
  const averageScore = hasCompletedSessions
    ? Math.round(
        completedSessions!.reduce((sum, s) => sum + Number(s.score ?? 0), 0) /
          completedSessions!.length
      )
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">
          Welcome back
        </h2>
        <p className="text-sm text-muted-foreground">
          Here&apos;s an overview of your quizzes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Quizzes"
          value={String(totalQuizzes ?? 0)}
          icon={ClipboardList}
        />
        <StatCard
          label="Published Quizzes"
          value={String(publishedQuizzes ?? 0)}
          icon={Send}
        />
        <StatCard
          label="Participants"
          value={String(participantsCount ?? 0)}
          icon={Users}
        />
        <StatCard
          label="Average Score"
          value={`${averageScore}%`}
          caption={hasCompletedSessions ? undefined : "No completed sessions yet"}
          icon={Percent}
        />
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Recent Quizzes
          </h3>
          {recentQuizzes && recentQuizzes.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/quizzes/new" />}
            >
              <Plus className="size-4" />
              New quiz
            </Button>
          ) : null}
        </div>

        {recentQuizzes && recentQuizzes.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {recentQuizzes.map((quiz) => (
              <li
                key={quiz.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {quiz.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quiz.total_questions} question
                    {quiz.total_questions === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant="secondary">
                  {STATUS_LABEL[quiz.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
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
        )}
      </div>
    </div>
  );
}
