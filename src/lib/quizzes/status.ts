export type QuizStatus = "draft" | "published" | "closed";

export const QUIZ_STATUS_LABEL: Record<QuizStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};
