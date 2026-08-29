import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { QuestionList, type QuestionWithAnswers } from "./_components/question-list";
import { AddQuestionButton } from "./_components/add-question-button";

type QuizSummary = {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
};

export async function generateMetadata(
  props: PageProps<"/quizzes/[id]/review">
): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title")
    .eq("id", id)
    .maybeSingle();

  return {
    title: quiz ? `Review — ${quiz.title} — Vertex Quiz` : "Review — Vertex Quiz",
  };
}

export default async function QuestionReviewPage(
  props: PageProps<"/quizzes/[id]/review">
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<QuizSummary, { merge: false }>();

  assertNoError(error, "Failed to load quiz");

  // RLS makes another teacher's quiz indistinguishable from a quiz that
  // doesn't exist — both come back as no row, which is the correct
  // behavior (never reveal that a quiz id belongs to someone else).
  if (!quiz) {
    notFound();
  }

  // Review/edit is only meaningful pre-publish; once a quiz leaves draft
  // its question set is frozen for students already mid-session.
  if (quiz.status !== "draft") {
    redirect(`/quizzes/${quiz.id}`);
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, type, question_text, order_index, review_status, answers(id, answer_text, is_correct, order_index)"
    )
    .eq("quiz_id", quiz.id)
    .order("order_index")
    .order("order_index", { referencedTable: "answers" })
    .overrideTypes<QuestionWithAnswers[], { merge: false }>();

  assertNoError(questionsError, "Failed to load questions");

  const items = questions ?? [];
  const reviewedCount = items.filter((q) => q.review_status === "approved").length;
  const readyForPublishing = items.length > 0 && reviewedCount === items.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/quizzes/${quiz.id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to quiz
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{quiz.title}</h2>
            <p className="text-sm text-muted-foreground">
              {items.length} question{items.length === 1 ? "" : "s"} ·{" "}
              {reviewedCount} / {items.length} reviewed
            </p>
          </div>

          <AddQuestionButton quizId={quiz.id} />
        </div>

        {readyForPublishing ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success">
            <CheckCircle2 className="size-4.5 shrink-0" />
            Ready for publishing — every question has been reviewed and
            approved. Publishing itself arrives in a later phase.
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">No questions yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate questions from a PDF on the quiz page, or add one
            manually to get started.
          </p>
        </div>
      ) : (
        <QuestionList quizId={quiz.id} questions={items} />
      )}
    </div>
  );
}
