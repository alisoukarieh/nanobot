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
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <p className="text-[10px] text-[var(--text-tertiary)] font-semibold uppercase tracking-widest">
          Files
        </p>
        {!isRoot && (
          <button
            onClick={() => {
              const parent = currentPath.split("/").slice(0, -1).join("/");
              onNavigate(parent || ".");
            }}
            className="text-[11px] text-[var(--accent)] hover:underline transition-colors"
          >
            Back
          </button>
        )}
      </div>
      <div className="py-1">
        {entries.map((entry) => {
          const isActive = entry.path === activePath;
          const isDir = entry.type === "directory";
          return (
            <button
              key={entry.path}
              onClick={() => (isDir ? onNavigate(entry.path) : onSelect(entry))}
              className={`
                w-full text-left px-3 py-2 text-[13px] flex items-center gap-2.5 transition-all duration-100
                ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                }
              `}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 opacity-50">
                {isDir ? (
                  <path d="M1.5 3.5a1 1 0 011-1h3l1 1h4a1 1 0 011 1v5a1 1 0 01-1 1h-8a1 1 0 01-1-1v-6z" stroke="currentColor" strokeWidth="1.2"/>
                ) : (
                  <path d="M3.5 1.5h4l3 3v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-8a1 1 0 011-1zM7.5 1.5v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
              <span className="truncate">{entry.name}</span>
            </button>
          );
        })}
        {entries.length === 0 && (
          <p className="px-3 py-8 text-xs text-[var(--text-tertiary)] text-center">
            Empty directory
          </p>
        )}
      </div>
    </div>
  );
}
