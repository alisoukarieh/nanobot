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
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-lg font-bold">n</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em]">
            Welcome back
          </h1>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
            Sign in to your nanobot dashboard
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-elevated)] rounded-2xl p-6 shadow-[var(--shadow-lg)] border border-[var(--border)] space-y-4"
        >
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="
                w-full px-3.5 py-2.5 rounded-xl text-[13px]
                bg-[var(--input-bg)] border border-[var(--border)]
                text-[var(--text-primary)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent
                transition-all duration-150
              "
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="
                w-full px-3.5 py-2.5 rounded-xl text-[13px]
                bg-[var(--input-bg)] border border-[var(--border)]
                text-[var(--text-primary)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-25 focus:border-transparent
                transition-all duration-150
              "
              placeholder="Password"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full py-2.5 rounded-xl text-[13px] font-semibold
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-50 disabled:cursor-default
              transition-all duration-150
            "
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
