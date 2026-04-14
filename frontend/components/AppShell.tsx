"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Agent } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";

// Routes that render their own chrome (no sidebar).
const BARE_ROUTES = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const params = useParams();
  const routeAgentId = (params?.id as string) || "";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isBare = BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    if (isBare) return;
    pb.collection("agents")
      .getFullList<Agent>({ sort: "name" })
      .then(setAgents)
      .catch(() => {});
  }, [isBare]);

  if (isBare) return <>{children}</>;

  const activeId = routeAgentId || agents[0]?.id || "";
  const activeName =
    agents.find((a) => a.id === activeId)?.name || agents[0]?.name || "";

  return (
    <div className="flex h-screen">
      <Sidebar
        agents={agents}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar
          agentId={activeId}
          agentName={activeName}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {/* grid-rows-[minmax(0,1fr)] forces the row to shrink to container height instead of
            expanding to content — without it, pages using h-full overflow-y-auto can't scroll. */}
        <main className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
