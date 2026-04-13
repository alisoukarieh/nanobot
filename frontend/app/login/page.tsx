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
    <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 relative noise">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[var(--accent)] opacity-[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[380px] animate-in relative z-10">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] mx-auto mb-5 flex items-center justify-center shadow-[var(--shadow-md)]">
            <span className="text-white text-[16px] font-bold tracking-tight">nb</span>
          </div>
          <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.03em]">
            Welcome back
          </h1>
          <p className="text-[14px] text-[var(--text-tertiary)] mt-1.5">
            Sign in to your dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--bg-elevated)] rounded-2xl p-7 shadow-[var(--shadow-lg)] border border-[var(--border)] space-y-5">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-2 uppercase tracking-[0.06em]">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl text-[14px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all duration-250" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-tertiary)] mb-2 uppercase tracking-[0.06em]">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password"
              className="w-full px-4 py-3 rounded-xl text-[14px] bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] transition-all duration-250" />
          </div>
          {error && <p className="text-[12px] text-red-400 font-medium">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-xl text-[14px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-40 transition-all duration-200 shadow-[var(--shadow-sm)]">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
