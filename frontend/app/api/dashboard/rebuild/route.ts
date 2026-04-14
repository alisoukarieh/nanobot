import { NextRequest, NextResponse } from "next/server";

// Kills the Node process so Docker's `restart: unless-stopped` brings
// the container back up, which re-runs the compose entrypoint:
// `cp /repo/frontend/. /app/ && npm run build && npx next start`.
//
// Auth: shared secret — reuse NANOBOT_API_KEY so agents already
// configured with it can trigger rebuilds. Without a valid key we
// refuse to avoid random DoS.

export async function POST(request: NextRequest) {
  const expected = process.env.NANOBOT_API_KEY || "";
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!expected) {
    return NextResponse.json({ error: "NANOBOT_API_KEY not configured" }, { status: 503 });
  }
  if (!supplied || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Respond first, then exit so the client gets a 202 before the process dies.
  // Docker will restart the container; the entrypoint re-syncs source from
  // /repo/frontend, runs `npm run build`, then `next start`. Takes ~1–2 min.
  queueMicrotask(() => {
    setTimeout(() => process.exit(0), 250);
  });

  return NextResponse.json(
    { status: "rebuilding", eta_seconds: 90 },
    { status: 202 },
  );
}
