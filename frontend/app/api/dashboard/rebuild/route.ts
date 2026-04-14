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
  const forwarded =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("x-forwarded-proto") ||
    request.headers.get("x-real-ip");

  if (forwarded) {
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
