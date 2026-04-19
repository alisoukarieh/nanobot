"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import pb from "@/lib/pocketbase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await pb.collection("users").authWithPassword(email, password);
      router.replace("/");
    } catch { setError("Invalid credentials"); }
    finally { setLoading(false); }
  };

  return (
    <div className="h-app flex items-center justify-center bg-[var(--bg-primary)] px-4 py-[max(1rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-[400px] animate-in">
        <div className="border border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[var(--text-secondary)]">
              § Authentication
            </span>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-tertiary)]">
              NB·01
            </span>
          </div>

          <div className="px-5 py-8">
            <div className="flex flex-col items-center mb-8">
              <div className="w-12 h-12 border border-[var(--text-primary)] flex items-center justify-center mb-4">
                <span className="text-[var(--text-primary)] text-[13px] font-bold tracking-tight font-mono">NB</span>
              </div>
              <h1 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-[0.15em] uppercase">
                Nanobot
              </h1>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">
                Sign in to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-[0.2em]">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-[0.2em]">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-[13px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              {error && (
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-red-500 border border-red-500/50 px-3 py-2">
                  ✕ {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[var(--accent)] text-[var(--bg-primary)] border border-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors font-mono text-[11px] font-semibold tracking-[0.2em] uppercase"
              >
                {loading ? "Signing in…" : "→ Sign In"}
              </button>
            </form>
          </div>

          <div className="border-t border-[var(--border)] px-5 py-2">
            <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--text-tertiary)] text-center">
              · End of form ·
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
