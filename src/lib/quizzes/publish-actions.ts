"use server";

import { createClient } from "@/lib/supabase/server";
import { loadOwnedDraftQuiz, requireSession } from "./ownership";
import { validateQuestionForFormat } from "./question-rules";
import { generateAccessToken } from "./access-token";
import type { QuizFormat } from "./format";

export type PublishQuizResult = { success: true } | { success: false; error: string };

type OwnedDraftQuizForPublish = {
  id: string;
  status: string;
  format: QuizFormat;
  multiple_choice_count: number;
  true_false_count: number;
  total_questions: number;
};

type QuestionForPublishCheck = {
  type: "multiple_choice" | "true_false";
  question_text: string;
  review_status: "pending" | "approved";
  answers: { answer_text: string; is_correct: boolean }[];
};

const MAX_ACCESS_TOKEN_ATTEMPTS = 3;

/**
 * Publishes a draft quiz. This is the one and only path that ever sets
 * `quizzes.status = 'published'` — the AI never publishes anything, and
 * nothing here trusts the client's idea of "ready": every readiness
 * condition is re-derived from the database, same as the rest of this
 * app's server-side validation.
 *
 * "Ready for publishing" (server-side, authoritative):
 *   - quiz is currently `draft` (via loadOwnedDraftQuiz)
 *   - has at least one question
 *   - every question is `review_status = 'approved'`
 *   - the actual MC/TF/total counts match the quiz's configured counts
 *   - every question still independently passes `validateQuestionShape`
 *     (the same authority every other question write goes through) — a
 *     defense-in-depth re-check, not just trusting past validation.
 *
 * On success, generates a fresh opaque access token
 * (`generateAccessToken()`) and stores it as `quizzes.access_code` — the
 * public `/join/{token}` URL is built from this, never the quiz's UUID.
 */
export async function publishQuiz(quizId: string): Promise<PublishQuizResult> {
  const supabase = await createClient();

  const { sub, error: authError } = await requireSession(supabase);
  if (!sub) return { success: false, error: authError! };

  const { quiz, error: quizError } = await loadOwnedDraftQuiz<OwnedDraftQuizForPublish>(
    supabase,
    quizId,
    "id, status, format, multiple_choice_count, true_false_count, total_questions"
  );
  if (!quiz) return { success: false, error: quizError! };

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("type, question_text, review_status, answers(answer_text, is_correct)")
    .eq("quiz_id", quizId)
    .overrideTypes<QuestionForPublishCheck[], { merge: false }>();

  if (questionsError) {
    console.error("Failed to load questions before publishing:", questionsError.message);
    return { success: false, error: "Failed to load the quiz's questions. Please try again." };
  }

  if (!questions || questions.length === 0) {
    return { success: false, error: "Add at least one question before publishing." };
  }

  const pendingCount = questions.filter((q) => q.review_status !== "approved").length;
  if (pendingCount > 0) {
    return {
      success: false,
      error: `${pendingCount} question${pendingCount === 1 ? "" : "s"} still need${pendingCount === 1 ? "s" : ""} review. Approve every question before publishing.`,
    };
  }

  const mcCount = questions.filter((q) => q.type === "multiple_choice").length;
  const tfCount = questions.filter((q) => q.type === "true_false").length;
  if (
    mcCount !== quiz.multiple_choice_count ||
    tfCount !== quiz.true_false_count ||
    questions.length !== quiz.total_questions
  ) {
    return {
      success: false,
      error: "The quiz's questions don't match its configured composition. Please review before publishing.",
    };
  }

  for (const question of questions) {
    const shape = {
      type: question.type,
      question_text: question.question_text,
      answers: question.answers.map((a) => ({ text: a.answer_text, is_correct: a.is_correct })),
    };
    const result = validateQuestionForFormat(shape, quiz.format, `"${question.question_text}"`);
    if (!result.success) {
      return { success: false, error: `Can't publish: ${result.error}` };
    }
  }

  for (let attempt = 1; attempt <= MAX_ACCESS_TOKEN_ATTEMPTS; attempt++) {
    // `.eq("status", "draft")` makes this a compare-and-swap: without it,
    // two concurrent publish attempts (two tabs, a double-click) could both
    // pass the `loadOwnedDraftQuiz` read above and both issue this UPDATE,
    // with the second silently overwriting the first's `access_code` —
    // invalidating a join link that may already be in a student's hands.
    const { data: published, error: updateError } = await supabase
      .from("quizzes")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        access_code: generateAccessToken(),
      })
      .eq("id", quizId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (updateError) {
      // 24 random bytes leaves collision probability astronomically low —
      // this loop is a defensive backstop, not an expected path.
      const isUniqueViolation =
        updateError.code === "23505" || updateError.message.includes("access_code");
      if (!isUniqueViolation || attempt === MAX_ACCESS_TOKEN_ATTEMPTS) {
        console.error("Failed to publish quiz:", updateError.message);
        return { success: false, error: "Failed to publish the quiz. Please try again." };
      }
      continue;
    }

    if (published) {
      return { success: true };
    }

    // The CAS matched zero rows: another request already moved this quiz
    // off `draft` (e.g. a race with a second tab) — retrying with a new
    // token would not help, since it's not a token collision.
    return {
      success: false,
      error: "This quiz was already published. Refresh the page to see it.",
    };
  }

  return { success: false, error: "Failed to publish the quiz. Please try again." };
}
