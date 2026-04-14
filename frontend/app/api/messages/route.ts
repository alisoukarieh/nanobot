import { NextRequest, NextResponse } from "next/server";

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey");
  if (!sessionKey) {
    return NextResponse.json({ messages: [] });
  }

  try {
    // Find session by key
    // Find all sessions matching this key and pick the one with messages
    const sessRes = await fetch(
      `${PB_URL}/api/collections/sessions/records?filter=${encodeURIComponent(`key = '${sessionKey}'`)}&perPage=50`,
    );
    const sessData = await sessRes.json();
    const sessions = sessData.items || [];
    if (sessions.length === 0) {
      return NextResponse.json({ messages: [] });
    }
    // If multiple, pick the one with the most messages
    const allMsgs = await fetch(`${PB_URL}/api/collections/messages/records?perPage=500`).then((r) => r.json());
    const counts = new Map<string, number>();
    for (const m of allMsgs.items || []) counts.set(m.session, (counts.get(m.session) || 0) + 1);
    const session = sessions.reduce((best: any, s: any) =>
      (counts.get(s.id) || 0) > (counts.get(best.id) || 0) ? s : best, sessions[0]
    );

    // Load ALL messages then filter by session ID in JS
    // (PB 0.36 relation filters are unreliable without auth)
    const msgRes = await fetch(
      `${PB_URL}/api/collections/messages/records?perPage=500`,
    );
    const msgData = await msgRes.json();
    const messages = (msgData.items || [])
      .filter((m: any) => m.session === session.id)
      .map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created: m.created,
      }));

    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
