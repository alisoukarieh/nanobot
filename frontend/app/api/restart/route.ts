import { NextResponse } from "next/server";

const API_URL = process.env.NANOBOT_API_URL || "http://localhost:8900";
const API_KEY = process.env.NANOBOT_API_KEY || "";

export async function POST() {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

    await fetch(`${API_URL}/restart`, { method: "POST", headers }).catch(() => {});

    return NextResponse.json({ ok: true, message: "Restart signal sent" });
  } catch {
    return NextResponse.json({ error: "Failed to send restart signal" }, { status: 502 });
  }
}
