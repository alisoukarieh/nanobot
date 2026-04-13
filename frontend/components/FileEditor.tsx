"use client";

import { useCallback, useEffect, useState } from "react";

interface FileEditorProps {
  filePath: string;
  workspacePath: string;
}

export function FileEditor({ filePath, workspacePath }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = content !== original;

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setSaved(false);
    fetch(
      `/api/files?workspace=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(filePath)}`
    )
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content || "");
        setOriginal(data.content || "");
      })
      .catch(() => setContent("Error loading file"))
      .finally(() => setLoading(false));
  }, [filePath, workspacePath]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(
        `/api/files?workspace=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(filePath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* handled by UI */
    } finally {
      setSaving(false);
    }
  }, [content, filePath, workspacePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, save]);

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--text-tertiary)] opacity-40">
          <path d="M5 3h8l6 6v12a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM13 3v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <p className="text-[var(--text-tertiary)] text-sm">Select a file</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--topbar-bg)]">
        <span className="text-xs text-[var(--text-secondary)] truncate font-mono">
          {filePath}
          {isDirty && <span className="ml-1.5 text-[var(--accent)] font-sans">modified</span>}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {saved && <span className="text-xs text-emerald-500 font-medium">Saved</span>}
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="
              px-3 py-1 rounded-lg text-xs font-medium
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-25 disabled:cursor-default
              transition-all duration-150
            "
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="
            flex-1 w-full p-4 resize-none font-mono
            text-[13px] leading-[1.7] tabular-nums
            bg-[var(--bg-primary)] text-[var(--text-primary)]
            focus:outline-none
          "
        />
      )}
    </div>
  );
}
