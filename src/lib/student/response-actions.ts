"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSessionExpired } from "./expiry";
import { finalizeSession } from "./scoring";

export type ResponseActionResult =
  | { success: true }
  // `stale: true` means the session itself moved on (expired / already
  // submitted / gone) — the caller should re-fetch the session view instead
  // of just showing the error inline, since the whole page's state is wrong,
  // not just this one write.
  | { success: false; error: string; stale: boolean };

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_AVAILABLE_ERROR = "This quiz session isn't available.";
const EXPIRED_ERROR = "Time's up — this quiz can no longer be changed.";
const SUBMITTED_ERROR = "This quiz has already been submitted.";

type SessionForWrite = {
  id: string;
  status: string;
  expires_at: string;
  question_order: unknown;
  total_questions: number;
};

async function loadSessionForWrite(
  admin: ReturnType<typeof createAdminClient>,
  sessionToken: string
): Promise<SessionForWrite | null> {
  const { data, error } = await admin
    .from("quiz_sessions")
    .select("id, status, expires_at, question_order, total_questions")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (error) {
    console.error("Failed to load session for write:", error.message);
    return null;
  }
  return data;
}

function questionIdsFromOrder(questionOrder: unknown): string[] {
  if (
    questionOrder &&
    typeof questionOrder === "object" &&
    Array.isArray((questionOrder as { questions?: unknown }).questions)
  ) {
    return (questionOrder as { questions: unknown[] }).questions.filter(
      (id): id is string => typeof id === "string"
    );
  }
  return [];
}

/**
 * Records (or changes) a student's selected answer for one question in an
 * active session. Every relationship the client claims — this session owns
 * this question, this answer belongs to this question — is re-verified
 * against the database inside this call; nothing about a client-sent
 * `questionId`/`answerId` pair is trusted just because it was accepted by
 * the UI. `is_correct` is computed here from the real `answers` row and is
 * never accepted from the caller.
 */
export async function submitAnswer(
  sessionToken: string,
  questionId: string,
  answerId: string
): Promise<ResponseActionResult> {
  const admin = createAdminClient();
  const session = await loadSessionForWrite(admin, sessionToken);

  if (!session) {
    return { success: false, error: NOT_AVAILABLE_ERROR, stale: true };
  }
  if (session.status === "completed") {
    return { success: false, error: SUBMITTED_ERROR, stale: true };
  }

  if (isSessionExpired(session.expires_at)) {
    await finalizeSession(admin, session.id, session.total_questions, "expired", new Date().toISOString());
    return { success: false, error: EXPIRED_ERROR, stale: true };
  }

  // The question must belong to this session's own shuffle — the
  // authoritative record of which questions this session's quiz has.
  const sessionQuestionIds = questionIdsFromOrder(session.question_order);
  if (!sessionQuestionIds.includes(questionId)) {
    return { success: false, error: "Invalid question.", stale: false };
  }

  // The answer must genuinely belong to that question — re-checked against
  // the real answers table, not the (client-invisible, but still not
  // blindly trusted) session shuffle.
  const { data: answer, error: answerError } = await admin
    .from("answers")
    .select("id, question_id, is_correct")
    .eq("id", answerId)
    .maybeSingle();

  if (answerError) {
    console.error("Failed to load answer:", answerError.message);
    return { success: false, error: GENERIC_ERROR, stale: false };
  }
  if (!answer || answer.question_id !== questionId) {
    return { success: false, error: "Invalid answer selection.", stale: false };
  }

  const { error: upsertError } = await admin.from("responses").upsert(
    {
      session_id: session.id,
      question_id: questionId,
      selected_answer_id: answerId,
      is_correct: answer.is_correct,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "session_id,question_id" }
  );

  if (upsertError) {
    console.error("Failed to save response:", upsertError.message);
    return { success: false, error: GENERIC_ERROR, stale: false };
  }

  return { success: true };
}

/**
 * Finalizes a session by scoring it and marking it `completed`. Idempotent
 * — calling it again on an already-completed session is a no-op success
 * (the result was already computed and persisted by the call that actually
 * completed it), so a slow network retry or a double-click can't produce a
 * different result or error out a student who already submitted. Rejects
 * if the deadline has already passed: `expired` and `completed` are
 * distinct terminal states (see docs/database.md) — a student who let the
 * timer run out sees the expired state (its result computed the same way,
 * from whatever was saved), not a submitted confirmation, exactly like
 * `submitAnswer`'s own expiry check. Scoring itself — and the double-
 * submit/race safety — lives in `./scoring`'s `finalizeSession`.
 */
export async function submitQuiz(sessionToken: string): Promise<ResponseActionResult> {
  const admin = createAdminClient();
  const session = await loadSessionForWrite(admin, sessionToken);

  if (!session) {
    return { success: false, error: NOT_AVAILABLE_ERROR, stale: true };
  }
  if (session.status === "completed") {
    return { success: true };
  }

  if (isSessionExpired(session.expires_at)) {
    await finalizeSession(admin, session.id, session.total_questions, "expired", new Date().toISOString());
    return { success: false, error: EXPIRED_ERROR, stale: true };
  }

  await finalizeSession(admin, session.id, session.total_questions, "completed", new Date().toISOString());

  return { success: true };
}
