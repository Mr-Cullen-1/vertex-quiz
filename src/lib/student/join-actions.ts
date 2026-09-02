"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { generateAccessToken } from "@/lib/quizzes/access-token";
import { studentJoinSchema } from "./schema";
import { loadPublishedQuizByToken, type PublishedQuizInfo } from "./access";

export type StartSessionResult =
  | { success: true; sessionToken: string }
  | { success: false; error: string };

const MAX_SESSION_TOKEN_ATTEMPTS = 3;

/**
 * Falls back to a sane cap when the quiz has neither a per-session time
 * limit nor a deadline, so `quiz_sessions.expires_at` (not nullable) is
 * never left meaning "forever." Originally a 24-hour cap meant to read as
 * "effectively unlimited," but that produced a genuinely confusing
 * countdown for the student (a huge, seemingly-arbitrary remaining time)
 * with no way for the player UI to tell "this is the no-limit fallback"
 * apart from "this quiz really does have ~a day left." 20 minutes is a
 * normal, understandable quiz-taking window and matches what a teacher
 * who forgot to set a limit most likely intended. A deliberate default
 * change, not just a display fix — but no schema/migration, no change to
 * existing rows, and it only affects sessions created after this deploy. A
 * quiz's `duration_minutes`/`ends_at` should still be set explicitly
 * whenever a specific window matters.
 */
const NO_LIMIT_FALLBACK_MS = 20 * 60 * 1000;

function computeExpiresAt(
  startedAt: Date,
  quiz: Pick<PublishedQuizInfo, "duration_minutes" | "ends_at">
): Date {
  if (quiz.duration_minutes) {
    return new Date(startedAt.getTime() + quiz.duration_minutes * 60_000);
  }
  if (quiz.ends_at) {
    return new Date(quiz.ends_at);
  }
  return new Date(startedAt.getTime() + NO_LIMIT_FALLBACK_MS);
}

/**
 * Creates a participant + quiz_session for a student joining via a
 * published quiz's access token. Never trusts a quiz id from the client —
 * `token` is re-validated here (including the deadline, again,
 * server-side) rather than reusing whatever the page rendered, since a
 * student can submit long after the page loaded. Uses the service-role
 * admin client: students have no Supabase Auth session for RLS to key
 * off, exactly the case that client exists for.
 *
 * Duplicate-start protection for this MVP is intentionally simple: the
 * client disables the Start button for the duration of one request (see
 * `JoinForm`), and reopening the same link is allowed to start a new,
 * independent session — first + last name are not treated as a unique
 * identity, so no "is this the same student" matching is attempted here
 * or planned. See docs/development-progress.md for the documented
 * rationale.
 */
export async function startSession(
  token: string,
  formData: FormData
): Promise<StartSessionResult> {
  const parsed = studentJoinSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const access = await loadPublishedQuizByToken(token);
  if (!access.ok) {
    return {
      success: false,
      error:
        access.reason === "expired"
          ? "This quiz is no longer available."
          : "This quiz link isn't valid.",
    };
  }

  const admin = createAdminClient();
  const { firstName, lastName } = parsed.data;

  const { data: participant, error: participantError } = await admin
    .from("participants")
    .insert({ quiz_id: access.quiz.id, first_name: firstName, last_name: lastName })
    .select("id")
    .single();

  if (participantError || !participant) {
    console.error("Failed to create participant:", participantError?.message);
    return { success: false, error: "Failed to start the quiz. Please try again." };
  }

  const startedAt = new Date();
  const expiresAt = computeExpiresAt(startedAt, access.quiz);

  for (let attempt = 1; attempt <= MAX_SESSION_TOKEN_ATTEMPTS; attempt++) {
    const sessionToken = generateAccessToken();
    const { error: sessionError } = await admin.from("quiz_sessions").insert({
      quiz_id: access.quiz.id,
      participant_id: participant.id,
      session_token: sessionToken,
      status: "started",
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      total_questions: access.quiz.total_questions,
    });

    if (!sessionError) {
      return { success: true, sessionToken };
    }

    const isUniqueViolation =
      sessionError.code === "23505" || sessionError.message.includes("session_token");
    if (!isUniqueViolation || attempt === MAX_SESSION_TOKEN_ATTEMPTS) {
      console.error("Failed to create quiz session:", sessionError.message);
      return { success: false, error: "Failed to start the quiz. Please try again." };
    }
  }

  return { success: false, error: "Failed to start the quiz. Please try again." };
}
