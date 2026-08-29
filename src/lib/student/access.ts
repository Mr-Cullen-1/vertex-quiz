import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublishedQuizInfo = {
  id: string;
  title: string;
  description: string | null;
  multiple_choice_count: number;
  true_false_count: number;
  total_questions: number;
  duration_minutes: number | null;
  ends_at: string | null;
};

export type AccessResult =
  | { ok: true; quiz: PublishedQuizInfo }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Resolves an opaque `/join/{token}` access token to a published quiz,
 * using the service-role admin client — students have no Supabase Auth
 * session, so RLS has nothing to key off, and this is the one legitimate
 * case `src/lib/supabase/admin.ts` documents for using it.
 *
 * A wrong token, a token for a draft/closed quiz, and a token for a
 * genuinely published quiz all reach the same `.eq("status",
 * "published")` filter — an invalid token is indistinguishable from a
 * not-yet-published one, same "don't leak which" pattern RLS already uses
 * everywhere else in this app for teacher data.
 */
export async function loadPublishedQuizByToken(token: string): Promise<AccessResult> {
  const admin = createAdminClient();

  const { data: quiz, error } = await admin
    .from("quizzes")
    .select(
      "id, title, description, multiple_choice_count, true_false_count, total_questions, duration_minutes, ends_at"
    )
    .eq("access_code", token)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("Failed to load quiz by access token:", error.message);
    return { ok: false, reason: "not_found" };
  }
  if (!quiz) {
    return { ok: false, reason: "not_found" };
  }

  // Server-side, authoritative — never trust a client-side clock. Called
  // again inside startSession() at submit time, not just here at
  // page-load time, since a student can sit on this page past the
  // deadline before submitting.
  if (quiz.ends_at && new Date(quiz.ends_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, quiz };
}
