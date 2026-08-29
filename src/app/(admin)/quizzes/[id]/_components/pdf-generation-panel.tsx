"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  FileText,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  clearGeneratedQuestions,
  generateQuestions,
  uploadQuizPdf,
} from "@/lib/quizzes/generate-actions";
import { MAX_PDF_SIZE_BYTES } from "@/lib/quizzes/pdf";

type Stage =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "uploading" }
  | { kind: "processing" }
  | { kind: "success"; count: number }
  | { kind: "error"; message: string; canRetryGenerate: boolean };

const MAX_PDF_LABEL = `${Math.floor(MAX_PDF_SIZE_BYTES / (1024 * 1024))} MB`;

export function PdfGenerationPanel({
  quizId,
  multipleChoiceCount,
  trueFalseCount,
  hasSourcePdf,
  existingQuestionCount,
}: {
  quizId: string;
  multipleChoiceCount: number;
  trueFalseCount: number;
  hasSourcePdf: boolean;
  existingQuestionCount: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [clearError, setClearError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const totalQuestions = multipleChoiceCount + trueFalseCount;
  const busy = stage.kind === "uploading" || stage.kind === "processing";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setStage({
        kind: "error",
        message: `PDF is too large — the maximum size is ${MAX_PDF_LABEL}.`,
        canRetryGenerate: false,
      });
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      setStage({
        kind: "error",
        message: "Only PDF files are supported.",
        canRetryGenerate: false,
      });
      return;
    }

    setStage({ kind: "selected", file });
  }

  async function runGenerate() {
    setStage({ kind: "processing" });
    const result = await generateQuestions(quizId);
    if (!result.success) {
      setStage({ kind: "error", message: result.error, canRetryGenerate: true });
      return;
    }
    setStage({ kind: "success", count: result.questionCount });
    router.refresh();
  }

  async function handleUploadAndGenerate() {
    if (stage.kind !== "selected") return;
    const { file } = stage;

    setStage({ kind: "uploading" });
    const formData = new FormData();
    formData.set("file", file);
    const uploadResult = await uploadQuizPdf(quizId, formData);

    if (!uploadResult.success) {
      setStage({ kind: "error", message: uploadResult.error, canRetryGenerate: false });
      return;
    }

    await runGenerate();
  }

  async function handleClear() {
    setIsClearing(true);
    setClearError(null);
    setClearDialogOpen(false);
    const result = await clearGeneratedQuestions(quizId);
    setIsClearing(false);
    if (!result.success) {
      setClearError(result.error);
      return;
    }
    setStage({ kind: "idle" });
    router.refresh();
  }

  // Questions already exist: show a summary + the only available action
  // (clear), per the MVP's "explicit clear before regenerating" rule.
  if (existingQuestionCount > 0) {
    return (
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
              <ClipboardList className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {existingQuestionCount} question
                {existingQuestionCount === 1 ? "" : "s"} generated
              </p>
              <p className="text-sm text-muted-foreground">
                {multipleChoiceCount} Multiple Choice · {trueFalseCount} True/False
              </p>
            </div>
          </div>

          <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
            <AlertDialogTrigger
              render={<Button variant="outline" size="sm" disabled={isClearing} />}
            >
              <Trash2 className="size-4" />
              Clear generated questions
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear generated questions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes all {existingQuestionCount} generated questions and
                  their answers. The uploaded PDF stays, so you can generate again
                  right after.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="w-full"
                  onClick={handleClear}
                >
                  Clear questions
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {clearError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {clearError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          Generate questions from a PDF
        </h3>
        <p className="text-sm text-muted-foreground">
          Upload the source PDF and Vertex Quiz will draft {totalQuestions}{" "}
          question{totalQuestions === 1 ? "" : "s"} ({multipleChoiceCount}{" "}
          Multiple Choice, {trueFalseCount} True/False) for you to review
          later.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={busy}
      />

      {stage.kind === "idle" && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <FileUp className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {hasSourcePdf ? "Upload a different PDF" : "No PDF uploaded yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              PDF only, up to {MAX_PDF_LABEL}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose PDF
            </Button>
            {hasSourcePdf ? (
              <Button size="sm" onClick={runGenerate}>
                <Sparkles className="size-4" />
                Generate questions
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {stage.kind === "selected" && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-8 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted">
            <FileText className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{stage.file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(stage.file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStage({ kind: "idle" });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Choose a different file
            </Button>
            <Button size="sm" onClick={handleUploadAndGenerate}>
              <Sparkles className="size-4" />
              Upload &amp; generate
            </Button>
          </div>
        </div>
      )}

      {stage.kind === "uploading" && (
        <StatusMessage icon={<Loader2 className="size-5 animate-spin" />}>
          Uploading PDF…
        </StatusMessage>
      )}

      {stage.kind === "processing" && (
        <StatusMessage icon={<Loader2 className="size-5 animate-spin" />}>
          Analyzing your PDF and generating {totalQuestions} question
          {totalQuestions === 1 ? "" : "s"}…
        </StatusMessage>
      )}

      {stage.kind === "success" && (
        <StatusMessage icon={<CheckCircle2 className="size-5 text-success" />}>
          Generated {stage.count} question{stage.count === 1 ? "" : "s"}.
        </StatusMessage>
      )}

      {stage.kind === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 py-8 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="size-5" />
          </div>
          <p role="alert" className="max-w-sm text-sm font-medium text-foreground">
            {stage.message}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStage({ kind: "idle" });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Choose a different file
            </Button>
            {stage.canRetryGenerate ? (
              <Button size="sm" onClick={runGenerate}>
                <Sparkles className="size-4" />
                Try again
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusMessage({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-10 text-center">
      {icon}
      <p className="max-w-sm text-sm font-medium text-foreground">{children}</p>
    </div>
  );
}
