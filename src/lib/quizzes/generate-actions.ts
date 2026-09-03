"use server";

import { createPartFromBase64 } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { getGeminiClient, GEMINI_MODEL, GEMINI_REQUEST_TIMEOUT_MS } from "@/lib/gemini/client";
import {
  classifyGeminiFailure,
  GEMINI_FAILURE_MESSAGE,
  GEMINI_MAX_ATTEMPTS,
  GEMINI_RETRYABLE_STATUS_CODES,
} from "@/lib/gemini/errors";
import { geminiExtractionSchema, geminiResponseJsonSchema } from "@/lib/gemini/schema";
import { buildExtractionPrompt } from "@/lib/gemini/prompt";
import { validateExtraction } from "@/lib/gemini/validate";
import { loadOwnedDraftQuiz, requireSession } from "./ownership";
import type { QuizDifficulty, QuizFormat } from "./format";
import {
  QUIZ_PDF_BUCKET,
  quizPdfStoragePath,
  validatePdfFile,
} from "./pdf";

export type UploadPdfResult = { success: true } | { success: false; error: string };
export type GenerateQuestionsResult =
  | { success: true; questionCount: number }
  | { success: false; error: string };
export type ClearQuestionsResult = { success: true } | { success: false; error: string };

type OwnedDraftQuiz = {
  id: string;
  status: string;
  format: QuizFormat;
  difficulty: QuizDifficulty;
  multiple_choice_count: number;
  true_false_count: number;
  source_pdf_path: string | null;
};

const OWNED_DRAFT_QUIZ_SELECT =
  "id, status, format, difficulty, multiple_choice_count, true_false_count, source_pdf_path";

/**
 * Uploads a PDF for a draft quiz to private Storage
 * (`{teacher_id}/{quiz_id}.pdf`, upsert — re-uploading replaces it) using
 * the authenticated, RLS-scoped client. Never the service-role client:
 * this is a normal teacher operation, and Storage RLS on `storage.objects`
 * already restricts each teacher to their own folder.
 */
export async function uploadQuizPdf(
  quizId: string,
  formData: FormData
): Promise<UploadPdfResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuiz>(
    supabase,
    quizId,
    OWNED_DRAFT_QUIZ_SELECT
  );
  if (!quiz) return { success: false, error: quizError! };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No file was selected." };
  }

  const validation = await validatePdfFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const path = quizPdfStoragePath(sub, quizId);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(QUIZ_PDF_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("PDF upload failed:", uploadError.message);
    return { success: false, error: "Failed to upload the PDF. Please try again." };
  }

  const { error: updateError } = await supabase
    .from("quizzes")
    .update({ source_pdf_path: path })
    .eq("id", quizId);

  if (updateError) {
    console.error("Failed to save PDF path:", updateError.message);
    return {
      success: false,
      error: "The PDF was uploaded, but we couldn't save it to the quiz. Please try again.",
    };
  }

  return { success: true };
}

/**
 * Runs the PDF through Gemini, validates the result, and saves it as the
 * quiz's questions in one atomic batch. Refuses outright if the quiz
 * already has questions — the MVP requires an explicit
 * `clearGeneratedQuestions()` first rather than silently
 * replacing/duplicating anything.
 */
export async function generateQuestions(quizId: string): Promise<GenerateQuestionsResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuiz>(
    supabase,
    quizId,
    OWNED_DRAFT_QUIZ_SELECT
  );
  if (!quiz) return { success: false, error: quizError! };

  if (!quiz.source_pdf_path) {
    return { success: false, error: "Upload a PDF before generating questions." };
  }

  const { count: existingCount, error: countError } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_id", quizId);

  if (countError) {
    console.error("Failed to check existing questions:", countError.message);
    return { success: false, error: "Failed to check the quiz's existing questions." };
  }
  if ((existingCount ?? 0) > 0) {
    return {
      success: false,
      error: "Questions already generated. Clear existing draft questions before generating again.",
    };
  }

  const { data: pdfBlob, error: downloadError } = await supabase.storage
    .from(QUIZ_PDF_BUCKET)
    .download(quiz.source_pdf_path);

  if (downloadError || !pdfBlob) {
    console.error("Failed to download PDF:", downloadError?.message);
    return { success: false, error: "Failed to read the uploaded PDF. Try uploading it again." };
  }

  const pdfBase64 = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");

  let responseText: string;
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        createPartFromBase64(pdfBase64, "application/pdf"),
        buildExtractionPrompt({
          format: quiz.format,
          difficulty: quiz.difficulty,
          multipleChoiceCount: quiz.multiple_choice_count,
          trueFalseCount: quiz.true_false_count,
        }),
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: geminiResponseJsonSchema,
        httpOptions: {
          timeout: GEMINI_REQUEST_TIMEOUT_MS,
          retryOptions: {
            attempts: GEMINI_MAX_ATTEMPTS,
            httpStatusCodes: GEMINI_RETRYABLE_STATUS_CODES,
          },
        },
      },
    });
    responseText = response.text ?? "";
  } catch (err) {
    console.error("Gemini request failed:", err);
    return { success: false, error: GEMINI_FAILURE_MESSAGE[classifyGeminiFailure(err)] };
  }

  if (!responseText.trim()) {
    return { success: false, error: "The AI service returned an empty response. Please try again." };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(responseText);
  } catch {
    console.error("Gemini returned invalid JSON:", responseText.slice(0, 500));
    return { success: false, error: "The AI service returned an invalid response. Please try again." };
  }

  const parsed = geminiExtractionSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error("Gemini response failed schema validation:", parsed.error.issues);
    return {
      success: false,
      error: "The AI service returned an unexpected response format. Please try again.",
    };
  }

  const validation = validateExtraction(parsed.data, {
    multipleChoiceCount: quiz.multiple_choice_count,
    trueFalseCount: quiz.true_false_count,
    format: quiz.format,
  });
  if (!validation.success) {
    return { success: false, error: validation.error };
  }

  const { data: inserted, error: rpcError } = await supabase.rpc("create_quiz_questions", {
    p_quiz_id: quizId,
    p_questions: validation.questions,
  });

  if (rpcError) {
    console.error("Failed to save generated questions:", rpcError.message);
    if (
      rpcError.message.includes("already has generated questions") ||
      rpcError.message.includes("not found or you do not have access")
    ) {
      return { success: false, error: rpcError.message };
    }
    return { success: false, error: "Failed to save the generated questions. Please try again." };
  }

  return { success: true, questionCount: inserted?.length ?? validation.questions.length };
}

/** Deletes every generated question (and, via cascade, its answers) for a draft quiz. */
export async function clearGeneratedQuestions(quizId: string): Promise<ClearQuestionsResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuiz>(
    supabase,
    quizId,
    OWNED_DRAFT_QUIZ_SELECT
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase.from("questions").delete().eq("quiz_id", quizId);
  if (error) {
    console.error("Failed to clear questions:", error.message);
    return { success: false, error: "Failed to clear the generated questions. Please try again." };
  }

  return { success: true };
}
