"use client";

import { useCallback, useEffect, useState } from "react";

interface McpServer {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

export default function McpPage() {
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Form state
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
      body.args = args
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      body.url = url;
    }

    await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setName("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdding(false);
    load();
  };

  const handleDelete = async (serverName: string) => {
    await fetch(`/api/mcp?name=${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });
    load();
  };

  const entries = Object.entries(servers);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            MCP Servers
          </h2>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              Add Server
            </button>
          )}
        </div>

        {loading && (
          <p className="text-sm text-[var(--text-tertiary)]">Loading...</p>
        )}

        {!loading && entries.length === 0 && !adding && (
          <div className="text-center py-16">
            <p className="text-[var(--text-secondary)] text-sm">
              No MCP servers connected
            </p>
            <p className="text-[var(--text-tertiary)] text-xs mt-1">
              Add one to extend your agent with external tools.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {entries.map(([serverName, config]) => (
            <div
              key={serverName}
              className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border)]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    {serverName}
                  </h3>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {config.type || (config.command ? "stdio" : "http")}
                    {config.command && (
                      <span className="ml-2 font-mono">
                        {config.command} {config.args?.join(" ")}
                      </span>
                    )}
                    {config.url && (
                      <span className="ml-2 font-mono">{config.url}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(serverName)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
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
            className="mt-4 bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border)] space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="my-server"
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Type
              </label>
              <div className="flex gap-2">
                {(["stdio", "sse", "streamableHttp"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      type === t
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {type === "stdio" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Command
                  </label>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    required
                    placeholder="npx"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Arguments (one per line)
                  </label>
                  <textarea
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    rows={3}
                    placeholder={"-y\n@modelcontextprotocol/server-name"}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-[var(--bg-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30 resize-none"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder="https://mcp-server.example.com/sse"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
              >
                Add
              </button>
            </div>
          </form>
        )}

        <p className="text-[10px] text-[var(--text-tertiary)] mt-6">
          Changes take effect after agent restart.
        </p>
      </div>
    </div>
  );
}
