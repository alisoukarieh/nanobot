/**
 * Create or update PocketBase collections for the nanobot dashboard.
 *
 * Usage: npx tsx scripts/setup-pb.ts [pocketbase-url]
 *
 * Env vars:
 *   PB_ADMIN_EMAIL    - superuser email
 *   PB_ADMIN_PASSWORD - superuser password
 *   NEXT_PUBLIC_POCKETBASE_URL - fallback URL (default: http://localhost:8090)
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
  return res.status === 204 ? null : res.json();
}

async function auth(): Promise<string> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars.\n" +
        "Create a superuser first at " + PB_URL + "/_/",
    );
  }
  const res = await fetch(
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    },
  );
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
  return (await res.json()).token;
}

async function getCollection(
  token: string,
  name: string,
): Promise<{ id: string; fields: any[] } | null> {
  try {
    return (await request("GET", `/api/collections/${name}`, token)) as any;
  } catch {
    return null;
  }
}

function hasField(fields: any[], name: string): boolean {
  return fields.some((f: any) => f.name === name);
}

// ── Collection definitions ──────────────────────────────────────────

interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  collectionId?: string;
  maxSelect?: number;
}

interface CollectionDef {
  name: string;
  type: string;
  fields: FieldDef[];
  /** Name of the collection this one's relation fields point to */
  relationTarget?: string;
}

const COLLECTIONS: CollectionDef[] = [
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
    relationTarget: "agents",
    fields: [
      { name: "agent", type: "relation", required: false, collectionId: "", maxSelect: 1 },
      { name: "key", type: "text", required: true },
      { name: "title", type: "text" },
      { name: "last_consolidated", type: "number" },
      { name: "metadata", type: "text" },
    ],
  },
  {
    name: "messages",
    type: "base",
    relationTarget: "sessions",
    fields: [
      { name: "session", type: "relation", required: true, collectionId: "", maxSelect: 1 },
      { name: "role", type: "text", required: true },
      { name: "content", type: "text" },
      { name: "position", type: "number" },
      { name: "timestamp", type: "text" },
      { name: "extra", type: "text" },
    ],
  },
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Setting up PocketBase at ${PB_URL}...\n`);

  const token = await auth();
  console.log("Authenticated.\n");

  const collectionIds: Record<string, string> = {};

  for (const col of COLLECTIONS) {
    const existing = await getCollection(token, col.name);

    // Resolve relation collectionId
    const fields = col.fields.map((f) => {
      if (f.type === "relation" && col.relationTarget) {
        return { ...f, collectionId: collectionIds[col.relationTarget] || f.collectionId };
      }
      return f;
    });

    if (existing) {
      collectionIds[col.name] = existing.id;

      // Check for missing fields and add them
      const missing = fields.filter((f) => !hasField(existing.fields, f.name));
      if (missing.length === 0) {
        console.log(`  [ok] ${col.name} — all fields present`);
        continue;
      }

      // Patch: add missing fields to existing collection
      const updatedFields = [...existing.fields, ...missing];
      await request("PATCH", `/api/collections/${existing.id}`, token, {
        fields: updatedFields,
      });
      console.log(
        `  [updated] ${col.name} — added: ${missing.map((f) => f.name).join(", ")}`,
      );
    } else {
      // Create new collection
      const result = (await request("POST", "/api/collections", token, {
        name: col.name,
        type: col.type,
        fields,
      })) as any;
      collectionIds[col.name] = result.id;
      console.log(`  [created] ${col.name} (id: ${result.id})`);
    }

    // Set API rules: allow any authenticated user to read/write
    const colId = collectionIds[col.name];
    const authRule = '@request.auth.id != ""';
    await request("PATCH", `/api/collections/${colId}`, token, {
      listRule: authRule,
      viewRule: authRule,
      createRule: authRule,
      updateRule: authRule,
      deleteRule: authRule,
    });
  }

  // Ensure users auth collection exists (PB may have it built-in)
  const usersCol = await getCollection(token, "users");
  if (usersCol) {
    console.log(`  [ok] users — auth collection exists`);
  } else {
    await request("POST", "/api/collections", token, {
      name: "users",
      type: "auth",
      fields: [
        { name: "name", type: "text" },
      ],
    });
    console.log(`  [created] users — auth collection`);
  }

  // Create a default dashboard user if none exist
  try {
    const existing = await request("GET", "/api/collections/users/records?perPage=1", token);
    if ((existing as any)?.totalItems === 0) {
      const email = process.env.DASHBOARD_USER_EMAIL || "admin@nanobot.local";
      const pass = process.env.DASHBOARD_USER_PASSWORD || "nanobot2026";
      await request("POST", "/api/collections/users/records", token, {
        email,
        password: pass,
        passwordConfirm: pass,
        name: "Admin",
      });
      console.log(`  [created] default user: ${email} / ${pass}`);
    } else {
      console.log(`  [ok] users — has existing records`);
    }
  } catch (e: any) {
    console.log(`  [skip] users — ${e.message?.slice(0, 80)}`);
  }

  console.log("\nDone. Collections ready.");
}

main().catch((e) => {
  console.error("\nError:", e.message);
  process.exit(1);
});
