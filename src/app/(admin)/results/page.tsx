import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";

export const metadata: Metadata = {
  title: "Results — Vertex Quiz",
};

type Quiz = { id: string; title: string; status: "draft" | "published" | "closed" };

const STATUS_LABEL: Record<Quiz["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
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
    .select("id, title, status")
    .order("created_at", { ascending: false })
    .overrideTypes<Quiz[], { merge: false }>();

  assertNoError(quizzesError, "Failed to load quizzes");

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const sessionCountByQuiz = new Map<string, number>();
  if (quizIds.length > 0) {
    const { data: sessions, error: sessionsError } = await supabase
      .from("quiz_sessions")
      .select("quiz_id")
      .in("quiz_id", quizIds);
    assertNoError(sessionsError, "Failed to load results");
    for (const session of sessions ?? []) {
      sessionCountByQuiz.set(session.quiz_id, (sessionCountByQuiz.get(session.quiz_id) ?? 0) + 1);
    }
  }

  const quizzesWithResults = (quizzes ?? []).filter((q) => (sessionCountByQuiz.get(q.id) ?? 0) > 0);
  const hasResults = quizzesWithResults.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
        <p className="text-sm text-muted-foreground">
          Participant results across every quiz you&apos;ve published.
        </p>
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        {hasResults ? (
          <ul className="flex flex-col divide-y divide-border">
            {quizzesWithResults.map((quiz) => (
              <li key={quiz.id}>
                <Link
                  href={`/quizzes/${quiz.id}/results`}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{quiz.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {sessionCountByQuiz.get(quiz.id)} session
                      {sessionCountByQuiz.get(quiz.id) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {STATUS_LABEL[quiz.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No results yet
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Once you publish a quiz and students complete it, their
                results will show up here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
