export type BarChartDatum = {
  label: string;
  value: number;
  /** Pre-formatted display text, e.g. "82%" or "12". Falls back to the raw value. */
  valueLabel?: string;
};

/**
 * A small, dependency-free horizontal bar chart: real text labels/values
 * (never color-only), a native `title` tooltip per row, and no JS
 * measurement — the bar width is a plain CSS percentage, so it reflows
 * correctly at any viewport without a resize observer or a charting
 * library. Intentionally minimal: this is a compact "at a glance" chart
 * for My Quizzes/Results, not the dedicated Analytics page.
 */
export function HorizontalBarChart({ data }: { data: BarChartDatum[] }) {
  const scaleMax = Math.max(1, ...data.map((d) => d.value));

  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => {
        // A nonzero value always renders a visible sliver of a bar (never
        // truly 0-width) so "some activity" stays visually distinguishable
        // from "no activity" even at the low end of the scale.
        const widthPercent = d.value > 0 ? Math.max((d.value / scaleMax) * 100, 4) : 0;
        const displayValue = d.valueLabel ?? String(d.value);

        return (
          <li
            key={d.label}
            title={`${d.label}: ${displayValue}`}
            className="flex items-center gap-3"
          >
            <span className="w-20 shrink-0 truncate text-xs text-muted-foreground sm:w-32">
              {d.label}
            </span>
            <span className="h-2 min-w-0 flex-1 rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${widthPercent}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
              {displayValue}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
