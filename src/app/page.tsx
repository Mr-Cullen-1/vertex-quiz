import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-sm font-semibold">V</span>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">
                Vertex Quiz
              </p>
              <p className="text-xs text-muted-foreground">Vertex Studio</p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="bg-ai/10 text-ai border-ai/20 gap-1.5"
          >
            <Sparkles className="size-3" />
            AI-powered
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-16">
        <section className="flex flex-col gap-4">
          <Badge variant="outline" className="w-fit text-muted-foreground">
            Building in progress — Phase 0
          </Badge>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Turn a PDF into a quiz your students can take in minutes.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Vertex Quiz drafts questions from your course material with AI,
            you review and approve every one of them, then publish a quiz
            students join with just a name and a code.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border shadow-none">
              <CardHeader>
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                  <Icon className="size-4.5" />
                </div>
                <CardTitle className="pt-1.5 text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Vertex Studio</span>
          <span>MVP under active development</span>
        </div>
      </footer>
    </div>
  );
}
