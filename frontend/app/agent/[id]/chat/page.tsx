"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Session } from "@/lib/types";
import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [sessionId, setSessionId] = useState<string>("");

  // Get or create a session for this agent
  useEffect(() => {
    if (!agentId) return;

    pb.collection("sessions")
      .getFirstListItem<Session>(`agent = "${agentId}"`, { sort: "-updated" })
      .then((session) => setSessionId(session.id))
      .catch(() => {
        // No session exists, create one
        pb.collection("sessions")
          .create({ agent: agentId, title: "New chat" })
          .then((session) => setSessionId(session.id))
          .catch(() => {});
      });
  }, [agentId]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      </div>
    );
  }

  return <ChatPanel sessionId={sessionId} />;
}
