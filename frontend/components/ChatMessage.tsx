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
          max-w-[85%] sm:max-w-[70%] px-4 py-3 text-[13px] leading-[1.6] whitespace-pre-wrap
          ${
            isUser
              ? "bg-[var(--user-bubble)] text-[var(--user-bubble-text)] rounded-2xl rounded-br-lg"
              : "bg-[var(--assistant-bubble)] text-[var(--assistant-bubble-text)] rounded-2xl rounded-bl-lg"
          }
        `}
      >
        {content}
      </div>
    </div>
  );
}
