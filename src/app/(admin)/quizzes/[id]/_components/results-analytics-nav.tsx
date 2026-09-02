import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "analytics", label: "Analytics", href: (quizId: string) => `/quizzes/${quizId}/analytics` },
  { key: "results", label: "Results", href: (quizId: string) => `/quizzes/${quizId}/results` },
] as const;

/**
 * The obvious way to move between the aggregate view (Analytics, Phase 9)
 * and the detailed per-student table (Results, Phase 8) — they're
 * deliberately two separate pages, not two competing systems, so this is
 * the one thing tying them together as siblings.
 */
export function ResultsAnalyticsNav({
  quizId,
  active,
}: {
  quizId: string;
  active: "results" | "analytics";
}) {
  return (
    <nav className="flex gap-4 border-b border-border" aria-label="Results and analytics">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(quizId)}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "border-b-2 px-0.5 pb-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring/50",
            tab.key === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
