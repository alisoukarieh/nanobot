"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Agent } from "@/lib/types";

interface SidebarProps {
  agents: Agent[];
  activeId: string;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ agents, activeId, open, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const nextTheme = () => {
    const order = ["light", "dark", "system"] as const;
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % 3]);
  };

  const themeLabel = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 lg:w-56 h-screen flex flex-col
          border-r border-[var(--border)] bg-[var(--sidebar-bg)]
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="px-5 py-5 flex items-center justify-between">
          <h1 className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] uppercase">
            nanobot
          </h1>
          <button
            onClick={onClose}
            className="lg:hidden w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {agents.map((agent) => {
            const isActive = agent.id === activeId;
            return (
              <Link
                key={agent.id}
                href={`/agent/${agent.id}/chat`}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-all duration-150
                  ${
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                  }
                `}
              >
                <span
                  className={`
                    w-8 h-8 rounded-[10px] flex items-center justify-center text-xs font-semibold flex-shrink-0
                    ${isActive ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}
                  `}
                >
                  {agent.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{agent.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)] space-y-1">
          <button
            onClick={nextTheme}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-60">
              {theme === "dark" ? (
                <path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3.11 3.11l.71.71M10.18 10.18l.71.71M3.11 10.89l.71-.71M10.18 3.82l.71-.71M10 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              ) : theme === "light" ? (
                <path d="M12.5 8.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              ) : (
                <path d="M2 7a5 5 0 1010 0A5 5 0 002 7zM7 2v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              )}
            </svg>
            {themeLabel}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-60">
              <path d="M5.5 12.5H3a1 1 0 01-1-1v-9a1 1 0 011-1h2.5M9.5 10l3-3-3-3M12.5 7H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
