"use client";

import { useCallback, useEffect, useState } from "react";
import pb from "./pocketbase";
import type { Message } from "./types";

interface UseChatOptions {
  sessionKey: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_NANOBOT_API_URL || "http://localhost:8900";
const API_KEY = process.env.NEXT_PUBLIC_NANOBOT_API_KEY || "";

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
        // Find session by key
        const session = await pb
          .collection("sessions")
          .getFirstListItem(`key = "${sessionKey}"`);

        // Load messages for this session
        const records = await pb.collection("messages").getFullList({
          filter: `session = "${session.id}"`,
          sort: "position,created",
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
        // No session yet — that's fine
        setMessages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionKey]);

  const send = useCallback(
    async (text: string) => {
      if (sending) return;

      // Add user message to UI immediately
      const userMsg: Message = {
        id: crypto.randomUUID(),
        session: "",
        role: "user",
        content: text,
        created: new Date().toISOString(),
      };
      setMessages((msgs) => [...msgs, userMsg]);
      setSending(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (API_KEY) {
          headers["Authorization"] = `Bearer ${API_KEY}`;
        }

        const res = await fetch(`${API_URL}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [{ role: "user", content: text }],
          }),
        });

        const data = await res.json();
        const content =
          data.choices?.[0]?.message?.content || data.error?.message || "";

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          session: "",
          role: "assistant",
          content,
          created: new Date().toISOString(),
        };
        setMessages((msgs) => [...msgs, assistantMsg]);
      } catch (err) {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          session: "",
          role: "assistant",
          content: "Failed to connect to agent.",
          created: new Date().toISOString(),
        };
        setMessages((msgs) => [...msgs, errorMsg]);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  return { messages, loading, sending, send };
}
