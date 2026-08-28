"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quizzes", label: "My Quizzes", icon: ClipboardList },
  { href: "/results", label: "Results", icon: BarChart3 },
] as const;

function navLinkClasses(active: boolean) {
  return cn(
    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-5">
        <Image
          src="/brand/logo.png"
          alt="Vertex Studio"
          width={28}
          height={28}
          className="rounded-md"
        />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-sidebar-foreground">
            Vertex Quiz
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">
            Vertex Studio
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={navLinkClasses(active)}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border px-3 py-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={navLinkClasses(pathname === "/settings")}
          aria-current={pathname === "/settings" ? "page" : undefined}
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className={cn(navLinkClasses(false), "w-full text-left")}
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
