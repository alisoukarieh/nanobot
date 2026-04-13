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
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3 text-[var(--text-tertiary)] text-sm">
                <div className="w-4 h-4 border-[1.5px] border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
                Loading conversation...
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 gap-4 animate-in">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-glow)] flex items-center justify-center shadow-[var(--shadow-sm)]">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v6M11 13v6M3 11h6M13 11h6" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[var(--text-primary)] text-[15px] font-semibold tracking-[-0.02em]">New conversation</p>
                <p className="text-[var(--text-tertiary)] text-[13px] mt-1">Send a message to get started</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {sending && (
            <div className="flex justify-start animate-in">
              <div className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0 mt-1 mr-2.5">
                <span className="text-white text-[8px] font-bold">nb</span>
              </div>
              <div className="px-4 py-3.5 rounded-2xl rounded-tl-md bg-[var(--assistant-bg)] border border-[var(--border)] flex items-center gap-1">
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0s' }} />
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0.2s' }} />
                <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-4">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message nanobot..."
              disabled={sending}
              className="
                w-full pl-4 pr-12 py-3.5 rounded-2xl text-[14px]
                bg-[var(--input-bg)] border border-[var(--border)]
                text-[var(--text-primary)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)]
                disabled:opacity-40
                transition-all duration-250
              "
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="
                absolute right-2 top-1/2 -translate-y-1/2
                w-8 h-8 rounded-xl flex items-center justify-center
                bg-[var(--accent)] text-white
                hover:brightness-110
                disabled:opacity-20 disabled:cursor-default
                transition-all duration-200
              "
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7l5-5v3.5h6v3H6V12L1 7z" fill="currentColor"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
