"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@/lib/useChat";
import { ChatMessage } from "./ChatMessage";

interface ChatPanelProps {
  sessionKey: string;
}

const STICK_TO_BOTTOM_THRESHOLD = 80; // px from bottom
const LOAD_OLDER_THRESHOLD = 120; // px from top

type MicState = "idle" | "recording" | "transcribing";

export function ChatPanel({ sessionKey }: ChatPanelProps) {
  const { messages, loading, loadingOlder, hasMore, sending, send, loadOlder } = useChat({ sessionKey });
  const [input, setInput] = useState("");
  const [mic, setMic] = useState<MicState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const startRecording = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      alert("Microphone not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size === 0) {
          setMic("idle");
          return;
        }
        setMic("transcribing");
        try {
          const form = new FormData();
          const ext = (rec.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
          form.append("file", blob, `audio.${ext}`);
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.text) {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${data.text}` : data.text));
          } else if (!res.ok) {
            alert(data.error || "Transcription failed");
          }
        } catch {
          alert("Transcription failed");
        } finally {
          setMic("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setMic("recording");
    } catch {
      setMic("idle");
      alert("Microphone access denied");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const toggleMic = () => {
    if (mic === "idle") void startRecording();
    else if (mic === "recording") stopRecording();
  };

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-5 pt-4 sm:pt-6 pb-2 space-y-3 sm:space-y-4">
          {hasMore && (
            <div className="flex items-center justify-center py-3">
              {loadingOlder ? (
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">
                  Loading older…
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => loadOlder()}
                  className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border)] px-3 py-1.5 hover:border-[var(--text-primary)] transition-colors"
                >
                  Load older
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">
                Loading conversation…
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 sm:py-32 gap-3 animate-in">
              <div className="w-12 h-12 border border-[var(--text-primary)] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v6M11 13v6M3 11h6M13 11h6" stroke="var(--text-primary)" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="label-spec">§ New session</p>
                <p className="text-[var(--text-tertiary)] text-[12px] mt-2">Send a message to get started</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
          ))}

          {sending && (
            <div className="flex gap-3 animate-in">
              <div className="flex-shrink-0 w-8 pt-[3px]">
                <span className="font-mono text-[9px] font-semibold tracking-[0.15em] text-[var(--text-tertiary)]">NB</span>
              </div>
              <div className="px-3.5 py-3 bg-[var(--assistant-bg)] border border-[var(--border)] flex items-center gap-1.5">
                <span className="w-[4px] h-[4px] bg-[var(--text-secondary)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0s' }} />
                <span className="w-[4px] h-[4px] bg-[var(--text-secondary)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0.2s' }} />
                <span className="w-[4px] h-[4px] bg-[var(--text-secondary)]" style={{ animation: 'dotPulse 1.4s infinite', animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg-primary)] py-2">
        <div className="max-w-4xl mx-auto w-full px-3 sm:px-5">
          <form onSubmit={handleSubmit} className="relative flex">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mic === "recording" ? "Recording…" : mic === "transcribing" ? "Transcribing…" : "Message nanobot..."}
              disabled={sending || mic !== "idle"}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              className="
                flex-1 min-w-0 px-3.5 py-3 text-[16px] sm:text-[13px]
                bg-[var(--input-bg)] border border-[var(--border)] border-r-0
                text-[var(--text-primary)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:border-[var(--accent)]
                disabled:opacity-40
                transition-colors
              "
            />
            <button
              type="button"
              onClick={toggleMic}
              disabled={sending || mic === "transcribing"}
              title={mic === "recording" ? "Stop recording" : mic === "transcribing" ? "Transcribing…" : "Record voice"}
              className={`
                px-3.5 flex items-center justify-center
                border border-[var(--border)] border-r-0
                transition-colors disabled:opacity-40 disabled:cursor-default
                ${mic === "recording" ? "bg-red-500/10 text-red-500" : "bg-[var(--input-bg)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"}
              `}
            >
              {mic === "transcribing" ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="8 20" strokeLinecap="round" />
                </svg>
              ) : mic === "recording" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="2" y="2" width="8" height="8" fill="currentColor" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="5" y="1.5" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 6.5a4 4 0 008 0M7 10.5v2M5 12.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              type="submit"
              disabled={sending || mic !== "idle" || !input.trim()}
              className="
                px-5 flex items-center justify-center gap-2
                bg-[var(--accent)] text-[var(--bg-primary)]
                border border-[var(--accent)]
                hover:bg-[var(--accent-hover)]
                disabled:opacity-25 disabled:cursor-default
                transition-colors
                font-mono text-[10px] font-semibold tracking-[0.2em] uppercase
              "
            >
              Send
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
