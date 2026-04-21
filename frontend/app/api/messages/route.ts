import { NextRequest, NextResponse } from "next/server";

// PocketBase is the single source of truth for chat history. nanobot
// guarantees one `sessions` row per key, so we look it up directly and
// page through its messages by timestamp.

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface PbMessage {
  id: string;
  session: string;
  role: string;
  content: string;
  timestamp?: string;
  created?: string;
}

function msgTime(m: PbMessage): string {
  return m.timestamp || m.created || "";
}

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey");
  const before = request.nextUrl.searchParams.get("before"); // ISO timestamp
  const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") || "", 10);
  const limit = Math.min(MAX_LIMIT, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_LIMIT);

  if (!sessionKey) {
    return NextResponse.json({ messages: [], hasMore: false });
  }

  try {
    const sessRes = await fetch(
      `${PB_URL}/api/collections/sessions/records?filter=${encodeURIComponent(`key = '${sessionKey}'`)}&perPage=1`,
    );
    const sessData = await sessRes.json();
    const sessions: Array<{ id: string }> = sessData.items || [];
    if (sessions.length === 0) {
      return NextResponse.json({ messages: [], hasMore: false });
    }
    const sessionId = sessions[0].id;

    const filterParts = [`session.id = '${sessionId}'`];
    if (before) filterParts.push(`timestamp < '${before}'`);
    const filter = filterParts.join(" && ");

    // Fetch limit+1 server-side, newest first, to detect hasMore in one call.
    const msgsUrl = `${PB_URL}/api/collections/messages/records?filter=${encodeURIComponent(filter)}&sort=-timestamp&perPage=${limit + 1}`;
    const msgsData = await fetch(msgsUrl).then((r) => r.json());
    const items: PbMessage[] = msgsData.items || [];

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);

    const messages = page
      .reverse()
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
