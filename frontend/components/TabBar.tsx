"use client";

interface TabBarProps {
  onMenuClick?: () => void;
}

export function TabBar({ onMenuClick }: TabBarProps) {
  return (
    <div className="md:hidden flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--topbar-bg)] flex-shrink-0 pt-[env(safe-area-inset-top)] h-[calc(52px+env(safe-area-inset-top))]">
      <button onClick={onMenuClick} aria-label="Open menu" className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 border border-[var(--text-primary)] flex items-center justify-center">
          <span className="text-[var(--text-primary)] text-[9px] font-bold tracking-tight font-mono">NB</span>
        </div>
        <span className="text-[12px] font-semibold text-[var(--text-primary)] tracking-[0.15em] uppercase">Nanobot</span>
      </div>
    </div>
  );
}
