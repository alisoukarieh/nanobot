"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";

const BARE_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isBare = BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isBare) return <>{children}</>;

  return (
    <div className="flex h-app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar onMenuClick={() => setSidebarOpen(true)} />
        {/* minmax(0,1fr) lets inner h-full actually compute to container height. */}
        <main className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
