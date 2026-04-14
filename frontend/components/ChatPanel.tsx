"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatMessage } from "./ChatMessage";

interface ChatPanelProps {
  sessionKey: string;
}

const STICK_TO_BOTTOM_THRESHOLD = 80; // px from bottom
const LOAD_OLDER_THRESHOLD = 120; // px from top

export function ChatPanel({ sessionKey }: ChatPanelProps) {
  const { messages, loading, loadingOlder, hasMore, sending, send, loadOlder } = useChat({ sessionKey });
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Whether the user is "stuck" to the bottom (we auto-scroll on new messages only when true)
  const stickToBottomRef = useRef(true);
  // Snapshot used to preserve viewport position when prepending older messages
  const prependSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const oldestIdRef = useRef<string | null>(null);

  // Track scroll position; toggle stickiness, request older when near top
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom <= STICK_TO_BOTTOM_THRESHOLD;
    if (el.scrollTop <= LOAD_OLDER_THRESHOLD && hasMore && !loadingOlder) {
      // Snapshot before older messages get prepended
      prependSnapshotRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      void loadOlder();
    }
  };

  // After older messages are prepended, restore scroll position so the viewport doesn't jump
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    const newOldestId = messages[0].id;
    if (oldestIdRef.current && newOldestId !== oldestIdRef.current && prependSnapshotRef.current) {
      const { scrollHeight, scrollTop } = prependSnapshotRef.current;
      const delta = el.scrollHeight - scrollHeight;
      el.scrollTop = scrollTop + delta;
      prependSnapshotRef.current = null;
    }
    oldestIdRef.current = newOldestId;
  }, [messages]);

  // Auto-scroll to bottom only when user is already near bottom
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // On initial load, jump to bottom (no smooth)
  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
  }, [loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    stickToBottomRef.current = true; // always pin to bottom when user sends
    send(text);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-5">
          {hasMore && (
            <div className="flex items-center justify-center py-3">
              {loadingOlder ? (
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-xs">
                  <div className="w-3 h-3 border-[1.5px] border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
                  Loading older messages...
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => loadOlder()}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                >
                  Load older messages
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3 text-[var(--text-tertiary)] text-sm">
                <div className="w-4 h-4 border-[1.5px] border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
                Loading conversation...
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 sm:py-32 gap-4 animate-in">
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
        <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message nanobot..."
              disabled={sending}
              className="
                w-full pl-4 pr-12 py-3 sm:py-3.5 rounded-2xl text-[14px]
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
