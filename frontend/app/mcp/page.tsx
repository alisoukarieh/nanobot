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

const btnPrimary =
  "px-3.5 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase bg-[var(--accent)] text-[var(--bg-primary)] border border-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors";
const btnGhost =
  "px-3.5 py-2 font-mono text-[10px] font-semibold tracking-[0.2em] uppercase border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors";
const inputCls =
  "w-full px-3 py-2.5 text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors";
const labelCls =
  "block font-mono text-[10px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-[0.2em]";

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
      if (authType === "bearer" && bearerToken) body.auth = bearerToken;
      else if (authType === "headers" && Object.keys(headers).length) body.headers = headers;
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
      if (data.authUrl) window.open(data.authUrl, "_blank");
      else alert(data.error || "OAuth discovery failed");
    } catch {
      alert("Failed to start OAuth flow");
    } finally {
      setConnecting(null);
    }
  };

  const entries = Object.entries(servers);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="MCP Servers"
        code="§ 03"
        subtitle="External tool protocol connections"
        actions={
          <>
            <button onClick={handleRestart} disabled={restarting} className={btnGhost}>
              {restarting ? "Restarting…" : "↻ Restart"}
            </button>
            {!adding && (
              <button onClick={() => setAdding(true)} className={btnPrimary}>
                + Add
              </button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 py-5">
          {justConnected && (
            <div className="mb-5 border border-[var(--text-primary)] px-4 py-3 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--text-primary)]">
              ✓ Connected to &quot;{justConnected}&quot;. Click Restart to apply.
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">
                Loading…
              </span>
            </div>
          )}

          {!loading && entries.length === 0 && !adding && (
            <div className="text-center py-24 border border-dashed border-[var(--border)]">
              <p className="label-spec">§ No servers</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-3">Add an MCP server to get started</p>
            </div>
          )}

          {entries.length > 0 && (
            <div className="border border-[var(--border)]">
              <div className="hidden sm:grid border-b border-[var(--border)] grid-cols-[60px_1fr_100px_100px] gap-3 px-4 py-2 bg-[var(--bg-secondary)]">
                <span className="font-mono text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-tertiary)]">Code</span>
                <span className="font-mono text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-tertiary)]">Server</span>
                <span className="font-mono text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-tertiary)]">Transport</span>
                <span className="font-mono text-[9px] font-semibold tracking-[0.2em] uppercase text-[var(--text-tertiary)] text-right">Actions</span>
              </div>
              {entries.map(([serverName, config], i) => {
                const transport = config.type || (config.command ? "stdio" : "http");
                const authed = Boolean(config.auth) || Boolean(config.headers && Object.keys(config.headers).length > 0);
                const canOAuth = Boolean(config.url) && !authed;
                const snippet = config.command
                  ? `${config.command} ${config.args?.join(" ") || ""}`.trim()
                  : (config.url || "");
                const code = `M·${String(i + 1).padStart(2, "0")}`;
                return (
                  <div
                    key={serverName}
                    className="flex flex-col gap-2 sm:grid sm:grid-cols-[60px_1fr_100px_100px] sm:gap-3 sm:items-center px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center justify-between sm:contents">
                      <span className="font-mono text-[10px] font-semibold tracking-[0.1em] text-[var(--text-tertiary)] sm:block">{code}</span>
                      <div className="min-w-0 flex-1 sm:mx-0 mx-3">
                        <h3 className="text-[13px] font-medium text-[var(--text-primary)] truncate">{serverName}</h3>
                        <p className="text-[11px] font-mono text-[var(--text-tertiary)] truncate mt-0.5">{snippet || "—"}</p>
                      </div>
                      <div className="flex flex-col gap-0.5 items-end sm:items-start">
                        <span className="font-mono text-[10px] font-semibold tracking-[0.15em] uppercase text-[var(--text-secondary)]">{transport}</span>
                        {authed && <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--text-tertiary)]">● Auth</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 sm:gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                      {canOAuth && (
                        <button
                          onClick={() => handleOAuthConnect(serverName, config.url!)}
                          disabled={connecting === serverName}
                          className="font-mono text-[10px] sm:text-[9px] font-semibold tracking-[0.15em] uppercase text-[var(--text-primary)] hover:underline disabled:opacity-50 py-1"
                        >
                          {connecting === serverName ? "…" : "Connect"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(serverName)}
                        className="font-mono text-[10px] sm:text-[9px] font-semibold tracking-[0.15em] uppercase text-[var(--text-tertiary)] hover:text-red-500 py-1"
                      >
                        ✕ Del
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {adding && (
            <form onSubmit={handleAdd} className="mt-5 border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-2 flex items-center justify-between bg-[var(--bg-secondary)]">
                <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--text-secondary)]">§ New server</span>
                <button type="button" onClick={() => setAdding(false)} className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-server" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Transport</label>
                  <div className="flex flex-wrap -ml-px">
                    {(["stdio", "sse", "streamableHttp"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setType(t)}
                        className={`px-3.5 py-2 font-mono text-[10px] font-semibold tracking-[0.15em] uppercase border -ml-px transition-colors ${type === t ? "bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)] relative z-10" : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-primary)]"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {type === "stdio" ? (
                  <>
                    <div>
                      <label className={labelCls}>Command</label>
                      <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} required placeholder="npx" className={`${inputCls} font-mono`} />
                    </div>
                    <div>
                      <label className={labelCls}>Args (one per line)</label>
                      <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} placeholder={"-y\n@modelcontextprotocol/server-name"} className={`${inputCls} font-mono resize-none`} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>URL</label>
                      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://mcp-server.example.com/mcp" className={`${inputCls} font-mono`} />
                    </div>
                    <div>
                      <label className={labelCls}>Authentication</label>
                      <div className="flex -ml-px mb-3">
                        {(["none", "bearer", "headers"] as const).map((a) => (
                          <button key={a} type="button" onClick={() => setAuthType(a)}
                            className={`px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.15em] uppercase border -ml-px transition-colors ${authType === a ? "bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)] relative z-10" : "bg-[var(--bg-primary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-primary)]"}`}>
                            {a === "none" ? "OAuth" : a}
                          </button>
                        ))}
                      </div>
                      {authType === "none" && (
                        <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
                          Agent auto-discovers OAuth when supported.
                        </p>
                      )}
                      {authType === "bearer" && (
                        <input type="password" value={bearerToken} onChange={(e) => setBearerToken(e.target.value)} placeholder="sk-…" className={`${inputCls} font-mono`} />
                      )}
                      {authType === "headers" && (
                        <>
                          {Object.entries(headers).length > 0 && (
                            <div className="space-y-px mb-2 border border-[var(--border)]">
                              {Object.entries(headers).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2 text-[12px] font-mono px-3 py-1.5 border-b border-[var(--border)] last:border-b-0">
                                  <span className="text-[var(--text-secondary)]">{k}:</span>
                                  <span className="text-[var(--text-tertiary)] truncate">{v.slice(0, 8)}…</span>
                                  <button type="button" onClick={() => { const h = { ...headers }; delete h[k]; setHeaders(h); }}
                                    className="ml-auto text-[var(--text-tertiary)] hover:text-red-500 font-mono text-[10px]">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row sm:gap-0 gap-2 sm:-ml-px">
                            <input type="text" value={headerKey} onChange={(e) => setHeaderKey(e.target.value)} placeholder="Authorization" className={`${inputCls} font-mono sm:-ml-px`} />
                            <input type="text" value={headerVal} onChange={(e) => setHeaderVal(e.target.value)} placeholder="Bearer sk-…" className={`${inputCls} font-mono sm:-ml-px`} />
                            <button type="button" onClick={() => { if (headerKey.trim()) { setHeaders({ ...headers, [headerKey.trim()]: headerVal }); setHeaderKey(""); setHeaderVal(""); } }}
                              disabled={!headerKey.trim()} className={`${btnGhost} sm:-ml-px whitespace-nowrap`}>+ Add</button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                  <button type="button" onClick={() => setAdding(false)} className={btnGhost}>Cancel</button>
                  <button type="submit" className={btnPrimary}>+ Add Server</button>
                </div>
              </div>
            </form>
          )}

          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--text-tertiary)] mt-8 text-center">
            · Restart required after changes ·
          </p>
        </div>
      </div>
    </div>
  );
}
