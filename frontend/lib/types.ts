export interface Agent {
  id: string;
  name: string;
  description: string;
  workspace_path: string;
  created: string;
  updated: string;
}

export interface Session {
  id: string;
  agent: string;
  title: string;
  created: string;
  updated: string;
}

export interface Message {
  id: string;
  session: string;
  role: "user" | "assistant" | "system";
  content: string;
  created: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}
