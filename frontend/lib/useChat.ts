"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "./types";

interface UseChatOptions {
  sessionKey: string;
  pageSize?: number;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat({ sessionKey, pageSize = 50 }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlightCursor = useRef<string | null>(null);

  // Initial load: most recent page
  useEffect(() => {
    if (!sessionKey) return;
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    inFlightCursor.current = null;
    fetch(`/api/messages?sessionKey=${encodeURIComponent(sessionKey)}&limit=${pageSize}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || []);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => {
        setMessages([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, [sessionKey, pageSize]);

  // Load older messages (prepend)
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    const oldestCreated = messages[0].created;
    if (inFlightCursor.current === oldestCreated) return; // dedupe
    inFlightCursor.current = oldestCreated;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/messages?sessionKey=${encodeURIComponent(sessionKey)}&before=${encodeURIComponent(oldestCreated)}&limit=${pageSize}`,
      );
      const data = await res.json();
      const older: Message[] = data.messages || [];
      setMessages((prev) => [...older, ...prev]);
      setHasMore(Boolean(data.hasMore));
    } catch {
      // swallow
    } finally {
      setLoadingOlder(false);
    }
  }, [sessionKey, pageSize, messages, loadingOlder, hasMore]);

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

  return { messages, loading, loadingOlder, hasMore, sending, send, loadOlder };
}
