"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabBarProps {
  agentId: string;
  agentName: string;
  onMenuClick?: () => void;
}

const tabIcons: Record<string, React.ReactNode> = {
  Chat: <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H6l-3 2V5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>,
  Files: <path d="M3 2h3.5l1 1H11a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2"/>,
  MCP: <path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.8 3.8l2.1 2.1M8.1 8.1l2.1 2.1M3.8 10.2l2.1-2.1M8.1 5.9l2.1-2.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>,
};

export function TabBar({ agentId, agentName, onMenuClick }: TabBarProps) {
  const pathname = usePathname();
  const tabs = [
    { label: "Chat", href: `/agent/${agentId}/chat` },
    { label: "Files", href: `/agent/${agentId}/files` },
    { label: "MCP", href: `/agent/${agentId}/mcp` },
  ];

  return (
    <div className="h-[52px] flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--topbar-bg)] glass relative noise">
      <button onClick={onMenuClick} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <div className="w-5 h-5 rounded-md bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[8px] font-bold">{agentName?.charAt(0)?.toUpperCase()}</span>
        </div>
        <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate tracking-[-0.02em]">
          {agentName}
        </span>
      </div>

      <div className="hidden sm:block w-px h-5 bg-[var(--border-strong)] mx-1" />

      <div className="flex items-center gap-0.5 ml-auto sm:ml-0">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200
                ${isActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-glow)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }
              `}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-70">{tabIcons[tab.label]}</svg>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
