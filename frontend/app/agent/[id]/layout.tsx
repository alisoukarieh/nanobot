"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Agent } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const agentId = params.id as string;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    pb.collection("agents")
      .getFullList<Agent>({ sort: "name" })
      .then(setAgents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!agentId) return;
    pb.collection("agents")
      .getOne<Agent>(agentId)
      .then(setAgent)
      .catch(() => {});
  }, [agentId]);

  return (
    <div className="flex h-screen">
      <Sidebar
        agents={agents}
        activeId={agentId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar
          agentId={agentId}
          agentName={agent?.name || ""}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
