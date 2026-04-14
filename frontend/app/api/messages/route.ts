import { NextRequest, NextResponse } from "next/server";

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface PbMessage {
  id: string;
  session: string;
  role: string;
  content: string;
  created: string;
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

    // Pick the session that has the most messages under this key (handles dup sessions)
    const counts = new Map<string, number>();
    for (const m of items) counts.set(m.session, (counts.get(m.session) || 0) + 1);
    const session = sessions.reduce(
      (best, s) => ((counts.get(s.id) || 0) > (counts.get(best.id) || 0) ? s : best),
      sessions[0],
    );

    // Sort newest-first, apply `before` cursor, take `limit`, then reverse to oldest-first for display
    const sessionMessages = items
      .filter((m) => m.session === session.id)
      .sort((a, b) => (a.created < b.created ? 1 : -1)); // DESC

    const filtered = before ? sessionMessages.filter((m) => m.created < before) : sessionMessages;
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > page.length;

    const messages = page
      .reverse() // oldest-first
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created: m.created,
      }));

    return NextResponse.json({ messages, hasMore });
  } catch {
    return NextResponse.json({ messages: [], hasMore: false });
  }
}
