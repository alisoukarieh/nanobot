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
    async (text: string, model?: string) => {
      if (sending) return;

      const assistantId = uid();
      setMessages((msgs) => [
        ...msgs,
        { id: uid(), session: "", role: "user", content: text, created: new Date().toISOString() },
      ]);
      setSending(true);

      const appendAssistant = (content: string) => {
        setMessages((msgs) => [
          ...msgs,
          { id: assistantId, session: "", role: "assistant", content, created: new Date().toISOString() },
        ]);
      };
      const updateAssistant = (updater: (prev: string) => string) => {
        setMessages((msgs) => {
          const idx = msgs.findIndex((m) => m.id === assistantId);
          if (idx < 0) {
            return [
              ...msgs,
              {
                id: assistantId,
                session: "",
                role: "assistant",
                content: updater(""),
                created: new Date().toISOString(),
              },
            ];
          }
          const next = msgs.slice();
          next[idx] = { ...next[idx], content: updater(next[idx].content) };
          return next;
        });
      };

      try {
        const body: Record<string, unknown> = {
          messages: [{ role: "user", content: text }],
          stream: true,
        };
        if (model && model.trim()) body.model = model.trim();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const contentType = res.headers.get("content-type") || "";
        if (!res.ok || !contentType.includes("text/event-stream") || !res.body) {
          // Fallback: non-streaming JSON response (error or older server)
          const data = await res.json().catch(() => ({}));
          const content =
            data.choices?.[0]?.message?.content || data.error?.message || "No response";
          appendAssistant(content);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let firstDelta = true;
        let errorMessage = "";
        let doneSignal = false;

        while (!doneSignal) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);

            // An SSE event may carry multiple data: lines — concat them.
            const dataLines = rawEvent
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length === 0) continue;
            const payload = dataLines.join("\n");
            if (payload === "[DONE]") {
              doneSignal = true;
              break;
            }

            let event: any;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event?.error?.message) {
              errorMessage = event.error.message;
              continue;
            }

            const delta = event?.choices?.[0]?.delta;
            if (!delta) continue;

            // A role marker signals a fresh assistant turn (or a tool-call
            // round boundary); reset any buffered pre-tool content.
            if (typeof delta.role === "string") {
              updateAssistant(() => "");
              continue;
            }

            if (typeof delta.content === "string" && delta.content.length > 0) {
              if (firstDelta) {
                firstDelta = false;
                setSending(false);
              }
              updateAssistant((prev) => prev + delta.content);
            }
          }
        }

        if (errorMessage) {
          updateAssistant(() => errorMessage);
        }
      } catch {
        updateAssistant(() => "Failed to connect.");
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  return { messages, loading, loadingOlder, hasMore, sending, send, loadOlder };
}
