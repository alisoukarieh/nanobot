"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");

  useEffect(() => {
    const target = connected ? `/mcp?connected=${encodeURIComponent(connected)}` : "/chat";
    router.replace(target);
  }, [router, connected]);

  return (
    <main className="h-full flex items-center justify-center bg-[var(--bg-secondary)]">
      <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
    </main>
  );
}
