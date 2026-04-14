"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Agent } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pb.collection("agents")
      .getFullList<Agent>({ sort: "name" })
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && agents.length > 0) {
      const page = connected ? `mcp?connected=${encodeURIComponent(connected)}` : "chat";
      router.replace(`/agent/${agents[0].id}/${page}`);
    }
  }, [loading, agents, router, connected]);

  return (
    <main className="h-full flex items-center justify-center bg-[var(--bg-secondary)]">
      {loading ? (
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      ) : agents.length === 0 ? (
        <div className="text-center space-y-3">
          <p className="text-[var(--text-secondary)] text-lg font-medium">
            No agents yet
          </p>
          <p className="text-[var(--text-tertiary)] text-sm">
            Create an agent in PocketBase to get started.
          </p>
        </div>
      ) : null}
    </main>
  );
}
