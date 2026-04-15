"use client";

import { useCallback, useEffect, useState } from "react";
import pb from "@/lib/pocketbase";
import type { Agent, FileEntry } from "@/lib/types";
import { FileTree } from "@/components/FileTree";
import { FileEditor } from "@/components/FileEditor";
import { PageHeader } from "@/components/PageHeader";

export default function FilesPage() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [selectedFile, setSelectedFile] = useState("");

  // Single-agent mode: always use the first agent in PocketBase.
  useEffect(() => {
    pb.collection("agents")
      .getFullList<Agent>({ sort: "name" })
      .then((list) => {
        if (list[0]) setAgent(list[0]);
      })
      .catch(() => {});
  }, []);

  const loadDir = useCallback(
    (dirPath: string) => {
      if (!agent?.workspace_path) return;
      fetch(`/api/files?workspace=${encodeURIComponent(agent.workspace_path)}&path=${encodeURIComponent(dirPath)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.entries) {
            setEntries(data.entries);
            setCurrentPath(dirPath);
          }
        })
        .catch(() => {});
    },
    [agent?.workspace_path],
  );

  useEffect(() => {
    if (agent?.workspace_path) loadDir(".");
  }, [agent?.workspace_path, loadDir]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Files" code="§ 02" subtitle={agent?.workspace_path} />
      {!agent ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">Loading…</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          <div className={`
            ${selectedFile ? "hidden sm:block" : "block"}
            w-full sm:w-60 border-b sm:border-b-0 sm:border-r border-[var(--border)] flex-shrink-0
            ${!selectedFile ? "flex-1 sm:flex-initial" : ""}
          `}>
            <FileTree
              entries={entries}
              activePath={selectedFile}
              onSelect={(entry) => setSelectedFile(entry.path)}
              onNavigate={loadDir}
              currentPath={currentPath}
            />
          </div>
          <div className={`${selectedFile ? "block" : "hidden sm:block"} flex-1 flex flex-col min-w-0`}>
            {selectedFile && (
              <button
                onClick={() => setSelectedFile("")}
                className="sm:hidden px-4 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--text-primary)] border-b border-[var(--border)] text-left"
              >
                ← Back
              </button>
            )}
            <FileEditor filePath={selectedFile} workspacePath={agent.workspace_path} />
          </div>
        </div>
      )}
    </div>
  );
}
