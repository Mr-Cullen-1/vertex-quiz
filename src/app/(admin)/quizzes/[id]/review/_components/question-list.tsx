"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import {
  approveAllQuestions,
  approveSelectedQuestions,
  reorderQuestions,
} from "@/lib/quizzes/question-actions";
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveAllDialogOpen, setApproveAllDialogOpen] = useState(false);
  const [approveSelectedDialogOpen, setApproveSelectedDialogOpen] = useState(false);

  const pendingCount = questions.filter((q) => q.review_status === "pending").length;
  const selectedCount = selectedIds.size;
  const allSelected = questions.length > 0 && selectedCount === questions.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(questions.map((q) => q.id)) : new Set());
  }

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

  async function handleApproveSelected() {
    setIsApproving(true);
    setApproveError(null);
    setApproveSelectedDialogOpen(false);
    const result = await approveSelectedQuestions(quizId, [...selectedIds]);
    setIsApproving(false);
    if (!result.success) {
      setApproveError(result.error);
      return;
    }
    setSelectedIds(new Set());
    router.refresh();
  }

  async function handleApproveAll() {
    setIsApproving(true);
    setApproveError(null);
    setApproveAllDialogOpen(false);
    const result = await approveAllQuestions(quizId);
    setIsApproving(false);
    if (!result.success) {
      setApproveError(result.error);
      return;
    }
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all-questions"
            aria-label="Select all questions"
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={toggleSelectAll}
            disabled={isApproving}
          />
          <Label htmlFor="select-all-questions" className="font-normal text-foreground">
            Select all
          </Label>
          {selectedCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              — {selectedCount} question{selectedCount === 1 ? "" : "s"} selected
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {selectedCount === 1 ? (
            <Button type="button" size="sm" variant="outline" onClick={handleApproveSelected} disabled={isApproving}>
              <CheckCircle2 className="size-4" />
              Approve selected
            </Button>
          ) : selectedCount > 1 ? (
            <AlertDialog open={approveSelectedDialogOpen} onOpenChange={setApproveSelectedDialogOpen}>
              <AlertDialogTrigger
                render={<Button type="button" size="sm" variant="outline" disabled={isApproving} />}
              >
                <CheckCircle2 className="size-4" />
                Approve selected
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve {selectedCount} selected questions?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the {selectedCount} selected questions as approved.
                    Already-approved questions in the selection are left as they are.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApproveSelected}>
                    Approve selected
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}

          <AlertDialog open={approveAllDialogOpen} onOpenChange={setApproveAllDialogOpen}>
            <AlertDialogTrigger
              render={
                <Button type="button" size="sm" disabled={isApproving || pendingCount === 0} />
              }
            >
              {isApproving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Approve all
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve all questions?</AlertDialogTitle>
                <AlertDialogDescription>
                  All questions must be reviewed before this quiz can be ready
                  for publishing.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleApproveAll}>
                  Approve all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {approveError ? (
        <p role="alert" className="text-sm text-destructive">
          {approveError}
        </p>
      ) : null}

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
          selected={selectedIds.has(question.id)}
          onToggleSelected={() => toggleSelected(question.id)}
          onMoveUp={() => moveQuestion(index, -1)}
          onMoveDown={() => moveQuestion(index, 1)}
        />
      ))}
    </div>
  );
}
