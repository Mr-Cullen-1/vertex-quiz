import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { QuestionAnalytics } from "@/lib/quizzes/analytics";

const TYPE_LABEL: Record<QuestionAnalytics["type"], string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True/False",
};

/**
 * Thresholds from the task spec — restrained tones on purpose (no red):
 * "Difficult" still needs to read as attention-worthy, not alarming.
 */
function difficultyBadge(successRate: number | null) {
  if (successRate == null) {
    return <Badge variant="outline">No data</Badge>;
  }
  if (successRate >= 90) {
    return (
      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
        Very easy
      </Badge>
    );
  }
  if (successRate >= 70) {
    return <Badge variant="secondary">Good</Badge>;
  }
  if (successRate >= 50) {
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
        Needs attention
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-warning/40 bg-warning/20 text-warning">
      Difficult
    </Badge>
  );
}

function QuestionCard({ question }: { question: QuestionAnalytics }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            Question {question.position} · {TYPE_LABEL[question.type]}
          </p>
          <p className="mt-0.5 text-sm font-medium text-balance text-foreground">{question.text}</p>
        </div>
        <div className="shrink-0">{difficultyBadge(question.successRate)}</div>
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">Correct</dt>
          <dd className="text-sm font-semibold tabular-nums text-success">{question.correct}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Incorrect</dt>
          <dd className="text-sm font-semibold tabular-nums text-destructive">{question.incorrect}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Unanswered</dt>
          <dd className="text-sm font-semibold tabular-nums text-muted-foreground">
            {question.unanswered}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Success rate</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {question.successRate != null ? `${question.successRate}%` : "—"}
          </dd>
        </div>
      </dl>

      {question.options.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          {question.options.map((option) => (
            <span
              key={option.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                option.isCorrect ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
              )}
              title={option.isCorrect ? "Correct answer" : undefined}
            >
              {option.isCorrect ? <Check className="size-3" /> : null}
              {option.label} — {option.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QuestionPerformance({ questions }: { questions: QuestionAnalytics[] }) {
  return (
    <div className="flex flex-col gap-3">
      {questions.map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
    </div>
  );
}
