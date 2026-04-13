"use client";

import type { FileEntry } from "@/lib/types";

interface FileTreeProps {
  entries: FileEntry[];
  activePath: string;
  onSelect: (entry: FileEntry) => void;
  onNavigate: (path: string) => void;
  currentPath: string;
}

export function FileTree({ entries, activePath, onSelect, onNavigate, currentPath }: FileTreeProps) {
  const isRoot = currentPath === "" || currentPath === ".";

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Explorer</p>
        {!isRoot && (
          <button
            onClick={() => onNavigate(currentPath.split("/").slice(0, -1).join("/") || ".")}
            className="text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            Back
          </button>
        )}
      </div>
      <div className="py-1.5 px-1.5">
        {entries.map((entry, i) => {
          const isActive = entry.path === activePath;
          const isDir = entry.type === "directory";
          return (
            <button
              key={entry.path}
              onClick={() => (isDir ? onNavigate(entry.path) : onSelect(entry))}
              style={{ animationDelay: `${i * 20}ms` }}
              className={`
                animate-in w-full text-left px-3 py-[7px] text-[13px] flex items-center gap-2.5 rounded-lg transition-all duration-150
                ${isActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium shadow-[inset_0_0_0_1px_var(--accent-glow)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                }
              `}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className={`flex-shrink-0 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}>
                {isDir ? (
                  <path d="M2 4a1 1 0 011-1h3l1.2 1.2H12a1 1 0 011 1v5.3a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.1" fill={isActive ? "var(--accent-glow)" : "none"}/>
                ) : (
                  <path d="M4 1.5h4.5l3 3v7a1 1 0 01-1 1H4a1 1 0 01-1-1v-9a1 1 0 011-1zM8.5 1.5v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
              <span className="truncate">{entry.name}</span>
              {isDir && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-auto opacity-30 flex-shrink-0">
                  <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          );
        })}
        {entries.length === 0 && (
          <p className="px-3 py-10 text-[12px] text-[var(--text-tertiary)] text-center">Empty directory</p>
        )}
      </div>
    </div>
  );
}
