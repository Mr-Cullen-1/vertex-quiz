"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteQuestion, setQuestionReviewStatus } from "@/lib/quizzes/question-actions";
import { QuestionEditorDialog } from "./question-editor-dialog";
import type { QuestionWithAnswers } from "./question-list";

const TYPE_LABEL: Record<QuestionWithAnswers["type"], string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
};

const OPTION_LABELS = ["A", "B", "C", "D"];

export function QuestionCard({
  quizId,
  question,
  position,
  isFirst,
  isLast,
  reorderPending,
  selected,
  onToggleSelected,
  onMoveUp,
  onMoveDown,
}: {
  quizId: string;
  question: QuestionWithAnswers;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  reorderPending: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const router = useRouter();
  const [isTogglingApproval, setIsTogglingApproval] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const approved = question.review_status === "approved";
  const sortedAnswers = [...question.answers].sort((a, b) => a.order_index - b.order_index);

  async function handleToggleApproval() {
    setIsTogglingApproval(true);
    setActionError(null);
    const result = await setQuestionReviewStatus(quizId, question.id, !approved);
    setIsTogglingApproval(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setIsDeleting(true);
    setActionError(null);
    setDeleteDialogOpen(false);
    const result = await deleteQuestion(quizId, question.id);
    setIsDeleting(false);
    if (!result.success) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  const editableQuestion = {
    id: question.id,
    type: question.type,
    questionText: question.question_text,
    options: sortedAnswers.map((a) => a.answer_text),
    correctIndex: sortedAnswers.findIndex((a) => a.is_correct),
  };

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Checkbox
            className="mt-1"
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select question ${position}`}
          />

          <div className="flex flex-col items-center pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={isFirst || reorderPending}
              onClick={onMoveUp}
              aria-label="Move question up"
            >
              <ChevronUp className="size-4" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground">{position}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={isLast || reorderPending}
              onClick={onMoveDown}
              aria-label="Move question down"
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary">{TYPE_LABEL[question.type]}</Badge>
              {approved ? (
                <Badge className="bg-success/10 text-success">Approved</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Pending review
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">{question.question_text}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <QuestionEditorDialog
            quizId={quizId}
            title="Edit question"
            description="Editing marks this question pending again — it'll need re-approval."
            submitLabel="Save changes"
            initialQuestion={editableQuestion}
            trigger={
              <Button type="button" variant="outline" size="icon-sm" aria-label="Edit question">
                <Pencil className="size-4" />
              </Button>
            }
          />

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={isDeleting}
                  aria-label="Delete question"
                />
              }
            >
              <Trash2 className="size-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this question?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes question {position} and its answers.
                  This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" className="w-full" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sortedAnswers.map((answer, index) => (
          <div
            key={answer.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              answer.is_correct
                ? "border-success/30 bg-success/5 text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {answer.is_correct ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className="size-4 shrink-0 text-muted-foreground/40" />
            )}
            {question.type === "multiple_choice" ? (
              <span className="font-medium text-foreground">{OPTION_LABELS[index]}.</span>
            ) : null}
            <span>{answer.answer_text}</span>
          </div>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant={approved ? "outline" : "default"}
          onClick={handleToggleApproval}
          disabled={isTogglingApproval}
        >
          {isTogglingApproval ? (
            <Loader2 className="size-4 animate-spin" />
          ) : approved ? (
            "Mark as pending"
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              Approve
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
