"use server";

import { createClient } from "@/lib/supabase/server";
import { loadOwnedDraftQuiz, requireSession } from "./ownership";
import { questionInputSchema, type QuestionInputValues } from "./question-schema";
import { validateQuestionShape } from "./question-rules";

export type QuestionMutationResult = { success: true } | { success: false; error: string };

type OwnedDraftQuizStatus = { id: string; status: string };

/**
 * Builds the `{type, question_text, answers}` payload the `add_quiz_question`/
 * `update_quiz_question` RPCs expect, running the submitted answer options
 * through the same domain rules (`validateQuestionShape`) an AI-generated
 * question is held to. Never trusts `correctIndex` blindly: if it's out of
 * range no answer ends up marked correct, which `validateQuestionShape`
 * itself rejects with a clear "0 correct answers" message.
 */
function buildAndValidateQuestion(input: QuestionInputValues) {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { type, questionText, options, correctIndex } = parsed.data;
  const answers = options.map((text, index) => ({
    text,
    is_correct: index === correctIndex,
  }));

  return validateQuestionShape({ type, question_text: questionText, answers }, "This question");
}

/**
 * Adds a teacher-authored question to a draft quiz. Runs through the exact
 * same validation as an AI-generated question, then the `add_quiz_question`
 * RPC inserts the question + answers and keeps
 * multiple_choice_count/true_false_count/total_questions in sync with the
 * real row count, all in one transaction. New questions always start
 * `pending` — the teacher must explicitly approve them, same as any
 * Gemini-generated question.
 */
export async function addQuestion(
  quizId: string,
  input: QuestionInputValues
): Promise<QuestionMutationResult> {
  const validated = buildAndValidateQuestion(input);
  if (!validated.success) {
    return { success: false, error: validated.error };
  }

  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizStatus>(
    supabase,
    quizId,
    "id, status"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase.rpc("add_quiz_question", {
    p_quiz_id: quizId,
    p_question: validated.question,
  });

  if (error) {
    console.error("Failed to add question:", error.message);
    return { success: false, error: "Failed to add the question. Please try again." };
  }

  return { success: true };
}

/**
 * Replaces a question's text/type/answers in place. Type changes (MC <->
 * TF) are handled entirely inside `update_quiz_question`: it replaces the
 * answer set atomically and adjusts the quiz's per-type counts, so an
 * in-flight edit can never leave an MC question with 2 answers or a TF
 * question with 4. Editing always resets the question back to `pending` —
 * see the migration for why.
 */
export async function updateQuestion(
  quizId: string,
  questionId: string,
  input: QuestionInputValues
): Promise<QuestionMutationResult> {
  const validated = buildAndValidateQuestion(input);
  if (!validated.success) {
    return { success: false, error: validated.error };
  }

  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  // quizId is only used for this friendly, fast-fail draft check — the
  // `update_quiz_question` RPC re-derives the question's real quiz and
  // re-checks ownership/draft status itself, which is the actual security
  // boundary regardless of what quizId the client sent.
  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizStatus>(
    supabase,
    quizId,
    "id, status"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase.rpc("update_quiz_question", {
    p_question_id: questionId,
    p_question: validated.question,
  });

  if (error) {
    console.error("Failed to update question:", error.message);
    return { success: false, error: "Failed to save the question. Please try again." };
  }

  return { success: true };
}

/**
 * Deletes a question. `delete_quiz_question` resequences the quiz's
 * remaining questions' order_index and decrements the matching
 * multiple_choice_count/true_false_count/total_questions, all atomically.
 */
export async function deleteQuestion(
  quizId: string,
  questionId: string
): Promise<QuestionMutationResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizStatus>(
    supabase,
    quizId,
    "id, status"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase.rpc("delete_quiz_question", {
    p_question_id: questionId,
  });

  if (error) {
    console.error("Failed to delete question:", error.message);
    return { success: false, error: "Failed to delete the question. Please try again." };
  }

  return { success: true };
}

/**
 * Applies a full new question order in one atomic RPC call. The caller
 * must supply every question id the quiz currently has — enforced by
 * `reorder_quiz_questions` itself, not just this action — so a stale or
 * partial client-side list can't silently drop a question's place.
 */
export async function reorderQuestions(
  quizId: string,
  orderedQuestionIds: string[]
): Promise<QuestionMutationResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizStatus>(
    supabase,
    quizId,
    "id, status"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase.rpc("reorder_quiz_questions", {
    p_quiz_id: quizId,
    p_question_ids: orderedQuestionIds,
  });

  if (error) {
    console.error("Failed to reorder questions:", error.message);
    return { success: false, error: "Failed to save the new question order. Please try again." };
  }

  return { success: true };
}

/**
 * Marks a question approved or pending. A plain single-row update — no RPC
 * needed, since RLS's existing `questions_update_own` policy (scoped
 * through `is_quiz_owner`) is already the real security boundary here.
 */
export async function setQuestionReviewStatus(
  quizId: string,
  questionId: string,
  approved: boolean
): Promise<QuestionMutationResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizStatus>(
    supabase,
    quizId,
    "id, status"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { error } = await supabase
    .from("questions")
    .update({ review_status: approved ? "approved" : "pending" })
    .eq("id", questionId)
    .eq("quiz_id", quizId);

  if (error) {
    console.error("Failed to update review status:", error.message);
    return { success: false, error: "Failed to update the review status. Please try again." };
  }

  return { success: true };
}
