export const QUIZ_PDF_BUCKET = "quiz-pdfs";

/**
 * 8 MB — a sensible MVP ceiling for the standardized, mostly-text
 * educational PDFs this pipeline targets. Kept in sync with:
 *   - the bucket's `file_size_limit` (supabase/migrations/..._quiz_pdfs_storage.sql)
 *   - `experimental.serverActions.bodySizeLimit` in next.config.ts
 * If this changes, update both.
 */
export const MAX_PDF_SIZE_BYTES = 8 * 1024 * 1024;

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

export function quizPdfStoragePath(teacherId: string, quizId: string): string {
  return `${teacherId}/${quizId}.pdf`;
}

export type PdfValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates an uploaded file is a real, non-empty, reasonably-sized PDF.
 * Checks the actual leading bytes (`%PDF`) rather than trusting the
 * browser-reported MIME type alone, since that's client-supplied and easy
 * to get wrong or spoof — the bucket's `allowed_mime_types` is a second,
 * independent backstop at the storage layer.
 */
export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  if (file.size === 0) {
    return { valid: false, error: "The selected file is empty." };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      error: `PDF is too large — the maximum size is ${Math.floor(MAX_PDF_SIZE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  if (file.type && file.type !== "application/pdf") {
    return { valid: false, error: "Only PDF files are supported." };
  }

  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const looksLikePdf = PDF_MAGIC_BYTES.every((byte, i) => head[i] === byte);
  if (!looksLikePdf) {
    return { valid: false, error: "This file doesn't look like a valid PDF." };
  }

  return { valid: true };
}
