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
      <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
        <p className="label-spec">§ Explorer</p>
        {!isRoot && (
          <button
            onClick={() => onNavigate(currentPath.split("/").slice(0, -1).join("/") || ".")}
            className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← Up
          </button>
        )}
      </div>
      <div>
        {entries.map((entry, i) => {
          const isActive = entry.path === activePath;
          const isDir = entry.type === "directory";
          const code = String(i + 1).padStart(2, "0");
          return (
            <button
              key={entry.path}
              onClick={() => (isDir ? onNavigate(entry.path) : onSelect(entry))}
              className={`
                group w-full text-left px-3 py-2 text-[12.5px] flex items-center gap-2.5 transition-colors border-l-2 border-b border-[var(--border)]
                ${isActive
                  ? "border-l-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-l-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                }
              `}
            >
              <span className="font-mono text-[9px] font-semibold tracking-[0.1em] text-[var(--text-tertiary)] w-5">
                {code}
              </span>
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" className="flex-shrink-0 text-[var(--text-tertiary)]">
                {isDir ? (
                  <path d="M2 4a1 1 0 011-1h3l1.2 1.2H12a1 1 0 011 1v5.3a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.1" fill="none"/>
                ) : (
                  <path d="M4 1.5h4.5l3 3v7a1 1 0 01-1 1H4a1 1 0 01-1-1v-9a1 1 0 011-1zM8.5 1.5v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
              <span className="truncate">{entry.name}{isDir && "/"}</span>
              {isDir && (
                <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">→</span>
              )}
            </button>
          );
        })}
        {entries.length === 0 && (
          <p className="label-spec px-3 py-10 text-center">§ Empty directory</p>
        )}
      </div>
    </div>
  );
}
