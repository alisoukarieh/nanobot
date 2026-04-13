"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import pb from "@/lib/pocketbase";
import type { Agent, FileEntry } from "@/lib/types";
import { FileTree } from "@/components/FileTree";
import { FileEditor } from "@/components/FileEditor";

export default function FilesPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [selectedFile, setSelectedFile] = useState("");

  useEffect(() => {
    if (!agentId) return;
    pb.collection("agents")
      .getOne<Agent>(agentId)
      .then(setAgent)
      .catch(() => {});
  }, [agentId]);

  const loadDir = useCallback(
    (dirPath: string) => {
      if (!agent?.workspace_path) return;
      fetch(
        `/api/files?workspace=${encodeURIComponent(agent.workspace_path)}&path=${encodeURIComponent(dirPath)}`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data.entries) {
            setEntries(data.entries);
            setCurrentPath(dirPath);
          }
        })
        .catch(() => {});
    },
    [agent?.workspace_path]
  );

  useEffect(() => {
    if (agent?.workspace_path) loadDir(".");
  }, [agent?.workspace_path, loadDir]);

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <div className={`
        ${selectedFile ? "hidden sm:block" : "block"}
        w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-[var(--border)] flex-shrink-0
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
            className="sm:hidden px-4 py-2 text-xs text-[var(--accent)] border-b border-[var(--border)]"
          >
            Back to files
          </button>
        )}
        <FileEditor filePath={selectedFile} workspacePath={agent.workspace_path} />
      </div>
    </div>
  );
}
