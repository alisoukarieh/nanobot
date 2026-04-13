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
        <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-56 border-r border-[var(--border)] flex-shrink-0">
        <FileTree
          entries={entries}
          activePath={selectedFile}
          onSelect={(entry) => setSelectedFile(entry.path)}
          onNavigate={loadDir}
          currentPath={currentPath}
        />
      </div>
      <FileEditor filePath={selectedFile} workspacePath={agent.workspace_path} />
    </div>
  );
}
