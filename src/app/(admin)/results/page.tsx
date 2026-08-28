import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";

export const metadata: Metadata = {
  title: "Results — Vertex Quiz",
};

export default async function ResultsPage() {
  const supabase = await createClient();
  const { count: sessionCount, error } = await supabase
    .from("quiz_sessions")
    .select("*", { count: "exact", head: true });

  assertNoError(error, "Failed to load results");

  const hasSessions = (sessionCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Results</h2>
        <p className="text-sm text-muted-foreground">
          Participant results across every quiz you&apos;ve published.
        </p>
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        {hasSessions ? (
          <p className="text-sm text-muted-foreground">
            {sessionCount} session{sessionCount === 1 ? "" : "s"} recorded.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No results yet
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Once you publish a quiz and students complete it, their
                results will show up here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
