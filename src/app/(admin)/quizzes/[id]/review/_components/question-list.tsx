"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reorderQuestions } from "@/lib/quizzes/question-actions";
import { QuestionCard } from "./question-card";

export type QuestionWithAnswers = {
  id: string;
  type: "multiple_choice" | "true_false";
  question_text: string;
  order_index: number;
  review_status: "pending" | "approved";
  answers: {
    id: string;
    answer_text: string;
    is_correct: boolean;
    order_index: number;
  }[];
};

export function QuestionList({
  quizId,
  questions,
}: {
  quizId: string;
  questions: QuestionWithAnswers[];
}) {
  const router = useRouter();
  const [movingQuestionId, setMovingQuestionId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  async function moveQuestion(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const reordered = [...questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setMovingQuestionId(questions[index].id);
    setReorderError(null);
    const result = await reorderQuestions(quizId, reordered.map((q) => q.id));
    setMovingQuestionId(null);

    if (!result.success) {
      setReorderError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {reorderError ? (
        <p role="alert" className="text-sm text-destructive">
          {reorderError}
        </p>
      ) : null}

      {questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          quizId={quizId}
          question={question}
          position={index + 1}
          isFirst={index === 0}
          isLast={index === questions.length - 1}
          reorderPending={movingQuestionId === question.id}
          onMoveUp={() => moveQuestion(index, -1)}
          onMoveDown={() => moveQuestion(index, 1)}
        />
      ))}
    </div>
  );
}
