"use server";

import { createClient } from "@/lib/supabase/server";
import { loadOwnedDraftQuiz, requireSession } from "./ownership";
import { questionInputSchema, type QuestionInputValues } from "./question-schema";
import { validateQuestionForFormat } from "./question-rules";
import type { QuizFormat } from "./format";

export type QuestionMutationResult = { success: true } | { success: false; error: string };

type OwnedDraftQuizStatus = { id: string; status: string };
type OwnedDraftQuizWithFormat = { id: string; status: string; format: QuizFormat };

/**
 * Builds the `{type, question_text, answers}` payload the `add_quiz_question`/
 * `update_quiz_question` RPCs expect, running the submitted answer options
 * through the same domain rules (`validateQuestionForFormat`) an
 * AI-generated question is held to — including the quiz's format, so a
 * teacher can never manually add a True/False question to a Vocabulary
 * Quiz even though the client-side editor already hides that option. Never
 * trusts `correctIndex` blindly: if it's out of range no answer ends up
 * marked correct, which validation itself rejects with a clear "0 correct
 * answers" message.
 */
function buildAndValidateQuestion(input: QuestionInputValues, format: QuizFormat) {
  const parsed = questionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { type, questionText, options, correctIndex } = parsed.data;
  const answers = options.map((text, index) => ({
    text,
    is_correct: index === correctIndex,
  }));

  return validateQuestionForFormat({ type, question_text: questionText, answers }, format, "This question");
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
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizWithFormat>(
    supabase,
    quizId,
    "id, status, format"
  );
  if (!quiz) return { success: false, error: quizError! };

  const validated = buildAndValidateQuestion(input, quiz.format);
  if (!validated.success) {
    return { success: false, error: validated.error };
  }

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
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  // quizId is only used for this friendly, fast-fail draft/format check —
  // the `update_quiz_question` RPC re-derives the question's real quiz and
  // re-checks ownership/draft status itself, which is the actual security
  // boundary regardless of what quizId the client sent.
  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizWithFormat>(
    supabase,
    quizId,
    "id, status, format"
  );
  if (!quiz) return { success: false, error: quizError! };

  const validated = buildAndValidateQuestion(input, quiz.format);
  if (!validated.success) {
    return { success: false, error: validated.error };
  }

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
    // A leftover True/False question from before the quiz's format was
    // switched to Vocabulary Quiz trips `validate_question_format_trigger`
    // (supabase/migrations/20260903120000_add_quiz_format_difficulty.sql)
    // on this otherwise-unrelated column update — surface that specific,
    // actionable reason rather than the generic fallback.
    if (error.message.includes("Vocabulary Quiz questions must be Multiple Choice")) {
      return {
        success: false,
        error:
          "Can't approve — this question is True/False, but Vocabulary Quiz questions must be Multiple Choice. Edit or delete it first.",
      };
    }
    return { success: false, error: "Failed to update the review status. Please try again." };
  }

  return { success: true };
}

export type BulkApproveResult =
  | { success: true; approvedCount: number }
  | { success: false; error: string };

/**
 * Approves either a specific set of questions (`questionIds`) or every
 * question on the quiz (`questionIds === null`, used by "Approve all").
 * Re-validates each target through the same `validateQuestionShape`
 * authority every other write path uses before flipping any status, and
 * rejects the whole batch on the first invalid question — never a partial
 * approval. The actual write is a single `UPDATE ... WHERE quiz_id = ...
 * AND id IN (...)` statement, which Postgres already applies atomically
 * (all matching rows or none), so no RPC is needed. `quiz_id` is always
 * taken from the server-verified owned quiz, never trusted from the
 * client's `questionIds` alone — a foreign id (even one the same teacher
 * owns on a different quiz) simply won't match and won't be touched.
 */
async function approveQuestionIds(
  quizId: string,
  questionIds: string[] | null
): Promise<BulkApproveResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizWithFormat>(
    supabase,
    quizId,
    "id, status, format"
  );
  if (!quiz) return { success: false, error: quizError! };

  let targetsQuery = supabase
    .from("questions")
    .select("id, type, question_text, answers(answer_text, is_correct)")
    .eq("quiz_id", quizId);
  if (questionIds) {
    targetsQuery = targetsQuery.in("id", questionIds);
  }

  const { data: targets, error: fetchError } = await targetsQuery;
  if (fetchError) {
    console.error("Failed to load questions for bulk approval:", fetchError.message);
    return { success: false, error: "Failed to load the questions to approve." };
  }
  if (!targets || targets.length === 0) {
    return { success: false, error: "No questions to approve." };
  }

  for (const question of targets) {
    const shape = {
      type: question.type,
      question_text: question.question_text,
      answers: question.answers.map((a) => ({ text: a.answer_text, is_correct: a.is_correct })),
    };
    const result = validateQuestionForFormat(shape, quiz.format, `"${question.question_text}"`);
    if (!result.success) {
      return { success: false, error: `Can't approve ${result.error}` };
    }
  }

  const targetIds = targets.map((q) => q.id);
  const { error: updateError } = await supabase
    .from("questions")
    .update({ review_status: "approved" })
    .eq("quiz_id", quizId)
    .in("id", targetIds);

  if (updateError) {
    console.error("Failed to bulk-approve questions:", updateError.message);
    return { success: false, error: "Failed to approve the questions. Please try again." };
  }

  return { success: true, approvedCount: targetIds.length };
}

/** Approves exactly the given questions — used by the review page's "Approve selected". */
export async function approveSelectedQuestions(
  quizId: string,
  questionIds: string[]
): Promise<BulkApproveResult> {
  if (questionIds.length === 0) {
    return { success: false, error: "No questions selected." };
  }
  return approveQuestionIds(quizId, questionIds);
}

/** Approves every question on the quiz — used by the review page's "Approve all". */
export async function approveAllQuestions(quizId: string): Promise<BulkApproveResult> {
  return approveQuestionIds(quizId, null);
}
