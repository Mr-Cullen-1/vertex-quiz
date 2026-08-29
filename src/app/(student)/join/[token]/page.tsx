import type { Metadata } from "next";
import Image from "next/image";
import { AlertCircle } from "lucide-react";
import { loadPublishedQuizByToken } from "@/lib/student/access";
import { JoinForm } from "./_components/join-form";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata(
  props: PageProps<"/join/[token]">
): Promise<Metadata> {
  const { token } = await props.params;
  const access = await loadPublishedQuizByToken(token);

  return {
    title: access.ok ? `Join — ${access.quiz.title} — Vertex Quiz` : "Join — Vertex Quiz",
  };
}

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const access = await loadPublishedQuizByToken(token);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/brand/logo.png"
            alt="Vertex Studio"
            width={44}
            height={44}
            priority
            className="rounded-lg"
          />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vertex Quiz</h1>
          </div>
        </div>

        {!access.ok ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {access.reason === "expired"
                  ? "This quiz is no longer available."
                  : "This quiz link isn't valid."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {access.reason === "expired"
                  ? "The deadline for this quiz has passed."
                  : "Double-check the link your teacher shared with you."}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">{access.quiz.title}</h2>
            {access.quiz.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{access.quiz.description}</p>
            ) : null}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted px-4 py-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Questions</dt>
                <dd className="font-medium text-foreground">{access.quiz.total_questions}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Multiple Choice</dt>
                <dd className="font-medium text-foreground">{access.quiz.multiple_choice_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">True/False</dt>
                <dd className="font-medium text-foreground">{access.quiz.true_false_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Time limit</dt>
                <dd className="font-medium text-foreground">
                  {access.quiz.duration_minutes
                    ? `${access.quiz.duration_minutes} minutes`
                    : "No time limit"}
                </dd>
              </div>
              {access.quiz.ends_at ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Available until</dt>
                  <dd className="font-medium text-foreground">
                    {formatDateTime(access.quiz.ends_at)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 border-t border-border pt-6">
              <JoinForm token={token} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
