import type { ScoreDistributionBucket } from "@/lib/quizzes/analytics";

/**
 * Deliberately not a chart library — five fixed buckets is simple enough
 * that a horizontal bar per bucket, built from plain divs, is both smaller
 * and more directly accessible than pulling in a charting dependency: the
 * count is always rendered as real text next to its bar, never conveyed by
 * height/color alone, so nothing here depends on a screen reader (or a
 * colorblind reader) interpreting the bar itself.
 */
export function ScoreDistributionChart({ distribution }: { distribution: ScoreDistributionBucket[] }) {
  const maxCount = Math.max(1, ...distribution.map((bucket) => bucket.count));

  return (
    <div className="flex flex-col gap-3">
      {distribution.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-muted-foreground">{bucket.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(bucket.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
            {bucket.count}
          </span>
        </div>
      ))}
    </div>
  );
}
