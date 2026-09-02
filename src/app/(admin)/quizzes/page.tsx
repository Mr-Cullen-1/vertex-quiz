import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ClipboardList, ListChecks, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { QUIZ_STATUS_LABEL, type QuizStatus } from "@/lib/quizzes/status";

export const metadata: Metadata = {
  title: "My Quizzes — Vertex Quiz",
};

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
