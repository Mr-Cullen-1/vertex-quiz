export type SessionOverviewInput = {
  status: string;
  score: number | null;
};

export type SessionOverview = {
  /** = the number of sessions given — every quiz_session row is one participant attempt, see doc comment below. */
  sessions: number;
  completed: number;
  expired: number;
  /** completed / sessions, rounded, as a whole percentage. Null when there are no sessions — never a misleading 0%. */
  completionRate: number | null;
  /** Mean of `score` over sessions that have one persisted (completed or expired). Null when none do. */
  averageScore: number | null;
};

/**
 * The single canonical formula for "how is this set of quiz_sessions rows
 * doing" — sessions/completed/expired counts, completion rate, and average
 * score. Extracted from `src/lib/quizzes/analytics.ts`'s `buildOverview`
 * (the dedicated per-quiz Analytics page) so the compact overviews on My
 * Quizzes and Results can never silently drift from that page's
 * definitions: `loadQuizAnalytics`'s doc comment is still the canonical
 * writeup — completion rate = completed / total sessions (every session is
 * eligible, nothing excluded from the denominator); average score = the
 * mean of `score` over completed-or-expired sessions (a session still
 * genuinely in progress has no persisted score yet). "Participants" is
 * deliberately not a separate figure here: this schema creates exactly one
 * `quiz_sessions` row per `participants` row (see
 * `src/lib/student/join-actions.ts`'s `startSession`), so it is always the
 * same number as `sessions` — callers that want a "Participants" tile
 * should read `.sessions`, not invent a second count.
 */
export function computeSessionOverview(sessions: SessionOverviewInput[]): SessionOverview {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const expired = sessions.filter((s) => s.status === "expired").length;
  const scores = sessions
    .map((s) => s.score)
    .filter((score): score is number => score != null);

  return {
    sessions: total,
    completed,
    expired,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : null,
    averageScore:
      scores.length > 0 ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : null,
  };
}
