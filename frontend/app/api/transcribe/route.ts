import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "transcription not configured" },
      { status: 503 },
    );
  }

  const inbound = await request.formData();
  const file = inbound.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filename =
    (typeof (file as File).name === "string" && (file as File).name) ||
    (file.type.includes("webm") ? "audio.webm" : "audio.bin");

  const outbound = new FormData();
  outbound.append("file", file, filename);
  outbound.append("model", MODEL);
  const language = inbound.get("language");
  if (typeof language === "string" && language) {
    outbound.append("language", language);
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: outbound,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `groq ${res.status}`, detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text?.trim() || "" });
  } catch {
    return NextResponse.json({ error: "transcription failed" }, { status: 500 });
  }
}
