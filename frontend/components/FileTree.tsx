"use client";

import { useState } from "react";
import type { FileEntry } from "@/lib/types";

interface FileTreeProps {
  entries: FileEntry[];
  activePath: string;
  onSelect: (entry: FileEntry) => void;
  onNavigate: (path: string) => void;
  currentPath: string;
}

export function FileTree({
  entries,
  activePath,
  onSelect,
  onNavigate,
  currentPath,
}: FileTreeProps) {
  const isRoot = currentPath === "" || currentPath === ".";

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
          Files
        </p>
        {!isRoot && (
          <button
            onClick={() => {
              const parent = currentPath.split("/").slice(0, -1).join("/");
              onNavigate(parent || ".");
            }}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] mt-1 transition-colors"
          >
            .. back
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
                w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                ${
                  isActive
                    ? "bg-[var(--accent)] bg-opacity-10 text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                }
              `}
            >
              <span className="text-xs opacity-50">{isDir ? "+" : " "}</span>
              <span className="truncate">{entry.name}</span>
            </button>
          );
        })}
        {entries.length === 0 && (
          <p className="px-3 py-4 text-xs text-[var(--text-tertiary)] text-center">
            Empty directory
          </p>
        )}
      </div>
    </div>
  );
}
