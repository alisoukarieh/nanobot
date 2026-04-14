"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";

interface McpServer {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  auth?: string | Record<string, string>;
}

export default function McpPage() {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected");
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"stdio" | "sse" | "streamableHttp">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "headers">("none");
  const [bearerToken, setBearerToken] = useState("");
  const [headerKey, setHeaderKey] = useState("");
  const [headerVal, setHeaderVal] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});

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
      if (authType === "bearer" && bearerToken) {
        body.auth = bearerToken;
      } else if (authType === "headers" && Object.keys(headers).length) {
        body.headers = headers;
      }
    }
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setName(""); setCommand(""); setArgs(""); setUrl("");
    setBearerToken(""); setHeaders({}); setHeaderKey(""); setHeaderVal("");
    setAuthType("none"); setAdding(false);
    load();
  };

  const handleDelete = async (serverName: string) => {
    await fetch(`/api/mcp?name=${encodeURIComponent(serverName)}`, { method: "DELETE" });
    load();
  };

  const handleRestart = async () => {
    setRestarting(true);
    await fetch("/api/restart", { method: "POST" });
    setTimeout(() => setRestarting(false), 5000);
  };

  const [connecting, setConnecting] = useState<string | null>(null);

  const handleOAuthConnect = async (serverName: string, serverUrl: string) => {
    setConnecting(serverName);
    try {
      const res = await fetch("/api/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName, serverUrl }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, "_blank");
      } else {
        alert(data.error || "OAuth discovery failed");
      }
    } catch {
      alert("Failed to start OAuth flow");
    } finally {
      setConnecting(null);
    }
  };

  const entries = Object.entries(servers);
  const hasChanges = true; // simplified — always show restart

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="MCP Servers"
        subtitle="Extend your agent with external tools"
        actions={
          <>
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 transition-all duration-150"
            >
              {restarting ? "Restarting..." : "Restart Agent"}
            </button>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition-all duration-150"
              >
                Add Server
              </button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 py-4 sm:py-5">
        {justConnected && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-glow)] text-[13px] text-[var(--accent)] font-medium">
            Connected to "{justConnected}". Click "Restart Agent" to apply.
          </div>
        )}

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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {entries.map(([serverName, config], i) => {
            const transport = config.type || (config.command ? "stdio" : "http");
            const authed = Boolean(config.auth) || Boolean(config.headers && Object.keys(config.headers).length > 0);
            const canOAuth = Boolean(config.url) && !authed;
            const snippet = config.command
              ? `${config.command} ${config.args?.join(" ") || ""}`.trim()
              : (config.url || "");
            const transportColor: Record<string, string> = {
              stdio: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              sse: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
              streamableHttp: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              http: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
            };
            return (
              <div
                key={serverName}
                style={{ animationDelay: `${i * 30}ms` }}
                className="animate-in group relative flex flex-col bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all"
              >
                {/* Header row: avatar + name + transport */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent)]/70 flex items-center justify-center flex-shrink-0 shadow-[var(--shadow-xs)]">
                    <span className="text-white text-[13px] font-bold tracking-tight">
                      {serverName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                      {serverName}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${transportColor[transport] || "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"}`}>
                        {transport}
                      </span>
                      {authed && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">
                          auth
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Command / URL snippet */}
                <div className="flex-1 min-h-[32px] mb-3 px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)]/60 border border-[var(--border)]">
                  <p className="text-[11px] font-mono text-[var(--text-secondary)] break-all line-clamp-2 leading-snug">
                    {snippet || "—"}
                  </p>
                </div>

                {/* Actions footer */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60">
                  {canOAuth ? (
                    <button
                      onClick={() => handleOAuthConnect(serverName, config.url!)}
                      disabled={connecting === serverName}
                      className="text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] px-2 py-1 rounded-md transition-all disabled:opacity-60"
                    >
                      {connecting === serverName ? "Connecting..." : "Connect OAuth"}
                    </button>
                  ) : (
                    <span className="text-[10px] text-[var(--text-tertiary)] px-1">
                      {authed ? "Configured" : "—"}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(serverName)}
                    className="text-[11px] text-[var(--text-tertiary)] hover:text-red-500 transition-colors px-2 py-1 rounded-md hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {adding && (
          <form onSubmit={handleAdd}
            className="mt-4 bg-[var(--bg-elevated)] rounded-2xl p-5 border border-[var(--border)] shadow-[var(--shadow-md)] space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-server"
                className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
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
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Arguments (one per line)</label>
                  <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} placeholder={"-y\n@modelcontextprotocol/server-name"}
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-mono bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] resize-none transition-all" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">URL</label>
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://mcp-server.example.com/mcp"
                    className="w-full px-3.5 py-2.5 rounded-xl text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">Authentication</label>
                  <div className="flex gap-1.5 mb-3">
                    {(["none", "bearer", "headers"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setAuthType(a)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${authType === a ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]"}`}>
                        {a === "none" ? "None (OAuth auto)" : a === "bearer" ? "Bearer Token" : "Custom Headers"}
                      </button>
                    ))}
                  </div>
                  {authType === "none" && (
                    <p className="text-[11px] text-[var(--text-tertiary)] px-0.5">
                      The agent will auto-discover OAuth if the server supports it. No manual config needed.
                    </p>
                  )}
                  {authType === "bearer" && (
                    <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="sk-..."
                      className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-mono bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
                  )}
                  {authType === "headers" && (
                    <>
                      {Object.entries(headers).length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {Object.entries(headers).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-[12px] font-mono bg-[var(--bg-secondary)] rounded-lg px-3 py-1.5 border border-[var(--border)]">
                              <span className="text-[var(--text-secondary)]">{k}:</span>
                              <span className="text-[var(--text-tertiary)] truncate">{v.slice(0, 8)}...</span>
                              <button type="button" onClick={() => { const h = { ...headers }; delete h[k]; setHeaders(h); }}
                                className="ml-auto text-[var(--text-tertiary)] hover:text-red-400 transition-colors">
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="text" value={headerKey} onChange={(e) => setHeaderKey(e.target.value)} placeholder="Authorization"
                          className="flex-1 px-3 py-2 rounded-lg text-[12px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
                        <input type="text" value={headerVal} onChange={(e) => setHeaderVal(e.target.value)} placeholder="Bearer sk-..."
                          className="flex-1 px-3 py-2 rounded-lg text-[12px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all" />
                        <button type="button" onClick={() => { if (headerKey.trim()) { setHeaders({ ...headers, [headerKey.trim()]: headerVal }); setHeaderKey(""); setHeaderVal(""); } }}
                          disabled={!headerKey.trim()}
                          className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-30 transition-all">
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAdding(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                Cancel
              </button>
              <button type="submit"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white hover:brightness-110 transition-all">
                Add Server
              </button>
            </div>
          </form>
        )}

        <p className="text-[10px] text-[var(--text-tertiary)] mt-8">
          Click "Restart Agent" after making changes to apply them.
        </p>
        </div>
      </div>
    </div>
  );
}
