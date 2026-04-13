"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import pb from "./pocketbase";
import type { Message } from "./types";

interface UseChatOptions {
  sessionId: string;
}

export function useChat({ sessionId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const chatIdRef = useRef<string>("");

  // Load existing messages from PocketBase
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    pb.collection("messages")
      .getFullList({ filter: `session = "${sessionId}"`, sort: "created" })
      .then((records) => {
        setMessages(
          records.map((r) => ({
            id: r.id,
            session: r.session,
            role: r.role,
            content: r.content,
            created: r.created,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_NANOBOT_WS_URL || "ws://localhost:8765";
    const token = process.env.NEXT_PUBLIC_NANOBOT_WS_TOKEN || "";
    const url = token ? `${wsUrl}?token=${token}` : wsUrl;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "ready") {
          chatIdRef.current = data.chat_id;
        } else if (data.event === "delta") {
          setStreaming((prev) => prev + data.text);
        } else if (data.event === "stream_end") {
          setStreaming((prev) => {
            if (prev) {
              const assistantMsg: Message = {
                id: crypto.randomUUID(),
                session: sessionId,
                role: "assistant",
                content: prev,
                created: new Date().toISOString(),
              };
              setMessages((msgs) => [...msgs, assistantMsg]);
              // Persist to PocketBase
              pb.collection("messages")
                .create({
                  session: sessionId,
                  role: "assistant",
                  content: prev,
                })
                .catch(() => {});
            }
            return "";
          });
        } else if (data.event === "message") {
          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            session: sessionId,
            role: "assistant",
            content: data.text,
            created: new Date().toISOString(),
          };
          setMessages((msgs) => [...msgs, assistantMsg]);
          pb.collection("messages")
            .create({
              session: sessionId,
              role: "assistant",
              content: data.text,
            })
            .catch(() => {});
        }
      } catch {
        // ignore non-JSON frames
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const send = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        session: sessionId,
        role: "user",
        content: text,
        created: new Date().toISOString(),
      };
      setMessages((msgs) => [...msgs, userMsg]);

      // Persist to PocketBase
      pb.collection("messages")
        .create({ session: sessionId, role: "user", content: text })
        .catch(() => {});

      // Send to nanobot
      wsRef.current.send(JSON.stringify({ content: text }));
    },
    [sessionId]
  );

  return { messages, streaming, connected, loading, send };
}
