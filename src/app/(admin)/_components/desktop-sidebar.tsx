import { SidebarNav } from "./sidebar-nav";

export function DesktopSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border lg:block">
      <SidebarNav />
    </aside>
  );
}
