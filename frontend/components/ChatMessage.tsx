"use client";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0 mt-1 mr-2.5">
          <span className="text-white text-[8px] font-bold">nb</span>
        </div>
      )}
      <div
        className={`
          max-w-[80%] sm:max-w-[65%] px-4 py-3 text-[13.5px] leading-[1.65] whitespace-pre-wrap
          ${isUser
            ? "bg-gradient-to-br from-[#059669] to-[#047857] text-white rounded-2xl rounded-br-md shadow-[var(--shadow-sm)]"
            : "bg-[var(--assistant-bg)] text-[var(--text-primary)] rounded-2xl rounded-tl-md border border-[var(--border)] shadow-[var(--shadow-xs)]"
          }
        `}
      >
        {content}
      </div>
    </div>
  );
}
