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
    setLoading(true); setSaved(false);
    fetch(`/api/files?workspace=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((data) => { setContent(data.content || ""); setOriginal(data.content || ""); })
      .catch(() => setContent("Error loading file"))
      .finally(() => setLoading(false));
  }, [filePath, workspacePath]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/files?workspace=${encodeURIComponent(workspacePath)}&path=${encodeURIComponent(filePath)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      });
      setOriginal(content); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }, [content, filePath, workspacePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (isDirty) save(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, save]);

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 animate-in">
        <div className="w-12 h-12 border border-[var(--border)] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-[var(--text-tertiary)]">
            <path d="M4 2h7l5 5v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zM11 2v5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="label-spec">§ Select a file</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--text-tertiary)]">File</span>
          <span className="text-[12px] text-[var(--text-secondary)] truncate font-mono">{filePath}</span>
          {isDirty && <span className="font-mono text-[10px] text-[var(--accent)] flex-shrink-0">●</span>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {saved && <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-secondary)] animate-in">✓ Saved</span>}
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase bg-[var(--accent)] text-[var(--bg-primary)] border border-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-20 disabled:cursor-default transition-colors"
          >
            {saving ? "…" : "Save"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">Loading…</span>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-5 resize-none font-mono text-[13px] leading-[1.7] tabular-nums bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none border-0"
        />
      )}
    </div>
  );
}
