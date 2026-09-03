"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { quizFormSchema } from "./schema";

export type QuizFormState = {
  error: string | null;
};

function parseQuizForm(formData: FormData) {
  return quizFormSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    format: formData.get("format"),
    difficulty: formData.get("difficulty"),
    multipleChoiceCount: formData.get("multipleChoiceCount"),
    trueFalseCount: formData.get("trueFalseCount"),
    durationMinutes: formData.get("durationMinutes"),
    deadline: formData.get("deadline"),
  });
}

/**
 * Maps a raw Supabase error to a teacher-friendly message. Always logs the
 * raw message server-side first — swallowing it entirely (as this used to
 * do) turns every unrecognized failure into an undiagnosable "something
 * went wrong", which is exactly the silent-failure pattern the rest of
 * this app's data-loading code (`assertNoError`) exists to avoid.
 */
function friendlyDbError(message: string): string {
  console.error("Quiz save failed:", message);
  if (message.includes("quizzes_question_counts_match")) {
    return "Total questions must equal Multiple Choice + True/False.";
  }
  if (message.includes("quizzes_vocabulary_no_true_false")) {
    return "Vocabulary Quiz doesn't support True/False questions.";
  }
  if (message.includes("quizzes_format_difficulty_valid")) {
    return "This difficulty isn't available for the selected quiz format.";
  }
  if (message.includes("quizzes_teacher_id_fkey")) {
    // A JWT can still pass local verification (getClaims()) for a few
    // minutes after the underlying auth.users row is gone — e.g. a
    // deleted/rotated test account whose session cookie is still cached in
    // the browser. The insert then fails this foreign key instead of the
    // auth check, which otherwise looks like an opaque server error.
    return "We couldn't verify your account. Please sign out and sign in again.";
  }
  return "Something went wrong saving the quiz. Please try again.";
}

/**
 * Creates a new draft quiz owned by the signed-in teacher. `teacher_id` is
 * always taken from the verified session (`getClaims()`), never from the
 * form — Row Level Security's `quizzes_insert_own` policy would reject a
 * mismatched value anyway, but the form never offers one in the first
 * place.
 */
export async function createQuiz(
  _prevState: QuizFormState,
  formData: FormData
): Promise<QuizFormState> {
  const parsed = parseQuizForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  if (authError || !authData?.claims) {
    return { error: "Your session has expired. Please sign in again." };
  }

  const {
    title,
    description,
    format,
    difficulty,
    multipleChoiceCount,
    trueFalseCount,
    durationMinutes,
    deadline,
  } = parsed.data;

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      teacher_id: authData.claims.sub,
      title,
      description: description ?? null,
      format,
      difficulty,
      multiple_choice_count: multipleChoiceCount,
      true_false_count: trueFalseCount,
      total_questions: multipleChoiceCount + trueFalseCount,
      duration_minutes: durationMinutes ?? null,
      ends_at: deadline ? new Date(deadline).toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !quiz) {
    return { error: friendlyDbError(error?.message ?? "") };
  }

  redirect(`/quizzes/${quiz.id}`);
}

/**
 * Updates a draft quiz's metadata. Refuses to edit a quiz that isn't
 * `draft` or that RLS won't let the caller see (another teacher's quiz —
 * which, thanks to `quizzes_select_own`, is indistinguishable from a quiz
 * that doesn't exist).
 */
export async function updateQuiz(
  quizId: string,
  _prevState: QuizFormState,
  formData: FormData
): Promise<QuizFormState> {
  const parsed = parseQuizForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("quizzes")
    .select("status")
    .eq("id", quizId)
    .maybeSingle();

  if (fetchError) {
    return { error: friendlyDbError(fetchError.message) };
  }
  if (!existing) {
    return { error: "Quiz not found." };
  }
  if (existing.status !== "draft") {
    return { error: "Only draft quizzes can be edited." };
  }

  const {
    title,
    description,
    format,
    difficulty,
    multipleChoiceCount,
    trueFalseCount,
    durationMinutes,
    deadline,
  } = parsed.data;

  // `.eq("status", "draft")` turns the check-above/act-here pair into a
  // compare-and-swap: without it, a quiz published (e.g. from another tab)
  // in the moment between the read above and this write could still have
  // its question composition silently edited after going live.
  const { data: updated, error } = await supabase
    .from("quizzes")
    .update({
      title,
      description: description ?? null,
      format,
      difficulty,
      multiple_choice_count: multipleChoiceCount,
      true_false_count: trueFalseCount,
      total_questions: multipleChoiceCount + trueFalseCount,
      duration_minutes: durationMinutes ?? null,
      ends_at: deadline ? new Date(deadline).toISOString() : null,
    })
    .eq("id", quizId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: friendlyDbError(error.message) };
  }
  if (!updated) {
    return { error: "This quiz is no longer a draft — it may have just been published." };
  }

  redirect(`/quizzes/${quizId}`);
}

/**
 * Deletes a draft quiz. Throws (rather than returning a state) on failure
 * so the nearest `error.tsx` boundary surfaces it — there's no form state
 * to manage here, just a confirm-then-submit action.
 */
export async function deleteQuiz(quizId: string) {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("quizzes")
    .select("status")
    .eq("id", quizId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to load quiz before deleting: ${fetchError.message}`);
  }
  if (!existing) {
    throw new Error("Quiz not found.");
  }
  if (existing.status !== "draft") {
    throw new Error("Only draft quizzes can be deleted.");
  }

  // Same compare-and-swap reasoning as `updateQuiz`: `.eq("status", "draft")`
  // stops a quiz published in between the read above and this delete from
  // being deleted anyway.
  const { data: deleted, error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", quizId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete quiz: ${error.message}`);
  }
  if (!deleted) {
    throw new Error("This quiz is no longer a draft and can't be deleted.");
  }

  redirect("/quizzes");
}
