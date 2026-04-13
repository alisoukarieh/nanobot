import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const { serverName, serverUrl } = await request.json();

  if (!serverName || !serverUrl) {
    return NextResponse.json({ error: "serverName and serverUrl required" }, { status: 400 });
  }

  try {
    // Discover OAuth metadata from .well-known
    const baseUrl = serverUrl.replace(/\/mcp\/?$/, "").replace(/\/sse\/?$/, "");
    const metaRes = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);

    if (!metaRes.ok) {
      return NextResponse.json({ error: "Server does not support OAuth discovery" }, { status: 400 });
    }

    const meta = await metaRes.json();
    const authEndpoint: string = meta.authorization_endpoint;
    const tokenEndpoint: string = meta.token_endpoint;
    const registrationEndpoint: string | undefined = meta.registration_endpoint;

    if (!authEndpoint || !tokenEndpoint) {
      return NextResponse.json({ error: "Missing auth/token endpoints in metadata" }, { status: 400 });
    }

    // Dynamic Client Registration
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/oauth/callback`;

    let clientId: string;
    if (registrationEndpoint) {
      const regRes = await fetch(registrationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "nanobot-dashboard",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      });

      if (!regRes.ok) {
        return NextResponse.json({ error: `Client registration failed: ${await regRes.text()}` }, { status: 502 });
      }

      const regData = await regRes.json();
      clientId = regData.client_id;
    } else {
      return NextResponse.json({ error: "No registration endpoint — provide a client_id manually" }, { status: 400 });
    }

    // Generate PKCE
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // Build state (encoded data for callback)
    const state = Buffer.from(
      JSON.stringify({ serverName, tokenEndpoint, clientId, codeVerifier, redirectUri })
    ).toString("base64url");

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const scopes = meta.scopes_supported;
    if (scopes && scopes.length > 0) {
      params.set("scope", scopes.join(" "));
    }

    const authUrl = `${authEndpoint}?${params.toString()}`;

    return NextResponse.json({ authUrl, clientId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
