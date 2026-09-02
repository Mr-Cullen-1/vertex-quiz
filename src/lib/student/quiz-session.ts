import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { shuffle } from "./shuffle";
import { isSessionExpired, markSessionExpired } from "./expiry";

const questionOrderSchema = z.object({
  questions: z.array(z.string()),
  answers: z.record(z.string(), z.array(z.string())),
});

type QuestionOrder = z.infer<typeof questionOrderSchema>;

const EMPTY_ORDER: QuestionOrder = { questions: [], answers: {} };

function parseQuestionOrder(value: unknown): QuestionOrder {
  const parsed = questionOrderSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_ORDER;
}

export type PlayableAnswer = { id: string; text: string };

export type PlayableQuestion = {
  id: string;
  type: "multiple_choice" | "true_false";
  text: string;
  position: number;
  answers: PlayableAnswer[];
  selectedAnswerId: string | null;
};

export type ActiveSession = {
  sessionToken: string;
  quizTitle: string;
  participantFirstName: string;
  expiresAt: string;
  serverNow: string;
  totalQuestions: number;
  questions: PlayableQuestion[];
};

export type SessionView =
  | { state: "not_found" }
  | { state: "expired"; quizTitle: string; participantFirstName: string }
  | { state: "completed"; quizTitle: string; participantFirstName: string }
  | { state: "active"; session: ActiveSession };

type SessionRow = {
  id: string;
  quiz_id: string;
  status: string;
  expires_at: string;
  question_order: unknown;
  total_questions: number;
  quizzes: { title: string; status: string } | null;
  participants: { first_name: string } | null;
};

/**
 * Generates this session's one-time question/answer shuffle and persists it
 * to `quiz_sessions.question_order` — the column exists precisely for this
 * (see docs/database.md). The `.eq("status", currentStatus)` guard makes
 * the write a compare-and-swap on the plain text `status` column (a jsonb
 * equality filter has its own PostgREST quirks, so a CAS on `status` is
 * both simpler and exactly as sufficient — status only ever moves forward
 * together with this write): if two requests race (e.g. two tabs opened at
 * once), only the first commits — its own UPDATE moves `status` away from
 * `currentStatus` — and the loser's identical filter then matches zero
 * rows, so it re-reads whatever order won. "The same session always sees
 * the same order" holds even under a race, not just in the common case.
 */
async function generateAndPersistOrder(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  quizId: string,
  currentStatus: string
): Promise<QuestionOrder> {
  const { data: questions, error: questionsError } = await admin
    .from("questions")
    .select("id")
    .eq("quiz_id", quizId)
    .order("order_index");

  if (questionsError || !questions || questions.length === 0) {
    console.error("Failed to load questions for shuffle:", questionsError?.message);
    return EMPTY_ORDER;
  }

  const questionIds = questions.map((q) => q.id);

  const { data: answers, error: answersError } = await admin
    .from("answers")
    .select("id, question_id")
    .in("question_id", questionIds);

  if (answersError || !answers) {
    console.error("Failed to load answers for shuffle:", answersError?.message);
    return EMPTY_ORDER;
  }

  const answersByQuestion: Record<string, string[]> = {};
  for (const questionId of questionIds) {
    answersByQuestion[questionId] = [];
  }
  for (const answer of answers) {
    answersByQuestion[answer.question_id]?.push(answer.id);
  }

  const order: QuestionOrder = {
    questions: shuffle(questionIds),
    answers: Object.fromEntries(
      Object.entries(answersByQuestion).map(([questionId, ids]) => [questionId, shuffle(ids)])
    ),
  };

  const nextStatus = currentStatus === "started" ? "in_progress" : currentStatus;

  const { data: won, error: updateError } = await admin
    .from("quiz_sessions")
    .update({ question_order: order, status: nextStatus })
    .eq("id", sessionId)
    .eq("status", currentStatus)
    .select("question_order")
    .maybeSingle();

  if (updateError) {
    console.error("Failed to persist question order:", updateError.message);
    return order;
  }
  if (won) {
    return parseQuestionOrder(won.question_order);
  }

  // Lost the race — another request already persisted an order. Re-read it.
  const { data: existing } = await admin
    .from("quiz_sessions")
    .select("question_order")
    .eq("id", sessionId)
    .maybeSingle();

  return existing ? parseQuestionOrder(existing.question_order) : order;
}

/**
 * Loads everything the student quiz player needs for one session, keyed
 * only by the opaque `session_token` a student holds — never a raw id, and
 * never anything the browser sends is trusted as an ownership claim. Every
 * relationship (quiz, questions, answers, prior responses) is re-derived
 * from the session row itself. `is_correct` is never read into anything
 * returned here.
 */
export async function loadPlayableSession(sessionToken: string): Promise<SessionView> {
  const admin = createAdminClient();

  const { data: session, error } = await admin
    .from("quiz_sessions")
    .select(
      "id, quiz_id, status, expires_at, question_order, total_questions, quizzes(title, status), participants(first_name)"
    )
    .eq("session_token", sessionToken)
    .maybeSingle()
    .overrideTypes<SessionRow, { merge: false }>();

  if (error) {
    console.error("Failed to load quiz session:", error.message);
    return { state: "not_found" };
  }
  if (!session || !session.quizzes || session.quizzes.status !== "published") {
    return { state: "not_found" };
  }

  const quizTitle = session.quizzes.title;
  const participantFirstName = session.participants?.first_name ?? "Student";

  if (session.status === "completed") {
    return { state: "completed", quizTitle, participantFirstName };
  }

  if (isSessionExpired(session.expires_at)) {
    if (session.status !== "expired") {
      await markSessionExpired(admin, session.id);
    }
    return { state: "expired", quizTitle, participantFirstName };
  }

  let order = parseQuestionOrder(session.question_order);
  if (order.questions.length === 0) {
    order = await generateAndPersistOrder(admin, session.id, session.quiz_id, session.status);
  }
  if (order.questions.length === 0) {
    // The quiz has no questions to shuffle — shouldn't happen for a
    // published quiz (publishing requires at least one), but fail safe.
    return { state: "not_found" };
  }

  const [{ data: questionRows }, { data: answerRows }, { data: responseRows }] = await Promise.all([
    admin
      .from("questions")
      .select("id, type, question_text")
      .in("id", order.questions),
    admin
      .from("answers")
      .select("id, question_id, answer_text")
      .in("question_id", order.questions),
    admin.from("responses").select("question_id, selected_answer_id").eq("session_id", session.id),
  ]);

  const questionById = new Map((questionRows ?? []).map((q) => [q.id, q]));
  const answerById = new Map((answerRows ?? []).map((a) => [a.id, a]));
  const selectedByQuestion = new Map(
    (responseRows ?? []).map((r) => [r.question_id, r.selected_answer_id])
  );

  const questions: PlayableQuestion[] = order.questions.map((questionId, index) => {
    const question = questionById.get(questionId);
    const answerIds = order.answers[questionId] ?? [];
    return {
      id: questionId,
      type: (question?.type as PlayableQuestion["type"]) ?? "multiple_choice",
      text: question?.question_text ?? "",
      position: index + 1,
      answers: answerIds
        .map((answerId) => answerById.get(answerId))
        .filter((a): a is { id: string; question_id: string; answer_text: string } => Boolean(a))
        .map((a) => ({ id: a.id, text: a.answer_text })),
      selectedAnswerId: selectedByQuestion.get(questionId) ?? null,
    };
  });

  return {
    state: "active",
    session: {
      sessionToken,
      quizTitle,
      participantFirstName,
      expiresAt: session.expires_at,
      serverNow: new Date().toISOString(),
      totalQuestions: session.total_questions,
      questions,
    },
  };
}
