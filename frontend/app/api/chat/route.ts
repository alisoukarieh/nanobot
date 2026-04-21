import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_URL = process.env.NANOBOT_API_URL || "http://localhost:8900";
const API_KEY = process.env.NANOBOT_API_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_KEY) {
      headers["Authorization"] = `Bearer ${API_KEY}`;
    }

    const res = await fetch(`${API_URL}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const isStream = (res.headers.get("content-type") || "").includes("text/event-stream");
    if (isStream && res.body) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e.message || "Failed to reach agent" } },
      { status: 502 },
    );
  }
}
