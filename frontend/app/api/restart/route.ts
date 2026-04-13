import { NextResponse } from "next/server";

const NANOBOT_API_URL = process.env.NANOBOT_API_URL || "http://localhost:8900";
const NANOBOT_API_KEY = process.env.NANOBOT_API_KEY || "";

export async function POST() {
  // The nanobot API doesn't have a restart endpoint, so we send a /restart
  // command through the chat completions endpoint. The agent's built-in
  // /restart command triggers os.execv to restart the process.
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (NANOBOT_API_KEY) headers["Authorization"] = `Bearer ${NANOBOT_API_KEY}`;

    await fetch(`${NANOBOT_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [{ role: "user", content: "/restart" }],
      }),
    }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Restart signal sent" });
  } catch {
    return NextResponse.json({ error: "Failed to send restart signal" }, { status: 502 });
  }
}
