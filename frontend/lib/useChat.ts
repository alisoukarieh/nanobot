"use client";

import { useCallback, useEffect, useState } from "react";
import pb from "./pocketbase";
import type { Message } from "./types";

interface UseChatOptions {
  sessionKey: string;
}

export function useChat({ sessionKey }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Load existing messages from PocketBase by session key
  useEffect(() => {
    if (!sessionKey) return;
    setLoading(true);

    (async () => {
      try {
        const session = await pb
          .collection("sessions")
          .getFirstListItem(`key = "${sessionKey}"`);

        const records = await pb.collection("messages").getFullList({
          filter: `session = "${session.id}"`,
          sort: "created",
        });

        setMessages(
          records.map((r) => ({
            id: r.id,
            session: r.session,
            role: r.role as Message["role"],
            content: r.content,
            created: r.created,
          })),
        );
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionKey]);

  const send = useCallback(
    async (text: string) => {
      if (sending) return;

      const userMsg: Message = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        session: "",
        role: "user",
        content: text,
        created: new Date().toISOString(),
      };
      setMessages((msgs) => [...msgs, userMsg]);
      setSending(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: text }],
          }),
        });

        const data = await res.json();
        const content =
          data.choices?.[0]?.message?.content || data.error?.message || "No response";

        setMessages((msgs) => [
          ...msgs,
          {
            id: Math.random().toString(36).slice(2) + Date.now().toString(36),
            session: "",
            role: "assistant",
            content,
            created: new Date().toISOString(),
          },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            id: Math.random().toString(36).slice(2) + Date.now().toString(36),
            session: "",
            role: "assistant",
            content: "Failed to connect to agent.",
            created: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  return { messages, loading, sending, send };
}
