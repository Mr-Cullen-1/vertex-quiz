import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/actions";
import { MobileNav } from "./mobile-nav";
import { PageTitle } from "./page-title";

export function Header({
  teacherEmail,
  teacherName,
}: {
  teacherEmail: string;
  teacherName: string | null;
}) {
  const displayName = teacherName?.trim() || teacherEmail;
  const initial = (displayName || "?").charAt(0).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-8">
      <div className="flex items-center gap-2">
        <MobileNav />
        <PageTitle />
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm leading-tight font-medium text-foreground">
            {displayName}
          </p>
          {teacherName ? (
            <p className="text-xs leading-tight text-muted-foreground">
              {teacherEmail}
            </p>
          ) : null}
        </div>
        <div
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
        >
          {initial}
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
