import { NextRequest, NextResponse } from "next/server";

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface PbMessage {
  id: string;
  session: string;
  role: string;
  content: string;
  // The messages collection uses a custom `timestamp` field rather than
  // PB's auto-generated `created`. Fall back to created if missing.
  timestamp?: string;
  created?: string;
  position?: number;
}

function msgTime(m: PbMessage): string {
  return m.timestamp || m.created || "";
}

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey");
  const before = request.nextUrl.searchParams.get("before"); // ISO timestamp; return messages strictly older than this
  const limitParam = parseInt(request.nextUrl.searchParams.get("limit") || "", 10);
  const limit = Math.min(MAX_LIMIT, Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT);

  if (!sessionKey) {
    return NextResponse.json({ messages: [], hasMore: false });
  }

  try {
    // Find session by key (PB 0.36 filter syntax: single quotes inside the expression)
    const sessRes = await fetch(
      `${PB_URL}/api/collections/sessions/records?filter=${encodeURIComponent(`key = '${sessionKey}'`)}&perPage=50`,
    );
    const sessData = await sessRes.json();
    const sessions: Array<{ id: string }> = sessData.items || [];
    if (sessions.length === 0) {
      return NextResponse.json({ messages: [], hasMore: false });
    }

    // Pull all messages once (PB relation filters unreliable without auth);
    // we'll filter to this session and sort/slice in JS.
    const allMsgs = await fetch(`${PB_URL}/api/collections/messages/records?perPage=500`).then((r) => r.json());
    const items: PbMessage[] = allMsgs.items || [];

    // Duplicate sessions can accumulate under the same key across restarts.
    // Pick the one the agent is currently writing to — the session whose
    // latest message has the newest timestamp. This matches what the user
    // sees in chat and avoids reading from a stale session with more history.
    const latestPerSession = new Map<string, string>();
    for (const m of items) {
      const t = msgTime(m);
      const prev = latestPerSession.get(m.session) || "";
      if (t > prev) latestPerSession.set(m.session, t);
    }
    const session = sessions.reduce((best, s) => {
      const bt = latestPerSession.get(best.id) || "";
      const st = latestPerSession.get(s.id) || "";
      return st > bt ? s : best;
    }, sessions[0]);

    // Sort newest-first using timestamp (or created fallback), apply `before` cursor,
    // take `limit`, then reverse to oldest-first for display.
    const sessionMessages = items
      .filter((m) => m.session === session.id)
      .sort((a, b) => (msgTime(a) < msgTime(b) ? 1 : -1)); // DESC

    const filtered = before ? sessionMessages.filter((m) => msgTime(m) < before) : sessionMessages;
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > page.length;

    const messages = page
      .reverse() // oldest-first
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created: msgTime(m),
      }));

    return NextResponse.json({ messages, hasMore });
  } catch {
    return NextResponse.json({ messages: [], hasMore: false });
  }
}
