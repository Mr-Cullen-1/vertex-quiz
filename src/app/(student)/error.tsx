"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Branded fallback for the student join/quiz-taking flow. Before this
 * existed, an unhandled exception here (the actual exam-taking surface)
 * fell through to Next's generic unstyled error page — the worst place
 * for that to happen mid-quiz. `loadPublishedQuizByToken`/
 * `loadPlayableSession` already catch and degrade *expected* Supabase
 * errors to a safe status card instead of throwing (see those files);
 * this is the backstop for anything that isn't one of those.
 */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Student route error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12 text-center">
      <div className="w-full max-w-sm">
        <Image
          src="/brand/logo.png"
          alt="Vertex Studio"
          width={44}
          height={44}
          priority
          className="mx-auto mb-6 rounded-lg"
        />
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please try again. If this keeps happening, ask your teacher for a new link.
          </p>
          <Button onClick={() => reset()} variant="outline" className="mt-5 w-full">
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
