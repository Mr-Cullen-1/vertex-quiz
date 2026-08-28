import type { Metadata } from "next";
import { createQuiz } from "@/lib/quizzes/actions";
import { QuizForm } from "../_components/quiz-form";

export const metadata: Metadata = {
  title: "Create Quiz — Vertex Quiz",
};

export default function NewQuizPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Create a quiz
        </h2>
        <p className="text-sm text-muted-foreground">
          Set up the question structure. You&apos;ll add the actual
          questions in a later step.
        </p>
      </div>

      <div className="max-w-2xl rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <QuizForm
          action={createQuiz}
          submitLabel="Create draft"
          pendingLabel="Creating…"
          cancelHref="/quizzes"
        />
      </div>
    </div>
  );
}
