"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { Agent } from "@/lib/types";

interface SidebarProps {
  agents: Agent[];
  activeId: string;
}

export function Sidebar({ agents, activeId }: SidebarProps) {
  const { logout } = useAuth();

  return (
    <aside className="w-56 h-screen flex flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="px-5 py-4">
        <h1 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          nanobot
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {agents.map((agent) => {
          const isActive = agent.id === activeId;
          return (
            <Link
              key={agent.id}
              href={`/agent/${agent.id}/chat`}
              className={`
                flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors
                ${
                  isActive
                    ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                }
              `}
            >
              <span className="w-7 h-7 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
                {agent.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{agent.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[var(--border)] space-y-2">
        <button
          onClick={logout}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
        >
          Sign out
        </button>
        <p className="text-[10px] text-[var(--text-tertiary)] px-2.5">v0.1.5</p>
      </div>
    </aside>
  );
}
