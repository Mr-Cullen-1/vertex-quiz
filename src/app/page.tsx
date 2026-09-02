import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileUp,
  Sparkles,
  ClipboardCheck,
  Send,
  Users,
  BarChart3,
  LogIn,
  ArrowRight,
} from "lucide-react";

const PIPELINE = [
  {
    icon: FileUp,
    title: "PDF upload",
    description: "Teacher uploads a structured educational PDF.",
  },
  {
    icon: Sparkles,
    title: "AI extraction",
    description: "Gemini extracts and structures draft questions.",
  },
  {
    icon: ClipboardCheck,
    title: "Teacher review",
    description: "Teacher edits and approves every question.",
  },
  {
    icon: Send,
    title: "Publish",
    description: "Quiz gets a shareable URL and access code.",
  },
  {
    icon: Users,
    title: "Student session",
    description: "Students join, answer, and submit in real time.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Teacher sees scores, results, and question stats.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/brand/logo.png"
              alt="Vertex Studio"
              width={36}
              height={36}
              priority
              className="shrink-0 rounded-md"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">
                Vertex Quiz
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Vertex Studio
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-11 shrink-0"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            <LogIn className="size-4" />
            Teacher Login
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-6">
        <section className="flex flex-col gap-4">
          <Badge variant="outline" className="w-fit text-muted-foreground">
            AI-drafted, teacher-approved
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            Turn a PDF into a quiz your students can take in minutes.
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Vertex Quiz drafts questions from your course material with AI,
            you review and approve every one of them, then publish a quiz
            students join with just a name and a code.
          </p>
          <div>
            <Button
              size="lg"
              className="h-11 w-full sm:w-auto"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              Get started as a teacher
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map(({ icon: Icon, title, description }) => (
            <Card key={title} size="sm">
              <CardHeader>
                <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4.5" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Vertex Studio</span>
          <span>Teachers sign in from the login page to get started.</span>
        </div>
      </footer>
    </div>
  );
}
