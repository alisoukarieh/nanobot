"use client";

import { useEffect, useRef, useState } from "react";
import { useModels } from "@/lib/models";

interface Props {
  onClose?: () => void;
}

export function ModelSelector({ onClose }: Props) {
  const { models, selected, loading, error, addModel, removeModel, select } = useModels();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const submitAdd = async () => {
    const v = draft.trim();
    if (!v) {
      setAdding(false);
      return;
    }
    try {
      await addModel(v);
      setDraft("");
      setAdding(false);
    } catch (e) {
      const err = e as { message?: string };
      alert(err?.message || "Failed to add model");
    }
  };

  const handleSelect = (name: string | null) => {
    select(name);
    setOpen(false);
    onClose?.();
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"?`)) return;
    try {
      await removeModel(id);
    } catch (e) {
      const err = e as { message?: string };
      alert(err?.message || "Failed to remove model");
    }
  };

  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-3 md:py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
          <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 6h5M4.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left truncate normal-case tracking-normal text-[11px] font-mono text-[var(--text-primary)]">
          {selected || "default"}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="bg-[var(--bg-secondary)] border-t border-[var(--border)] py-1">
          {loading ? (
            <div className="px-4 py-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--text-tertiary)]">
              Loading…
            </div>
          ) : (
            <>
              <button
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-4 py-1.5 text-[11px] font-mono transition-colors flex items-center justify-between ${
                  selected === null
                    ? "text-[var(--text-primary)] bg-[var(--bg-tertiary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className="truncate">default</span>
                {selected === null && <span className="text-[var(--accent)] flex-shrink-0">●</span>}
              </button>

              {models.map((m) => (
                <div key={m.id} className="flex items-stretch group">
                  <button
                    onClick={() => handleSelect(m.name)}
                    className={`flex-1 min-w-0 text-left px-4 py-1.5 text-[11px] font-mono transition-colors flex items-center justify-between ${
                      selected === m.name
                        ? "text-[var(--text-primary)] bg-[var(--bg-tertiary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {selected === m.name && <span className="text-[var(--accent)] flex-shrink-0">●</span>}
                  </button>
                  <button
                    onClick={() => handleRemove(m.id, m.name)}
                    className="px-2 text-[var(--text-tertiary)] hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    title={`Remove ${m.name}`}
                    aria-label={`Remove ${m.name}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}

              {adding ? (
                <div className="flex items-stretch px-2 py-1.5 gap-1">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitAdd();
                      }
                      if (e.key === "Escape") {
                        setAdding(false);
                        setDraft("");
                      }
                    }}
                    placeholder="provider/model"
                    className="flex-1 min-w-0 px-2 py-1 font-mono text-[11px] bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      submitAdd();
                    }}
                    className="px-2 font-mono text-[10px] uppercase tracking-[0.15em] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  disabled={Boolean(error)}
                  className="w-full text-left px-4 py-1.5 font-mono text-[11px] tracking-[0.1em] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors flex items-center gap-2"
                >
                  <span className="text-[14px] leading-none">+</span>
                  <span>Add model</span>
                </button>
              )}

              {error && (
                <div className="px-4 py-2 font-mono text-[10px] leading-relaxed tracking-[0.05em] text-rose-400 border-t border-[var(--border)]">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
