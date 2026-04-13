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
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--text-tertiary)]">
            <path d="M4 2h7l5 5v10a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zM11 2v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="text-[var(--text-tertiary)] text-[13px]">Select a file to edit</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-[var(--text-tertiary)] flex-shrink-0">
            <path d="M3 1h4l3 3v6a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1zM7 1v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[12px] text-[var(--text-secondary)] truncate font-mono">{filePath}</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0 ml-3">
          {saved && <span className="text-[11px] text-emerald-500 font-medium animate-in">Saved</span>}
          <button onClick={save} disabled={!isDirty || saving}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-20 disabled:cursor-default transition-all duration-150">
            {saving ? "..." : "Save"}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-4 h-4 border-[1.5px] border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : (
        <textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false}
          className="flex-1 w-full p-5 resize-none font-mono text-[13px] leading-[1.8] tabular-nums bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none" />
      )}
    </div>
  );
}
