"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatMessage } from "./ChatMessage";

interface ChatPanelProps {
  sessionKey: string;
}

export function ChatPanel({ sessionKey }: ChatPanelProps) {
  const { messages, loading, sending, send } = useChat({ sessionKey });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send(text);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading && (
          <p className="text-center text-[var(--text-tertiary)] text-xs py-8">
            Loading messages...
          </p>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--text-tertiary)] text-sm">
              Start a conversation
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[var(--bg-secondary)] text-[var(--text-tertiary)] text-sm">
              ...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t border-[var(--border)]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            disabled={sending}
            className="
              flex-1 px-4 py-2.5 rounded-xl text-sm
              bg-[var(--bg-secondary)] border border-[var(--border)]
              placeholder:text-[var(--text-tertiary)]
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30 focus:border-[var(--accent)]
              disabled:opacity-50
              transition-shadow
            "
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="
              px-4 py-2.5 rounded-xl text-sm font-medium
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-30 disabled:cursor-default
              transition-colors
            "
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
