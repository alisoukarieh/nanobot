import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";

const CONFIG_PATH = process.env.NANOBOT_CONFIG_PATH || "/data/.nanobot/config.json";

async function readConfig(): Promise<any> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeConfig(config: any): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export async function GET() {
  const config = await readConfig();
  const servers = config.tools?.mcp_servers || config.tools?.mcpServers || {};
  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  try {
    const { name, type, command, args, url, headers, env, auth } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const config = await readConfig();
    if (!config.tools) config.tools = {};
    if (!config.tools.mcp_servers && !config.tools.mcpServers) {
      config.tools.mcpServers = {};
    }
    const servers = config.tools.mcp_servers || config.tools.mcpServers;

    const entry: any = {};
    if (type) entry.type = type;
    if (type === "stdio") {
      if (!command) {
        return NextResponse.json({ error: "command is required for stdio" }, { status: 400 });
      }
      entry.command = command;
      entry.args = args || [];
      if (env && Object.keys(env).length) entry.env = env;
    } else {
      if (!url) {
        return NextResponse.json({ error: "url is required for sse/http" }, { status: 400 });
      }
      entry.url = url;
      if (headers && Object.keys(headers).length) entry.headers = headers;
      if (auth) entry.auth = auth;
    }

    servers[name] = entry;
    await writeConfig(config);

    return NextResponse.json({ ok: true, servers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name param required" }, { status: 400 });
  }

  const config = await readConfig();
  const servers = config.tools?.mcp_servers || config.tools?.mcpServers || {};
  delete servers[name];
  await writeConfig(config);

  return NextResponse.json({ ok: true, servers });
}
