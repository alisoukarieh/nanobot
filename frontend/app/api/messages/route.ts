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
      `${PB_URL}/api/collections/sessions/records?filter=${encodeURIComponent(`key = '${sessionKey}'`)}&sort=-updated&perPage=1`,
    );
    const sessData = await sessRes.json();
    const session = sessData.items?.[0];
    if (!session) {
      return NextResponse.json({ messages: [] });
    }

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
