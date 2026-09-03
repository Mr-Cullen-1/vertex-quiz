"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { QuizFormState } from "@/lib/quizzes/actions";
import {
  ALLOWED_DIFFICULTIES,
  QUIZ_FORMATS,
  QUIZ_FORMAT_LABEL,
  isDifficultyAllowed,
  type QuizDifficulty,
  type QuizFormat,
} from "@/lib/quizzes/format";

const initialState: QuizFormState = { error: null };

const FORMAT_DESCRIPTION: Record<QuizFormat, string> = {
  comprehension: "Multiple Choice + True/False, testing understanding of the PDF's content.",
  vocabulary: "Multiple Choice only, testing vocabulary drawn from the PDF.",
};

/** `2026-09-01T14:30:00+00:00` → `2026-09-01T14:30` for a datetime-local input. */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function QuizForm({
  action,
  submitLabel,
  pendingLabel,
  cancelHref,
  defaultValues,
}: {
  action: (prevState: QuizFormState, formData: FormData) => Promise<QuizFormState>;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  defaultValues?: {
    title?: string;
    description?: string | null;
    format?: QuizFormat;
    difficulty?: QuizDifficulty;
    multipleChoiceCount?: number;
    trueFalseCount?: number;
    durationMinutes?: number | null;
    deadline?: string | null;
  };
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [format, setFormat] = useState<QuizFormat>(defaultValues?.format ?? "comprehension");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(defaultValues?.difficulty ?? "B1");
  const [mcCount, setMcCount] = useState(defaultValues?.multipleChoiceCount ?? 0);
  const [tfCount, setTfCount] = useState(defaultValues?.trueFalseCount ?? 0);
  const isVocabulary = format === "vocabulary";
  const total = mcCount + (isVocabulary ? 0 : tfCount);

  function handleFormatChange(nextFormat: QuizFormat) {
    setFormat(nextFormat);
    if (!isDifficultyAllowed(nextFormat, difficulty)) {
      setDifficulty(ALLOWED_DIFFICULTIES[nextFormat][0]);
    }
    if (nextFormat === "vocabulary") {
      setTfCount(0);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={defaultValues?.title}
          placeholder="e.g. Chapter 4 — Cell Biology"
          maxLength={200}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          placeholder="What this quiz covers, for your own reference."
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Quiz format</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUIZ_FORMATS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              onClick={() => handleFormatChange(value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
                format === value
                  ? "border-accent bg-accent/10"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              <span className="text-sm font-medium text-foreground">
                {QUIZ_FORMAT_LABEL[value]}
              </span>
              <span className="text-xs text-muted-foreground">{FORMAT_DESCRIPTION[value]}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="format" value={format} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Difficulty (CEFR)</Label>
        <div className="flex flex-wrap gap-2">
          {ALLOWED_DIFFICULTIES[format].map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={difficulty === level}
              onClick={() => setDifficulty(level)}
              className={cn(
                "rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors",
                difficulty === level
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {level}
            </button>
          ))}
        </div>
        <input type="hidden" name="difficulty" value={difficulty} />
      </div>

      <div className={cn("grid grid-cols-1 gap-4", !isVocabulary && "sm:grid-cols-2")}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="multipleChoiceCount">Multiple Choice questions</Label>
          <Input
            id="multipleChoiceCount"
            name="multipleChoiceCount"
            type="number"
            min={0}
            inputMode="numeric"
            value={mcCount}
            onChange={(e) => setMcCount(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
        {isVocabulary ? (
          <input type="hidden" name="trueFalseCount" value={0} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trueFalseCount">True/False questions</Label>
            <Input
              id="trueFalseCount"
              name="trueFalseCount"
              type="number"
              min={0}
              inputMode="numeric"
              value={tfCount}
              onChange={(e) => setTfCount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
        <span className="text-sm font-medium text-foreground">Total questions</span>
        <span className="text-lg font-semibold text-foreground">{total}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="durationMinutes">Time limit in minutes (optional)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={1}
            max={480}
            inputMode="numeric"
            defaultValue={defaultValues?.durationMinutes ?? ""}
            placeholder="e.g. 30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deadline">Deadline (optional)</Label>
          <Input
            id="deadline"
            name="deadline"
            type="datetime-local"
            defaultValue={toDatetimeLocalValue(defaultValues?.deadline)}
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          nativeButton={false}
          render={<Link href={cancelHref} />}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
