"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addQuestion, updateQuestion } from "@/lib/quizzes/question-actions";
import type { QuestionInputValues } from "@/lib/quizzes/question-schema";
import type { QuizFormat } from "@/lib/quizzes/format";

type QuestionTypeValue = QuestionInputValues["type"];

const OPTION_LABELS = ["A", "B", "C", "D"];

export type EditableQuestion = {
  id: string;
  type: QuestionTypeValue;
  questionText: string;
  options: string[];
  correctIndex: number;
};

function defaultOptionsFor(type: QuestionTypeValue): string[] {
  return type === "multiple_choice" ? ["", "", "", ""] : ["True", "False"];
}

export function QuestionEditorDialog({
  quizId,
  quizFormat,
  trigger,
  title,
  description,
  submitLabel,
  initialQuestion,
}: {
  quizId: string;
  quizFormat: QuizFormat;
  trigger: React.ReactElement;
  title: string;
  description: string;
  submitLabel: string;
  initialQuestion?: EditableQuestion;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Vocabulary Quiz is Multiple Choice only — the type picker is only shown
  // when either the quiz is Comprehension, or this question is a pre-existing
  // True/False question left over from a format switch (so the teacher has a
  // way to fix it rather than being stuck with an uneditable field).
  const canPickType = quizFormat === "comprehension" || initialQuestion?.type === "true_false";
  const [type, setType] = useState<QuestionTypeValue>(initialQuestion?.type ?? "multiple_choice");
  const [questionText, setQuestionText] = useState(initialQuestion?.questionText ?? "");
  const [options, setOptions] = useState<string[]>(
    initialQuestion?.options ?? defaultOptionsFor("multiple_choice")
  );
  const [correctIndex, setCorrectIndex] = useState(initialQuestion?.correctIndex ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function resetToInitial() {
    setType(initialQuestion?.type ?? "multiple_choice");
    setQuestionText(initialQuestion?.questionText ?? "");
    setOptions(initialQuestion?.options ?? defaultOptionsFor("multiple_choice"));
    setCorrectIndex(initialQuestion?.correctIndex ?? 0);
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) resetToInitial();
    setOpen(nextOpen);
  }

  function handleTypeChange(nextType: QuestionTypeValue) {
    setType(nextType);
    // Switching type must never carry over invalid option counts — MC
    // needs exactly 4 free-text options, TF is always exactly True/False.
    setOptions(defaultOptionsFor(nextType));
    setCorrectIndex(0);
  }

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);

    const input: QuestionInputValues = { type, questionText, options, correctIndex };
    const result = initialQuestion
      ? await updateQuestion(quizId, initialQuestion.id, input)
      : await addQuestion(quizId, input);

    setIsSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question-type">Question type</Label>
            {canPickType ? (
              <Select
                value={type}
                onValueChange={(value) => handleTypeChange(value as QuestionTypeValue)}
              >
                <SelectTrigger id="question-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                  <SelectItem value="true_false">True / False</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p id="question-type" className="text-sm text-muted-foreground">
                Multiple Choice — Vocabulary Quiz supports Multiple Choice only.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question-text">Question text</Label>
            <Textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. What process moves water from leaves to the atmosphere?"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Answers — select the correct one</Label>
            <RadioGroup
              value={String(correctIndex)}
              onValueChange={(value) => setCorrectIndex(Number(value))}
            >
              {options.map((optionText, index) =>
                type === "multiple_choice" ? (
                  <div key={index} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={String(index)}
                      aria-label={`Mark option ${OPTION_LABELS[index]} as correct`}
                    />
                    <Label htmlFor={`option-text-${index}`} className="w-5 font-normal text-muted-foreground">
                      {OPTION_LABELS[index]}
                    </Label>
                    <Input
                      id={`option-text-${index}`}
                      value={optionText}
                      onChange={(e) => {
                        const next = [...options];
                        next[index] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${OPTION_LABELS[index]}`}
                      className="flex-1"
                    />
                  </div>
                ) : (
                  <div key={index} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={String(index)}
                      id={`option-radio-${index}`}
                      aria-label={`Mark ${optionText} as correct`}
                    />
                    <Label htmlFor={`option-radio-${index}`} className="font-normal">
                      {optionText}
                    </Label>
                  </div>
                )
              )}
            </RadioGroup>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={isSaving} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
