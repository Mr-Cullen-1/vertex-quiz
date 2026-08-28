import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DesktopSidebar } from "./_components/desktop-sidebar";
import { Header } from "./_components/header";

/**
 * Protects every route under this group. `src/proxy.ts` already redirects
 * unauthenticated requests optimistically, but that check only reads the
 * cookie — this re-verifies server-side on every request regardless, per
 * the Next.js Data Access Layer guidance (never trust the proxy alone).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const { claims } = data;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", claims.sub)
    .maybeSingle();

  // Errors thrown from a layout aren't caught by this segment's own
  // error.tsx (it only wraps `children`), so a failed profile lookup here
  // degrades to the teacher's email — real data from the verified JWT, not
  // a fake placeholder — rather than crashing the whole shell. The page
  // content below (e.g. Settings) still throws on a query error, which
  // *is* caught by error.tsx.
  if (profileError) {
    console.error("Failed to load teacher profile:", profileError.message);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          teacherEmail={claims.email ?? ""}
          teacherName={profile?.full_name ?? null}
        />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
