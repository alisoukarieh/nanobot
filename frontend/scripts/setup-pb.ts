/**
 * Create the required PocketBase collections for the nanobot dashboard.
 *
 * Usage: npx tsx scripts/setup-pb.ts [pocketbase-url]
 *
 * Before running, create a superuser in PocketBase admin UI at http://localhost:8090/_/
 * Then set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars.
 */

const PB_URL = process.argv[2] || process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://localhost:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || "";

async function request(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.status === 204 ? {} : res.json();
}

async function auth(): Promise<string> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars.\n" +
      "Create a superuser first at " + PB_URL + "/_/"
    );
  }
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function collectionExists(token: string, name: string): Promise<boolean> {
  try {
    await request("GET", `/api/collections/${name}`, token);
    return true;
  } catch {
    return false;
  }
}

const COLLECTIONS = [
  {
    name: "agents",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "description", type: "text" },
      { name: "workspace_path", type: "text", required: true },
    ],
  },
  {
    name: "sessions",
    type: "base",
    fields: [
      { name: "agent", type: "relation", required: true, options: { collectionId: "", maxSelect: 1 } },
      { name: "title", type: "text" },
    ],
  },
  {
    name: "messages",
    type: "base",
    fields: [
      { name: "session", type: "relation", required: true, options: { collectionId: "", maxSelect: 1 } },
      { name: "role", type: "text", required: true },
      { name: "content", type: "text" },
    ],
  },
];

async function main() {
  console.log(`Setting up PocketBase at ${PB_URL}...\n`);

  const token = await auth();
  console.log("Authenticated.\n");

  // Create collections in order (agents first, then sessions, then messages)
  const collectionIds: Record<string, string> = {};

  for (const col of COLLECTIONS) {
    if (await collectionExists(token, col.name)) {
      console.log(`  [skip] ${col.name} already exists`);
      // Fetch existing ID for relations
      const existing = await request("GET", `/api/collections/${col.name}`, token);
      collectionIds[col.name] = existing.id;
      continue;
    }

    // Resolve relation references
    const fields = col.fields.map((f: any) => {
      if (f.type === "relation" && f.options) {
        const refName = col.name === "sessions" ? "agents" : "sessions";
        return { ...f, options: { ...f.options, collectionId: collectionIds[refName] || "" } };
      }
      return f;
    });

    const result = await request("POST", "/api/collections", token, {
      name: col.name,
      type: col.type,
      fields,
    });
    collectionIds[col.name] = result.id;
    console.log(`  [created] ${col.name} (id: ${result.id})`);
  }

  console.log("\nDone. Collections ready.");
  console.log("\nNext: create an agent record in PocketBase admin UI:");
  console.log(`  ${PB_URL}/_/#/collections/agents`);
}

main().catch((e) => {
  console.error("\nError:", e.message);
  process.exit(1);
});
