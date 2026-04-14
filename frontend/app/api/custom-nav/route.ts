import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const configPath = path.join(process.cwd(), "config", "custom-nav.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ items: [] });
  }
}
