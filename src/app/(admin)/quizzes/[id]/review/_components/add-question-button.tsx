"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizFormat } from "@/lib/quizzes/format";
import { QuestionEditorDialog } from "./question-editor-dialog";

export function AddQuestionButton({
  quizId,
  quizFormat,
}: {
  quizId: string;
  quizFormat: QuizFormat;
}) {
  return (
    <QuestionEditorDialog
      quizId={quizId}
      quizFormat={quizFormat}
      title="Add a question"
      description="This question is added to the quiz as pending — you'll still need to approve it."
      submitLabel="Add question"
      trigger={
        <Button size="sm">
          <Plus className="size-4" />
          Add question
        </Button>
      }
    />
  );
}
