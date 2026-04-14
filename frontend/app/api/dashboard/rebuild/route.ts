import { NextRequest, NextResponse } from "next/server";

// Kills the Node process so Docker's `restart: unless-stopped` brings
// the container back up, which re-runs the compose entrypoint:
// `cp /repo/frontend/. /app/ && npm run build && npx next start`.
//
// Access control: internal network only. Requests arriving through
// Traefik (public internet) carry X-Forwarded-* headers; direct calls
// from other containers on the Docker `internal` network don't. We
// refuse anything with forwarded headers so the public URL can't
// trigger rebuilds, but containers (e.g. the agent) can POST without
// auth.

export async function POST(request: NextRequest) {
  // Allow only requests addressed to the internal service hostname.
  // Traefik forwards external traffic with host = public domain, while
  // containers on the Docker `internal` network hit the service directly
  // (host = "dashboard:3000" or "dashboard").
  const host = (request.headers.get("host") || "").toLowerCase();
  const hostname = host.split(":")[0];
  const internalHosts = new Set(["dashboard", "localhost", "127.0.0.1"]);
  if (!internalHosts.has(hostname)) {
    return NextResponse.json(
      { error: "rebuild endpoint is internal-only" },
      { status: 403 },
    );
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
