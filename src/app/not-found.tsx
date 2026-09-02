import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found — Vertex Quiz",
};

/**
 * The one not-found page for the whole app — catches every `notFound()`
 * call across `/quizzes/[id]*` (a nonexistent or another teacher's quiz
 * id, indistinguishable by design — see those pages) as well as any
 * genuinely mistyped URL. Deliberately generic: this can be reached by a
 * signed-in teacher, a signed-out visitor, or a student, so it never
 * assumes which and only links back to the public landing page.
 */
export default function NotFound() {
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
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
          <Button className="mt-5 w-full" nativeButton={false} render={<Link href="/" />}>
            Go to homepage
          </Button>
        </div>
      </div>
    </div>
  );
}
