---
name: dashboard
description: "How the nanobot dashboard works: creating agents, adding custom pages/skills, using the PocketBase db, and rebuilding the dashboard after adding a page. Use whenever the user asks about the dashboard, custom pages, custom skills, or creating/managing agents."
always: true
---

# Dashboard guide

The nanobot dashboard is a Next.js app in `frontend/` that wraps the agent. It gives the user:

- **Chat** at `/chat` — talk to the agent (persisted in PocketBase)
- **Files** at `/files` — browse & edit the agent workspace
- **MCP** at `/mcp` — connect external MCP servers (OAuth supported)
- Anything else at `/<name>` — user-built pages you can add

Every route except `/login` gets the sidebar automatically via the root layout — no per-page setup needed.

## Architecture at a glance

| Piece | Where it lives | Purpose |
|-------|---------------|---------|
| Core UI | `frontend/app/{chat,files,mcp}/` (tracked) | Ships with nanobot |
| Instance pages | `frontend/app/<name>/` (gitignored per user) | User-built pages |
| Sidebar nav | `frontend/config/custom-nav.json` (gitignored) | Adds non-core pages to the sidebar |
| Shared chrome | `frontend/components/AppShell.tsx` | Sidebar + tab bar wrapping every page |
| Page header | `frontend/components/PageHeader.tsx` | Consistent page title/subtitle/actions bar |
| Chat/messages | PocketBase `messages` collection | **Single source of truth** |
| Agents/sessions | PocketBase `agents`, `sessions` | Persisted across restarts |
| Skill data | PocketBase (tables created by `db` tool) | Opt-in per skill |

## Runtime is single-agent

Even though PocketBase has an `agents` collection, **nanobot runs one agent per process**. The URLs `/chat`, `/files`, `/mcp` are not agent-scoped — they operate on the single agent nanobot was started with. Don't promise multi-agent switching; it isn't wired up.

## Creating a new agent

Edit `config.json` (at `$HOME/.nanobot/config.json`) to point nanobot at a different workspace, then restart nanobot. The PB `agents` row is cosmetic — used by the Files page to know the workspace path.

## Adding a custom page

> **Critical — where the files live**
> The agent runs inside the `nanobot-api` container; its default cwd
> is `/data/.nanobot/workspace`, but the Next.js dashboard is built
> from the nanobot repo clone at **`/app`** (a shared volume). You
> MUST write pages and config using absolute paths under `/app`,
> not relative paths from your workspace. Files under
> `/data/.nanobot/workspace/frontend/...` are invisible to the
> dashboard and will do nothing.

### 1. Create the page file at the absolute path

```tsx
// FILE: /app/frontend/app/<name>/page.tsx   (note the leading /)
"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader"; // NAMED import, not default
import pb from "@/lib/pocketbase";

export default function MyPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    pb.collection("my_collection").getFullList({ sort: "-created" }).then(setRows).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="My Page" subtitle="Short description" />
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 py-5">
          {/* content */}
        </div>
      </div>
    </div>
  );
}
```

- `PageHeader` is a **named export** — use `import { PageHeader }`, not `import PageHeader`.
- URL path is just `/<name>` (no `/custom/` prefix).
- The sidebar is rendered by the root layout — don't add it again.

### 2. Register the sidebar link at the absolute path

File: **`/app/frontend/config/custom-nav.json`** (create if missing).

```json
{
  "items": [
    { "label": "My Page", "href": "/my-page", "icon": "Records" }
  ]
}
```

The `href` must match the page URL (`/<name>`). Available icons: `Chat`, `Files`, `MCP`, `Records` (fallback).

### 3. Optional: server-side API route

If the page needs filesystem access or secrets, add `frontend/app/api/<name>/route.ts`. It runs on the dashboard's Node process with the same env as the UI.

### 4. **Rebuild the dashboard** (required)

Next.js only knows about routes at build time. **A new page file is invisible until the dashboard is rebuilt.** You have everything needed to do this yourself — do not ask the user to run curl.

The endpoint is internal-only (rejects anything with `X-Forwarded-*` headers), so no auth header is required from the agent container. Use `$DASHBOARD_INTERNAL_URL` (pre-set, typically `http://dashboard:3000`).

Use the `exec` tool:

```bash
curl -X POST "$DASHBOARD_INTERNAL_URL/api/dashboard/rebuild"
```

Expected output: `{"status":"rebuilding","eta_seconds":90}` (HTTP 202).

**Before you run it, tell the user**: "I'm going to trigger the dashboard rebuild — the site will be unavailable for ~90 seconds. Refresh after that and the new page will be live." Then run the curl. Don't rebuild silently mid-conversation.

## Custom skills

Skills teach the agent *how* to do things. Markdown files with frontmatter, loaded at startup.

- **Bundled skills** live in `nanobot/skills/<name>/SKILL.md` (ships with nanobot).
- **User skills** live in the agent's workspace at `skills/<name>/SKILL.md`, and override bundled skills of the same name.

When the user asks to build a new skill, invoke the **skill-creator** skill — it handles scaffolding, frontmatter, and writing conventions. Don't hand-roll from scratch.

Skill frontmatter:
```yaml
---
name: my-skill
description: "One-line description of when this skill applies"
always: true   # or omit to load on demand
---
```

## PocketBase: data-backed skills

Only use the `db` tool when the user **explicitly requests** data to be stored in the database ("track in the db", "save to the database", etc.). Without that opt-in, don't touch `db`.

Frontend queries:
```ts
pb.collection("name").getFullList({ sort: "-created" });
pb.collection("name").getFullList({ filter: "value > 500" });
pb.collection("name").getOne("record_id");
pb.collection("name").getList(page, perPage);
```

## Design conventions

- Use `PageHeader` for the page title bar — it keeps heights consistent.
- CSS variables only: `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--bg-elevated)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-tertiary)`, `var(--accent)`, `var(--accent-soft)`, `var(--border)`, `var(--border-strong)`.
- Rounded containers: `rounded-xl` or `rounded-2xl`.
- Type: titles `text-[15px] sm:text-[16px]`, body `text-[13px]`, section headers `text-[10px] uppercase tracking-[0.1em]`.
- Dark mode is automatic via the variables.

## Quick troubleshooting

- **New page 404s after creation** → forgot to rebuild. Call `/api/dashboard/rebuild`.
- **Sidebar missing on a page** → the page renders its own `<Sidebar>` or wraps in its own `<html>` chrome. Remove it; the root layout handles it.
- **Custom nav link doesn't show** → `config/custom-nav.json` is missing or invalid JSON.
- **Agent restart needed** (config/skill change) → `POST /restart` on the nanobot API (MCP page has a "Restart Agent" button).
