import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

function resolveSafe(workspace: string, filePath: string): string | null {
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) return null;
  return resolved;
}

export async function GET(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace");
  const filePath = request.nextUrl.searchParams.get("path") || ".";

  if (!workspace) {
    return NextResponse.json({ error: "workspace required" }, { status: 400 });
  }

  const resolved = resolveSafe(workspace, filePath);
  if (!resolved) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  try {
    const stat = await fs.stat(resolved);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith("."))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory())
            return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map((e) => ({
          name: e.name,
          path: path.join(filePath === "." ? "" : filePath, e.name),
          type: e.isDirectory() ? "directory" : "file",
        }));
      return NextResponse.json({ type: "directory", entries: items });
    }

    const content = await fs.readFile(resolved, "utf-8");
    return NextResponse.json({ type: "file", content, size: stat.size });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace");
  const filePath = request.nextUrl.searchParams.get("path");

  if (!workspace || !filePath) {
    return NextResponse.json(
      { error: "workspace and path required" },
      { status: 400 }
    );
  }

  const resolved = resolveSafe(workspace, filePath);
  if (!resolved) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  try {
    const body = await request.json();
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, body.content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "write failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const workspace = request.nextUrl.searchParams.get("workspace");
  const filePath = request.nextUrl.searchParams.get("path");

  if (!workspace || !filePath) {
    return NextResponse.json(
      { error: "workspace and path required" },
      { status: 400 }
    );
  }

  const resolved = resolveSafe(workspace, filePath);
  if (!resolved) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  try {
    await fs.rm(resolved, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
