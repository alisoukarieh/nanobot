"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Agent } from "@/lib/types";

interface CustomNavItem {
  label: string;
  href: string;
  icon?: string;
}

interface SidebarProps {
  agents: Agent[];
  activeId: string;
  open?: boolean;
  onClose?: () => void;
}

const navIcons: Record<string, React.ReactNode> = {
  Chat: <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H6l-3 2V5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>,
  Files: <path d="M3 2h3.5l1 1H11a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/>,
  MCP: <path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.8 3.8l2.1 2.1M8.1 8.1l2.1 2.1M3.8 10.2l2.1-2.1M8.1 5.9l2.1-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>,
  Records: <><path d="M3 2h8a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 5.5h5M4.5 7.5h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
};

export function Sidebar({ agents, activeId, open, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [customItems, setCustomItems] = useState<CustomNavItem[]>([]);

  useEffect(() => {
    fetch("/api/custom-nav")
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((d) => setCustomItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setCustomItems([]));
  }, []);

  const activeAgent = agents.find(a => a.id === activeId) || agents[0];

  const nextTheme = () => {
    const order = ["light", "dark", "system"] as const;
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % 3]);
  };

  const themeIcon = theme === "dark" ? (
    <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.75 2.75l1.06 1.06M9.19 9.19l1.06 1.06M2.75 11.25l1.06-1.06M9.19 4.81l1.06-1.06M9.5 7a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  ) : theme === "light" ? (
    <path d="M11.5 8a4.5 4.5 0 01-6-6 4.5 4.5 0 106 6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  ) : (
    <><path d="M2 7a5 5 0 1010 0A5 5 0 002 7z" stroke="currentColor" strokeWidth="1.2"/><path d="M7 2v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>
  );

  const coreNav = activeAgent ? [
    { label: "Chat", href: `/agent/${activeAgent.id}/chat` },
    { label: "Files", href: `/agent/${activeAgent.id}/files` },
    { label: "MCP", href: `/agent/${activeAgent.id}/mcp` },
  ] : [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-[260px] lg:w-[220px] h-screen flex flex-col
        border-r border-[var(--border)] bg-[var(--sidebar-bg)] glass relative noise
        transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]
        ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="px-5 pt-6 pb-4 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <span className="text-white text-[11px] font-bold tracking-tight">nb</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-[-0.02em]">
              nanobot
            </span>
          </div>
          <button onClick={onClose} className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-all">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {activeAgent && (
          <div className="px-4 pb-3 relative z-10">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-[var(--bg-tertiary)]/50">
              <span className="w-7 h-7 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                {activeAgent.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                  {activeAgent.name}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Active agent</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 relative z-10">
          <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em] px-2.5 py-2">Workspace</p>
          {coreNav.map((item, i) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{ animationDelay: `${i * 30}ms` }}
                className={`
                  animate-in flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-200
                  ${isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium shadow-[inset_0_0_0_1px_var(--accent-glow)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 hover:text-[var(--text-primary)]"
                  }
                `}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 opacity-80">
                  {navIcons[item.label]}
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {customItems.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.08em] px-2.5 pt-4 pb-2">Custom</p>
              {customItems.map((item, i) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    style={{ animationDelay: `${i * 30}ms` }}
                    className={`
                      animate-in flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] transition-all duration-200
                      ${isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium shadow-[inset_0_0_0_1px_var(--accent-glow)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 hover:text-[var(--text-primary)]"
                      }
                    `}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 opacity-80">
                      {navIcons[item.icon || item.label] || navIcons.Records}
                    </svg>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)] space-y-0.5 relative z-10">
          <button onClick={nextTheme} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 transition-all">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-50">{themeIcon}</svg>
            {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
          </button>
          <button onClick={logout} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/60 transition-all">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-50">
              <path d="M5.5 12.5H3a1 1 0 01-1-1v-9a1 1 0 011-1h2.5M9.5 10l3-3-3-3M12.5 7H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
