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
    <div className="h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            nanobot
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Sign in to continue
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-primary)] rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="
                w-full px-3.5 py-2.5 rounded-xl text-sm
                bg-[var(--bg-secondary)] border border-[var(--border)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30 focus:border-[var(--accent)]
                transition-shadow
              "
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="
                w-full px-3.5 py-2.5 rounded-xl text-sm
                bg-[var(--bg-secondary)] border border-[var(--border)]
                placeholder:text-[var(--text-tertiary)]
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-30 focus:border-[var(--accent)]
                transition-shadow
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
              w-full py-2.5 rounded-xl text-sm font-medium
              bg-[var(--accent)] text-white
              hover:bg-[var(--accent-hover)]
              disabled:opacity-50 disabled:cursor-default
              transition-colors
            "
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
