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
      // error handled by UI
    } finally {
      setSaving(false);
    }
  }, [content, filePath, workspacePath]);

  // Ctrl/Cmd+S to save
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
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--text-tertiary)] text-sm">Select a file</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-secondary)] truncate">
          {filePath}
          {isDirty && <span className="ml-1 text-[var(--accent)]">(modified)</span>}
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="
              px-3 py-1 rounded-md text-xs font-medium
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-30 disabled:cursor-default
              transition-colors
            "
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Editor */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text-tertiary)] text-xs">Loading...</p>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="
            flex-1 w-full p-4 resize-none
            font-mono text-sm leading-relaxed
            bg-[var(--bg-primary)] text-[var(--text-primary)]
            focus:outline-none
          "
        />
      )}
    </div>
  );
}
