"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabBarProps {
  agentId: string;
  agentName: string;
}

export function TabBar({ agentId, agentName }: TabBarProps) {
  const pathname = usePathname();
  const tabs = [
    { label: "Chat", href: `/agent/${agentId}/chat` },
    { label: "Files", href: `/agent/${agentId}/files` },
    { label: "MCP", href: `/agent/${agentId}/mcp` },
  ];

  return (
    <div className="h-11 flex items-center gap-6 px-5 border-b border-[var(--border)] bg-[var(--bg-primary)]">
      <span className="text-sm font-medium text-[var(--text-primary)] mr-2">
        {agentName}
      </span>
      <div className="flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${
                  isActive
                    ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
