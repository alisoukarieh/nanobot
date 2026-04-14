"use client";

interface TabBarProps {
  agentId: string;
  agentName: string;
  onMenuClick?: () => void;
}

export function TabBar({ agentName, onMenuClick }: TabBarProps) {
  return (
    <div className="h-[48px] flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--topbar-bg)] glass relative noise lg:hidden">
      <button onClick={onMenuClick} className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{agentName}</span>
    </div>
  );
}
