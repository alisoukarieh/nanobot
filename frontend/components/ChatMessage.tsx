"use client";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";
  const label = isUser ? "YOU" : "NB";

  return (
    <div className="animate-in flex gap-3">
      <div className="flex-shrink-0 w-8 pt-[3px]">
        <span className="font-mono text-[9px] font-semibold tracking-[0.15em] text-[var(--text-tertiary)]">
          {label}
        </span>
      </div>
      <div
        className={`
          flex-1 min-w-0 px-3.5 py-2.5 text-[13px] leading-[1.65]
          whitespace-pre-wrap break-words border
          ${isUser
            ? "bg-[var(--user-bubble)] text-[var(--user-bubble-text)] border-[var(--user-bubble)]"
            : "bg-[var(--assistant-bg)] text-[var(--text-primary)] border-[var(--border)]"
          }
        `}
      >
        {content}
      </div>
    </div>
  );
}
