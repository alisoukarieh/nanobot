"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import pb from "@/lib/pocketbase";

// Stored in PocketBase collection `models`:
//   - name (text, required) — the model id, e.g. "anthropic/claude-opus-4-5"
// API rules should be `@request.auth.id != ""` for list/view/create/update/delete.
//
// The currently-selected model is kept in localStorage (per-browser preference).
// `null` selection means "use the server's default model".

interface ModelRow {
  id: string;
  name: string;
}

interface ModelsContextType {
  models: ModelRow[];
  selected: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addModel: (name: string) => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  select: (name: string | null) => void;
}

const ModelsContext = createContext<ModelsContextType>({
  models: [],
  selected: null,
  loading: true,
  error: null,
  refresh: async () => {},
  addModel: async () => {},
  removeModel: async () => {},
  select: () => {},
});

export function useModels() {
  return useContext(ModelsContext);
}

const SELECTED_KEY = "nanobot.selectedModel";

export function ModelsProvider({ children }: { children: React.ReactNode }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selected, setSelectedState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(SELECTED_KEY) : null;
    if (stored) setSelectedState(stored);
  }, []);

  const refresh = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setModels([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const list = await pb
        .collection("models")
        .getFullList<ModelRow>({ sort: "created" });
      setModels(list);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 404) {
        setModels([]);
        setError("models collection not set up in PocketBase");
      } else {
        setError(err?.message || "Failed to load models");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = pb.authStore.onChange(() => {
      refresh();
    });
    return unsub;
  }, [refresh]);

  const addModel = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const rec = await pb.collection("models").create<ModelRow>({ name: trimmed });
    setModels((prev) => [...prev, rec]);
  }, []);

  const removeModel = useCallback(
    async (id: string) => {
      const target = models.find((m) => m.id === id);
      await pb.collection("models").delete(id);
      setModels((prev) => prev.filter((m) => m.id !== id));
      if (target && selected === target.name) {
        setSelectedState(null);
        localStorage.removeItem(SELECTED_KEY);
      }
    },
    [models, selected],
  );

  const select = useCallback((name: string | null) => {
    setSelectedState(name);
    if (name === null) localStorage.removeItem(SELECTED_KEY);
    else localStorage.setItem(SELECTED_KEY, name);
  }, []);

  return (
    <ModelsContext.Provider
      value={{ models, selected, loading, error, refresh, addModel, removeModel, select }}
    >
      {children}
    </ModelsContext.Provider>
  );
}
