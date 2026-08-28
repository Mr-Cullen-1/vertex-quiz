import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { updateQuiz } from "@/lib/quizzes/actions";
import { QuizForm } from "../../_components/quiz-form";

export const metadata: Metadata = {
  title: "Edit Quiz — Vertex Quiz",
};

type EditableQuiz = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "closed";
  multiple_choice_count: number;
  true_false_count: number;
  duration_minutes: number | null;
  ends_at: string | null;
};

export default async function EditQuizPage(
  props: PageProps<"/quizzes/[id]/edit">
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select(
      "id, title, description, status, multiple_choice_count, true_false_count, duration_minutes, ends_at"
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<EditableQuiz, { merge: false }>();

  assertNoError(error, "Failed to load quiz");

  if (!quiz) {
    notFound();
  }

  if (quiz.status !== "draft") {
    redirect(`/quizzes/${quiz.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Edit quiz</h2>
        <p className="text-sm text-muted-foreground">{quiz.title}</p>
      </div>

      <div className="max-w-2xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <QuizForm
          action={updateQuiz.bind(null, quiz.id)}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          cancelHref={`/quizzes/${quiz.id}`}
          defaultValues={{
            title: quiz.title,
            description: quiz.description,
            multipleChoiceCount: quiz.multiple_choice_count,
            trueFalseCount: quiz.true_false_count,
            durationMinutes: quiz.duration_minutes,
            deadline: quiz.ends_at,
          }}
        />
      </div>
    </div>
  );
}
