"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message } from "./types";

interface UseChatOptions {
  sessionKey: string;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat({ sessionKey }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Load messages from server-side API route
  useEffect(() => {
    if (!sessionKey) return;
    setLoading(true);
    fetch(`/api/messages?sessionKey=${encodeURIComponent(sessionKey)}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [sessionKey]);

  const send = useCallback(
    async (text: string) => {
      if (sending) return;

      setMessages((msgs) => [
        ...msgs,
        { id: uid(), session: "", role: "user", content: text, created: new Date().toISOString() },
      ]);
      setSending(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
        });
        const data = await res.json();
        const content =
          data.choices?.[0]?.message?.content || data.error?.message || "No response";

        setMessages((msgs) => [
          ...msgs,
          { id: uid(), session: "", role: "assistant", content, created: new Date().toISOString() },
        ]);
      } catch {
        setMessages((msgs) => [
          ...msgs,
          { id: uid(), session: "", role: "assistant", content: "Failed to connect.", created: new Date().toISOString() },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  return { messages, loading, sending, send };
}
