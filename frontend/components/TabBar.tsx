"use client";

interface TabBarProps {
  onMenuClick?: () => void;
}

export function TabBar({ onMenuClick }: TabBarProps) {
  return (
    <div className="md:hidden h-[52px] flex items-center gap-3 px-4 border-b border-[var(--border)] bg-[var(--topbar-bg)] glass relative noise flex-shrink-0">
      <button onClick={onMenuClick} className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-[var(--accent)] flex items-center justify-center">
          <span className="text-white text-[9px] font-bold tracking-tight">nb</span>
        </div>
        <span className="text-[14px] font-semibold text-[var(--text-primary)] tracking-[-0.02em]">nanobot</span>
      </div>
    </div>
  );
}
