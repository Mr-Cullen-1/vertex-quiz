"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root-level fallback — catches an unhandled error in `/` or `/login`
 * (the only routes outside `(admin)`/`(student)`, which each have their
 * own error boundary already). `global-error.tsx` is the one level below
 * this, for an error in the root layout itself.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root route error:", error.message);
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
            Please try again.
          </p>
          <Button onClick={() => reset()} variant="outline" className="mt-5 w-full">
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
