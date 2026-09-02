import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export type QuizResult = {
  totalQuestions: number;
  answeredQuestions: number;
  unansweredQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  scorePercentage: number;
};

function buildResult(totalQuestions: number, answered: number, correct: number): QuizResult {
  return {
    totalQuestions,
    answeredQuestions: answered,
    unansweredQuestions: totalQuestions - answered,
    correctAnswers: correct,
    incorrectAnswers: answered - correct,
    scorePercentage: totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0,
  };
}

/**
 * The one place that turns a session's saved responses into a result.
 * Always recomputed fresh from `responses` — never from the persisted
 * `quiz_sessions.score`/`correct_answers` columns, which exist only as a
 * cache the teacher results list reads in bulk (see
 * `src/app/(admin)/quizzes/[id]/results/page.tsx`) to avoid a responses
 * query per session there. `responses.is_correct` was already resolved
 * against the real `answers` row, by id, at answer time (Phase 7) — the
 * randomized on-screen position of an answer never enters this
 * calculation at all. An unanswered question is neither correct nor
 * incorrect; it only reduces `answeredQuestions` below `totalQuestions`.
 */
export async function computeResult(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  totalQuestions: number
): Promise<QuizResult> {
  const { data, error } = await admin
    .from("responses")
    .select("is_correct")
    .eq("session_id", sessionId);

  if (error) {
    console.error("Failed to load responses for scoring:", error.message);
    return buildResult(totalQuestions, 0, 0);
  }

  const answered = data.length;
  const correct = data.filter((response) => response.is_correct).length;
  return buildResult(totalQuestions, answered, correct);
}

/**
 * Ends a session — by explicit submit or by expiry — and persists its
 * result onto `quiz_sessions`. Guarded by a compare-and-swap on `status`
 * (only a session still `started`/`in_progress` can be finalized, mirroring
 * the same pattern `quiz-session.ts` uses for `question_order`): a double
 * submit, a submit racing an expiry detection, or a retried request after a
 * dropped response can't produce two different persisted results. Whichever
 * caller's `UPDATE` actually lands wins and its freshly-computed result is
 * authoritative; every other caller's `UPDATE` matches zero rows (status
 * already moved), so it falls back to recomputing from `responses` — safe
 * because every write path in `response-actions.ts` already refuses to
 * touch `responses` once `status` is no longer started/in_progress, so
 * nothing can change between the winner's computation and the loser's.
 */
export async function finalizeSession(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  totalQuestions: number,
  status: "completed" | "expired",
  completedAt: string
): Promise<QuizResult> {
  const result = await computeResult(admin, sessionId, totalQuestions);

  const { data: won, error } = await admin
    .from("quiz_sessions")
    .update({
      status,
      completed_at: completedAt,
      score: result.scorePercentage,
      correct_answers: result.correctAnswers,
    })
    .eq("id", sessionId)
    .in("status", ["started", "in_progress"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to persist quiz result:", error.message);
    return result;
  }
  if (won) {
    return result;
  }

  return computeResult(admin, sessionId, totalQuestions);
}
