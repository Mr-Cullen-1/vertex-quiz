"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startSession } from "@/lib/student/join-actions";

export function JoinForm({ token }: { token: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not just the `isSubmitting` state: state updates are batched
  // and only reach the DOM's `disabled` attribute on the next render, so
  // two clicks dispatched back-to-back (a fast double-click, or a
  // double-fired form submission) can both start `handleSubmit` before
  // either update paints. A ref mutation is synchronous and visible to
  // the very next invocation immediately, since JS event handlers never
  // interleave — this is what actually makes the second call a no-op.
  const submittingRef = useRef(false);

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    const result = await startSession(token, formData);
    if (!result.success) {
      submittingRef.current = false;
      setIsSubmitting(false);
      setError(result.error);
      return;
    }

    router.push(`/quiz/${result.sessionToken}`);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          name="firstName"
          autoComplete="given-name"
          placeholder="Jamie"
          maxLength={80}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          name="lastName"
          autoComplete="family-name"
          placeholder="Rivera"
          maxLength={80}
          required
          disabled={isSubmitting}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-1 h-10 w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting…
          </>
        ) : (
          "Start Quiz"
        )}
      </Button>
    </form>
  );
}
