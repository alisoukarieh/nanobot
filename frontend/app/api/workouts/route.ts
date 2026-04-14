import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace");
  if (!workspace) {
    return NextResponse.json({ entries: [] });
  }

  const filePath = path.join(workspace, "data", "gym", "workouts.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const entries = JSON.parse(raw);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
