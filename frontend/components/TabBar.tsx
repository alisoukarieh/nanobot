"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabBarProps {
  agentId: string;
  agentName: string;
  onMenuClick?: () => void;
}

export function TabBar({ agentId, agentName, onMenuClick }: TabBarProps) {
  const pathname = usePathname();
  const tabs = [
    { label: "Chat", href: `/agent/${agentId}/chat` },
    { label: "Files", href: `/agent/${agentId}/files` },
    { label: "MCP", href: `/agent/${agentId}/mcp` },
  ];

  return (
    <div className="h-12 flex items-center gap-4 px-4 border-b border-[var(--border)] bg-[var(--topbar-bg)]">
      <button
        onClick={onMenuClick}
        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
        {agentName}
      </span>

      <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150
                ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }
              `}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
