import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Verifies the request carries a valid session and returns the teacher's
 * id (`sub`) from the locally-verified JWT claims. Shared by every quiz/
 * question Server Action so "your session has expired" is worded and
 * checked identically everywhere.
 */
export async function requireSession(supabase: SupabaseServerClient) {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    return { sub: null, error: "Your session has expired. Please sign in again." };
  }
  return { sub: data.claims.sub, error: null };
}

/**
 * Loads a quiz the caller owns and that is still a draft, selecting only
 * the caller-specified columns. RLS (`quizzes_select_own`) already means
 * another teacher's quiz comes back as no row at all, indistinguishable
 * from a nonexistent id — this just turns that into a clear message
 * instead of a silent no-op. This is a friendly, fast-fail check only:
 * the database RPCs/RLS policies a caller goes on to use are always the
 * actual security boundary, not this function.
 */
export async function loadOwnedDraftQuiz<T extends { status: string }>(
  supabase: SupabaseServerClient,
  quizId: string,
  select: string
): Promise<{ quiz: T | null; error: string | null }> {
  // A dynamic (non-literal) select string defeats postgrest-js's column-name
  // type inference, so `overrideTypes` can't structurally verify T against
  // it the way an inline literal `.select("...")` call can elsewhere in
  // this codebase — callers are trusted to pass a `select` string that
  // actually matches T, same as any other raw Supabase query.
  const { data: quiz, error } = (await supabase
    .from("quizzes")
    .select(select)
    .eq("id", quizId)
    .maybeSingle()) as { data: T | null; error: { message: string } | null };

  if (error) {
    console.error("Failed to load quiz:", error.message);
    return { quiz: null, error: "Failed to load the quiz." };
  }
  if (!quiz) {
    return { quiz: null, error: "Quiz not found." };
  }
  if (quiz.status !== "draft") {
    return { quiz: null, error: "This quiz is no longer a draft." };
  }

  return { quiz, error: null };
}
