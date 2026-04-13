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
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 13.5l1.5-4.5L12 3l3 3-7.5 7.5-4.5 1.5z" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[var(--text-tertiary)] text-sm">Start a conversation</p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl rounded-bl-lg bg-[var(--assistant-bubble)] text-[var(--text-tertiary)] text-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse [animation-delay:0.3s]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-4 sm:px-6 py-3 border-t border-[var(--border)]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            disabled={sending}
            className="
              flex-1 px-4 py-2.5 rounded-xl text-[13px]
              bg-[var(--input-bg)] border border-[var(--border)]
              text-[var(--text-primary)]
              placeholder:text-[var(--text-tertiary)]
              focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent
              disabled:opacity-50
              transition-all duration-150
            "
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="
              w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-25 disabled:cursor-default
              transition-all duration-150
            "
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 8h11M8.5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
