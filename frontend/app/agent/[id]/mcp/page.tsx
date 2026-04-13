"use client";

import { useCallback, useEffect, useState } from "react";

interface McpServer {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
}

export default function McpPage() {
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"stdio" | "sse" | "streamableHttp">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(() => {
    fetch("/api/mcp")
      .then((r) => r.json())
      .then((d) => setServers(d.servers || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: any = { name, type };
    if (type === "stdio") {
      body.command = command;
      body.args = args.split("\n").map((s) => s.trim()).filter(Boolean);
    } else {
      body.url = url;
    }
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setName(""); setCommand(""); setArgs(""); setUrl("");
    setAdding(false);
    load();
  };

  const handleDelete = async (serverName: string) => {
    await fetch(`/api/mcp?name=${encodeURIComponent(serverName)}`, { method: "DELETE" });
    load();
  };

  const entries = Object.entries(servers);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-[-0.01em]">
              MCP Servers
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Extend your agent with external tools
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all duration-150"
            >
              Add Server
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        )}

        {!loading && entries.length === 0 && !adding && (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-tertiary)] mx-auto mb-3 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[var(--text-tertiary)]">
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[var(--text-secondary)] text-sm font-medium">No servers connected</p>
            <p className="text-[var(--text-tertiary)] text-xs mt-1">Add an MCP server to get started</p>
          </div>
        )}

        <div className="space-y-2">
          {entries.map(([serverName, config]) => (
            <div
              key={serverName}
              className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">
                    {serverName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                      {config.type || (config.command ? "stdio" : "http")}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono truncate">
                      {config.command ? `${config.command} ${config.args?.join(" ") || ""}` : config.url}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(serverName)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-red-500 transition-colors flex-shrink-0 px-2 py-1 rounded-lg hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {adding && (
          <form
            onSubmit={handleAdd}
            className="mt-4 bg-[var(--bg-elevated)] rounded-2xl p-5 border border-[var(--border)] shadow-[var(--shadow-md)] space-y-4"
          >
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-server"
                className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent transition-all" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Type</label>
              <div className="flex gap-1.5">
                {(["stdio", "sse", "streamableHttp"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${type === t ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {type === "stdio" ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Command</label>
                  <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} required placeholder="npx"
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Arguments (one per line)</label>
                  <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} placeholder={"-y\n@modelcontextprotocol/server-name"}
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-mono bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent resize-none transition-all" />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">URL</label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://mcp-server.example.com/sse"
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent transition-all" />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAdding(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-all">
                Add
              </button>
            </div>
          </form>
        )}

        <p className="text-[10px] text-[var(--text-tertiary)] mt-8">
          Changes take effect after agent restart.
        </p>
      </div>
    </div>
  );
}
