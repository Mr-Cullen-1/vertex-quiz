import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeSession } from "@/lib/student/scoring";

const SCORE_BUCKETS = [
  { label: "90–100%", min: 90, max: 100 },
  { label: "80–89%", min: 80, max: 89 },
  { label: "70–79%", min: 70, max: 79 },
  { label: "60–69%", min: 60, max: 69 },
  { label: "0–59%", min: 0, max: 59 },
] as const;

const OPTION_LABELS = ["A", "B", "C", "D"];

export type ScoreDistributionBucket = { label: string; min: number; max: number; count: number };

export type AnswerOptionStat = {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  count: number;
};

export type QuestionAnalytics = {
  id: string;
  position: number;
  text: string;
  type: "multiple_choice" | "true_false";
  correct: number;
  incorrect: number;
  unanswered: number;
  successRate: number | null;
  options: AnswerOptionStat[];
};

export type QuizAnalyticsOverview = {
  participants: number;
  completed: number;
  expired: number;
  /** = participants - completed - expired: still started/in_progress and not yet past its deadline. */
  inProgress: number;
  /** completed / participants (see loadQuizAnalytics doc comment for why). Null when there are no participants. */
  completionRate: number | null;
  /** How many sessions contributed to averageScore/highestScore/lowestScore/distribution — completed + expired. */
  scoredSessionCount: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  /** Average `completed_at - started_at`, in seconds, over `status = 'completed'` sessions only — see doc comment. */
  averageCompletionSeconds: number | null;
};

export type QuizAnalytics = {
  quizId: string;
  quizTitle: string;
  quizStatus: string;
  overview: QuizAnalyticsOverview;
  distribution: ScoreDistributionBucket[];
  questions: QuestionAnalytics[];
};

type QuizRow = { id: string; title: string; status: string };

type SessionRow = {
  id: string;
  status: "started" | "in_progress" | "completed" | "expired";
  score: number | null;
  correct_answers: number | null;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
  expires_at: string;
};

/**
 * Loads every aggregate metric a teacher's per-quiz analytics page needs,
 * for a quiz they own. Ownership is the same plain RLS-scoped read every
 * other `/quizzes/[id]/*` page uses (`quizzes_select_own`) — another
 * teacher's quiz id comes back as no row, indistinguishable from a
 * nonexistent one, so the caller (the page) just needs to treat `null` as
 * not-found. No new grant or RLS policy was needed for any of this,
 * verified live before writing this file — see docs/database.md →
 * "service_role privileges".
 *
 * **Self-healing read**: a session whose `expires_at` has passed but that
 * nobody has revisited since (so nothing ever called `finalizeSession` on
 * it — see Phase 7/8) would otherwise sit at `status = 'started'`/
 * `'in_progress'` forever, undercounting "Expired" and skewing every
 * score-based metric. Before aggregating, this function finds exactly
 * those stale sessions for this quiz and finalizes them the same way a
 * student's own page load would (`finalizeSession`, unchanged from
 * Phase 8 — this does not alter scoring semantics, it just triggers the
 * existing logic from a new, already-ownership-verified call site). That
 * write goes through the service-role admin client — `authenticated`
 * (teachers) has never had `UPDATE` on `quiz_sessions`, by design (every
 * student-facing write goes through the admin client) — but only for
 * sessions belonging to a quiz this function has already confirmed the
 * caller owns.
 *
 * **Definitions** (see docs/architecture.md → "Analytics" for the full
 * writeup):
 * - "Participants" = every `quiz_sessions` row for this quiz. There is no
 *   draft/pending session state in this schema — a session is created
 *   already `started` — so every row is an "eligible started session."
 * - "Completion rate" = completed / participants (i.e. every session is
 *   eligible; nothing is excluded from the denominator).
 * - Average/highest/lowest score include `completed` AND `expired`
 *   sessions with a persisted score (matching the task's own definition)
 *   — never sessions still genuinely in progress.
 * - Average completion time uses `status = 'completed'` sessions only.
 *   An `expired` session's `completed_at` records when the system
 *   *discovered* the expiry (a page load, an answer attempt, or this very
 *   function's self-healing pass) — not when the student actually
 *   stopped working on it — so `completed_at - started_at` for an expired
 *   session is not a meaningful completion time and would silently
 *   inflate the average; it's excluded entirely rather than guessed at.
 * - A question's "success rate" = correct / total submitted sessions
 *   (completed + expired) for the whole quiz — not "/ answered" — so
 *   difficulty is comparable across questions regardless of how many
 *   students skipped each one. An unanswered response is neither correct
 *   nor incorrect; it only ever affects the unanswered count.
 */
export async function loadQuizAnalytics(
  supabase: SupabaseServerClient,
  quizId: string
): Promise<QuizAnalytics | null> {
  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, status")
    .eq("id", quizId)
    .maybeSingle()
    .overrideTypes<QuizRow, { merge: false }>();

  if (quizError) {
    console.error("Failed to load quiz for analytics:", quizError.message);
    return null;
  }
  if (!quiz) {
    return null;
  }

  const { data: questionRows, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_text, type, order_index")
    .eq("quiz_id", quizId)
    .order("order_index");

  if (questionsError) {
    console.error("Failed to load questions for analytics:", questionsError.message);
    return null;
  }

  const questionIds = (questionRows ?? []).map((q) => q.id);

  const { data: answerRows, error: answersError } =
    questionIds.length > 0
      ? await supabase
          .from("answers")
          .select("id, question_id, answer_text, order_index, is_correct")
          .in("question_id", questionIds)
      : { data: [], error: null };

  if (answersError) {
    console.error("Failed to load answers for analytics:", answersError.message);
    return null;
  }

  const { data: sessionRows, error: sessionsError } = await supabase
    .from("quiz_sessions")
    .select("id, status, score, correct_answers, total_questions, started_at, completed_at, expires_at")
    .eq("quiz_id", quizId)
    .overrideTypes<SessionRow[], { merge: false }>();

  if (sessionsError) {
    console.error("Failed to load sessions for analytics:", sessionsError.message);
    return null;
  }

  const sessions = sessionRows ?? [];
  await finalizeStaleSessions(sessions);

  const submittedSessionIds = sessions
    .filter((s) => s.status === "completed" || s.status === "expired")
    .map((s) => s.id);

  const { data: responseRows, error: responsesError } =
    submittedSessionIds.length > 0
      ? await supabase
          .from("responses")
          .select("question_id, selected_answer_id, is_correct")
          .in("session_id", submittedSessionIds)
      : { data: [], error: null };

  if (responsesError) {
    console.error("Failed to load responses for analytics:", responsesError.message);
    return null;
  }

  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    quizStatus: quiz.status,
    overview: buildOverview(sessions),
    distribution: buildDistribution(sessions),
    questions: buildQuestionAnalytics(
      questionRows ?? [],
      answerRows ?? [],
      responseRows ?? [],
      submittedSessionIds.length
    ),
  };
}

/**
 * Finalizes, in place, any session that's past its deadline but was never
 * scored — mutates the passed-in rows with the real persisted result so
 * the rest of this module never has to special-case "expired but not
 * finalized yet." See the doc comment on `loadQuizAnalytics` for why this
 * exists and why it's safe.
 */
async function finalizeStaleSessions(sessions: SessionRow[]): Promise<void> {
  const nowMs = Date.now();
  const stale = sessions.filter(
    (s) =>
      (s.status === "started" || s.status === "in_progress") &&
      new Date(s.expires_at).getTime() <= nowMs
  );
  if (stale.length === 0) return;

  const admin = createAdminClient();
  const completedAt = new Date().toISOString();

  await Promise.all(
    stale.map(async (session) => {
      const result = await finalizeSession(admin, session.id, session.total_questions, "expired", completedAt);
      session.status = "expired";
      session.completed_at = completedAt;
      session.score = result.scorePercentage;
      session.correct_answers = result.correctAnswers;
    })
  );
}

function buildOverview(sessions: SessionRow[]): QuizAnalyticsOverview {
  const participants = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const expired = sessions.filter((s) => s.status === "expired").length;
  const inProgress = participants - completed - expired;

  const scored = sessions.filter((s) => s.score != null);
  const scores = scored.map((s) => s.score as number);

  const completedWithDuration = sessions.filter((s) => s.status === "completed" && s.completed_at);
  const durationsSeconds = completedWithDuration.map(
    (s) => (new Date(s.completed_at as string).getTime() - new Date(s.started_at).getTime()) / 1000
  );

  return {
    participants,
    completed,
    expired,
    inProgress,
    completionRate: participants > 0 ? Math.round((completed / participants) * 100) : null,
    scoredSessionCount: scored.length,
    averageScore: average(scores),
    highestScore: scores.length > 0 ? Math.max(...scores) : null,
    lowestScore: scores.length > 0 ? Math.min(...scores) : null,
    averageCompletionSeconds: average(durationsSeconds),
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function buildDistribution(sessions: SessionRow[]): ScoreDistributionBucket[] {
  const scored = sessions.filter((s) => s.score != null).map((s) => s.score as number);
  return SCORE_BUCKETS.map((bucket) => ({
    ...bucket,
    count: scored.filter((score) => score >= bucket.min && score <= bucket.max).length,
  }));
}

function buildQuestionAnalytics(
  questions: { id: string; question_text: string; type: string; order_index: number }[],
  answers: { id: string; question_id: string; answer_text: string; order_index: number; is_correct: boolean }[],
  responses: { question_id: string; selected_answer_id: string | null; is_correct: boolean }[],
  totalSubmittedSessions: number
): QuestionAnalytics[] {
  const answersByQuestion = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = answersByQuestion.get(answer.question_id) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.question_id, list);
  }

  const responsesByQuestion = new Map<string, typeof responses>();
  for (const response of responses) {
    const list = responsesByQuestion.get(response.question_id) ?? [];
    list.push(response);
    responsesByQuestion.set(response.question_id, list);
  }

  return questions.map((question, index) => {
    const questionResponses = responsesByQuestion.get(question.id) ?? [];
    const correct = questionResponses.filter((r) => r.is_correct).length;
    const incorrect = questionResponses.filter((r) => !r.is_correct).length;
    const unanswered = totalSubmittedSessions - correct - incorrect;

    const optionCounts = new Map<string, number>();
    for (const response of questionResponses) {
      if (!response.selected_answer_id) continue; // defensive: FK went null (answer deleted), skip from the option breakdown
      optionCounts.set(response.selected_answer_id, (optionCounts.get(response.selected_answer_id) ?? 0) + 1);
    }

    const questionAnswers = [...(answersByQuestion.get(question.id) ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    );
    const options: AnswerOptionStat[] = questionAnswers.map((answer, optionIndex) => ({
      id: answer.id,
      label: question.type === "multiple_choice" ? OPTION_LABELS[optionIndex] : answer.answer_text,
      text: answer.answer_text,
      isCorrect: answer.is_correct,
      count: optionCounts.get(answer.id) ?? 0,
    }));

    return {
      id: question.id,
      position: index + 1,
      text: question.question_text,
      type: question.type as QuestionAnalytics["type"],
      correct,
      incorrect,
      unanswered,
      successRate: totalSubmittedSessions > 0 ? Math.round((correct / totalSubmittedSessions) * 100) : null,
      options,
    };
  });
}
