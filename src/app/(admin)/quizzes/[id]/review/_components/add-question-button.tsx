"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionEditorDialog } from "./question-editor-dialog";

export function AddQuestionButton({ quizId }: { quizId: string }) {
  return (
    <QuestionEditorDialog
      quizId={quizId}
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
