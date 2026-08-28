"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/quizzes": "My Quizzes",
  "/results": "Results",
  "/settings": "Settings",
};

export function PageTitle() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? "Vertex Quiz";

  return (
    <h1 className="text-sm font-semibold text-foreground lg:text-base">
      {title}
    </h1>
  );
}
