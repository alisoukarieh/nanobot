"use client";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${
            isUser
              ? "bg-[var(--accent)] text-white rounded-br-md"
              : "bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-md"
          }
        `}
      >
        {content}
      </div>
    </div>
  );
}
