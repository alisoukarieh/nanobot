import { NextRequest, NextResponse } from "next/server";

const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey");
  if (!sessionKey) {
    return NextResponse.json({ messages: [] });
  }

  try {
    // Find session by key
    const sessRes = await fetch(
      `${PB_URL}/api/collections/sessions/records?filter=${encodeURIComponent(`key = '${sessionKey}'`)}&perPage=1`,
    );
    const sessData = await sessRes.json();
    const session = sessData.items?.[0];
    if (!session) {
      return NextResponse.json({ messages: [] });
    }

    // Load messages
    const msgRes = await fetch(
      `${PB_URL}/api/collections/messages/records?filter=${encodeURIComponent(`session = '${session.id}'`)}&sort=created&perPage=500`,
    );
    const msgData = await msgRes.json();
    const messages = (msgData.items || []).map((m: any) => ({
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
