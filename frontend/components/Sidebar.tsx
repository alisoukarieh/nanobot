"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

interface CustomNavItem {
  label: string;
  href: string;
  icon?: string;
}

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const navIcons: Record<string, React.ReactNode> = {
  Chat: <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H6l-3 2V5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>,
  Files: <path d="M3 2h3.5l1 1H11a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/>,
  MCP: <path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.8 3.8l2.1 2.1M8.1 8.1l2.1 2.1M3.8 10.2l2.1-2.1M8.1 5.9l2.1-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>,
  Records: <><path d="M3 2h8a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M4.5 5.5h5M4.5 7.5h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>,
};

const CORE_NAV = [
  { label: "Chat", href: "/chat" },
  { label: "Files", href: "/files" },
  { label: "MCP", href: "/mcp" },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [customItems, setCustomItems] = useState<CustomNavItem[]>([]);

  useEffect(() => {
    fetch("/api/custom-nav")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setCustomItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setCustomItems([]));
  }, []);

  const nextTheme = () => {
    const order = ["light", "dark", "system"] as const;
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % 3]);
  };

  const themeIcon =
    theme === "dark" ? (
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.75 2.75l1.06 1.06M9.19 9.19l1.06 1.06M2.75 11.25l1.06-1.06M9.19 4.81l1.06-1.06M9.5 7a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    ) : theme === "light" ? (
      <path d="M11.5 8a4.5 4.5 0 01-6-6 4.5 4.5 0 106 6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    ) : (
      <><path d="M2 7a5 5 0 1010 0A5 5 0 002 7z" stroke="currentColor" strokeWidth="1.2"/><path d="M7 2v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>
    );

  const NavLink = ({ item, index }: { item: { label: string; href: string; icon?: string }; index: number }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    const code = String(index + 1).padStart(2, "0");
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className={`
          group flex items-center gap-3 px-3 py-3 md:py-2.5 text-[12px] transition-colors border-l-2
          ${
            isActive
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
              : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
          }
        `}
      >
        <span className="font-mono text-[9px] font-semibold tracking-[0.15em] text-[var(--text-tertiary)] w-5">
          {code}
        </span>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
          {navIcons[item.icon || item.label] || navIcons.Records}
        </svg>
        <span className="uppercase tracking-[0.1em] text-[11px] font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-[260px] md:w-[220px] h-dvh flex flex-col
          border-r border-[var(--border)] bg-[var(--sidebar-bg)]
          transition-transform duration-200
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="px-4 h-14 flex items-center justify-between border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 border border-[var(--text-primary)] flex items-center justify-center">
              <span className="text-[var(--text-primary)] text-[9px] font-bold tracking-tight font-mono">NB</span>
            </div>
            <span className="text-[12px] font-semibold text-[var(--text-primary)] tracking-[0.15em] uppercase">
              Nanobot
            </span>
          </div>
          <button onClick={onClose} aria-label="Close menu" className="md:hidden w-11 h-11 -mr-2 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <p className="label-spec px-3 py-2">§ Workspace</p>
          <div className="flex flex-col">
            {CORE_NAV.map((item, i) => <NavLink key={item.href} item={item} index={i} />)}
          </div>

          {customItems.length > 0 && (
            <>
              <div className="h-px bg-[var(--border)] mx-3 my-3" />
              <p className="label-spec px-3 py-2">§ Extras</p>
              <div className="flex flex-col">
                {customItems.map((item, i) => <NavLink key={item.href} item={item} index={CORE_NAV.length + i} />)}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border)]">
          <button onClick={nextTheme} className="w-full flex items-center gap-2.5 px-3 py-3 md:py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors border-b border-[var(--border)]">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">{themeIcon}</svg>
            {theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}
          </button>
          <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-3 md:py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M5.5 12.5H3a1 1 0 01-1-1v-9a1 1 0 011-1h2.5M9.5 10l3-3-3-3M12.5 7H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
