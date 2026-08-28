import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";

export const metadata: Metadata = {
  title: "My Quizzes — Vertex Quiz",
};

type Quiz = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  total_questions: number;
  created_at: string;
};

const STATUS_LABEL: Record<Quiz["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

export default async function QuizzesPage() {
  const supabase = await createClient();
  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select("id, title, status, total_questions, created_at")
    .order("created_at", { ascending: false })
    .overrideTypes<Quiz[], { merge: false }>();

  assertNoError(error, "Failed to load quizzes");

  const hasQuizzes = (quizzes?.length ?? 0) > 0;

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

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        {hasQuizzes ? (
          <ul className="flex flex-col divide-y divide-border">
            {quizzes!.map((quiz) => (
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
                <Badge variant="secondary">{STATUS_LABEL[quiz.status]}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
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
