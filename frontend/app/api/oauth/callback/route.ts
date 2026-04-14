import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";

const CONFIG_PATH = process.env.NANOBOT_CONFIG_PATH || "/data/.nanobot/config.json";

async function readConfig(): Promise<any> {
  try { return JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8")); }
  catch { return {}; }
}

async function writeConfig(config: any): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return new NextResponse("Missing code or state", { status: 400 });
  }

  // Decode state: contains serverName + tokenEndpoint + clientId + codeVerifier
  let stateData: any;
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return new NextResponse("Invalid state", { status: 400 });
  }

  const { serverName, tokenEndpoint, clientId, codeVerifier, redirectUri } = stateData;

  // Exchange authorization code for token
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new NextResponse(`Token exchange failed: ${err}`, { status: 502 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new NextResponse("No access_token in response", { status: 502 });
    }

    // Save token to config
    const config = await readConfig();
    const servers = config.tools?.mcp_servers || config.tools?.mcpServers || {};
    if (servers[serverName]) {
      servers[serverName].auth = accessToken;
      // Also store refresh token if present
      if (tokenData.refresh_token) {
        servers[serverName]._refresh_token = tokenData.refresh_token;
      }
    }
    await writeConfig(config);

    // Redirect to dashboard — use referrer's agent id if available, else root
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = process.env.DASHBOARD_URL
      || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin);
    // Root redirects to first agent → MCP page via query param
    return NextResponse.redirect(
      `${baseUrl}/?connected=${encodeURIComponent(serverName)}`
    );
  } catch (e: any) {
    return new NextResponse(`OAuth error: ${e.message}`, { status: 500 });
  }
}
