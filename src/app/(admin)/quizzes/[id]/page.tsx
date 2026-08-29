import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { DeleteQuizButton } from "./_components/delete-quiz-button";
import { PdfGenerationPanel } from "./_components/pdf-generation-panel";

type QuizDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "closed";
  multiple_choice_count: number;
  true_false_count: number;
  total_questions: number;
  duration_minutes: number | null;
  ends_at: string | null;
  created_at: string;
  source_pdf_path: string | null;
};

const STATUS_LABEL: Record<QuizDetail["status"], string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata(
  props: PageProps<"/quizzes/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return { title: quiz ? `${quiz.title} — Vertex Quiz` : "Quiz — Vertex Quiz" };
}

export default async function QuizDetailPage(
  props: PageProps<"/quizzes/[id]">
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select(
      "id, title, description, status, multiple_choice_count, true_false_count, total_questions, duration_minutes, ends_at, created_at, source_pdf_path"
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<QuizDetail, { merge: false }>();

  assertNoError(error, "Failed to load quiz");

  // RLS makes another teacher's quiz indistinguishable from a quiz that
  // doesn't exist — both come back as no row, which is the correct
  // behavior (never reveal that a quiz id belongs to someone else).
  if (!quiz) {
    notFound();
  }

  const isDraft = quiz.status === "draft";

  const { count: questionCount, error: questionCountError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_id", quiz.id);

  assertNoError(questionCountError, "Failed to load question count");

  const { count: reviewedCount, error: reviewedCountError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_id", quiz.id)
    .eq("review_status", "approved");

  assertNoError(reviewedCountError, "Failed to load review progress");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">
              {quiz.title}
            </h2>
            <Badge variant="secondary">{STATUS_LABEL[quiz.status]}</Badge>
          </div>
          {quiz.description ? (
            <p className="max-w-xl text-sm text-muted-foreground">
              {quiz.description}
            </p>
          ) : null}
        </div>

        {isDraft ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/quizzes/${quiz.id}/edit`} />}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <DeleteQuizButton quizId={quiz.id} quizTitle={quiz.title} />
          </div>
        ) : null}
      </div>

      <div className="max-w-2xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Multiple Choice</dt>
            <dd className="text-sm font-medium text-foreground">
              {quiz.multiple_choice_count}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">True/False</dt>
            <dd className="text-sm font-medium text-foreground">
              {quiz.true_false_count}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Total questions</dt>
            <dd className="text-sm font-medium text-foreground">
              {quiz.total_questions}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Time limit</dt>
            <dd className="text-sm font-medium text-foreground">
              {quiz.duration_minutes
                ? `${quiz.duration_minutes} minutes`
                : "No time limit"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Deadline</dt>
            <dd className="text-sm font-medium text-foreground">
              {quiz.ends_at ? formatDateTime(quiz.ends_at) : "No deadline set"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Created</dt>
            <dd className="text-sm font-medium text-foreground">
              {formatDateTime(quiz.created_at)}
            </dd>
          </div>
        </dl>
      </div>

      {isDraft ? (
        <PdfGenerationPanel
          quizId={quiz.id}
          multipleChoiceCount={quiz.multiple_choice_count}
          trueFalseCount={quiz.true_false_count}
          hasSourcePdf={Boolean(quiz.source_pdf_path)}
          existingQuestionCount={questionCount ?? 0}
        />
      ) : null}

      {isDraft ? (
        <div className="flex flex-col gap-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Question review</h3>
            <p className="text-sm text-muted-foreground">
              {(questionCount ?? 0) === 0
                ? "No questions yet — generate them from a PDF above, or add one manually."
                : `${questionCount} question${questionCount === 1 ? "" : "s"} · ${reviewedCount ?? 0} / ${questionCount} reviewed`}
            </p>
          </div>
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/quizzes/${quiz.id}/review`} />}
          >
            <ClipboardList className="size-4" />
            Review questions
          </Button>
        </div>
      ) : null}

      {isDraft ? (
        <p className="text-sm text-muted-foreground">
          Publishing arrives in a later phase — for now this quiz stays a
          draft you can keep editing.
        </p>
      ) : null}
    </div>
  );
}
