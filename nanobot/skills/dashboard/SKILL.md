---
name: dashboard
description: "How the nanobot dashboard works: creating agents, adding custom pages/skills, using the PocketBase db, and the custom overlay pattern. Use whenever the user asks about the dashboard, custom pages, custom skills, or creating/managing agents."
always: true
---

# Dashboard guide

The nanobot dashboard is a Next.js app in `frontend/` that wraps the agent. It gives the user:

- **Chat** — talk to the agent (persisted in PocketBase)
- **Files** — browse & edit the agent workspace
- **MCP** — connect external MCP servers (OAuth supported)
- **Custom pages** — user-built pages that live under `/custom/` and stay out of upstream git pulls

## Architecture at a glance

| Piece | Where it lives | Purpose |
|-------|---------------|---------|
| Core UI | `frontend/app/agent/[id]/*` (tracked) | Chat/Files/MCP — ships with nanobot |
| Custom overlay | `frontend/app/custom/*` (gitignored) | User pages, kept out of upstream merges |
| Custom sidebar nav | `frontend/config/custom-nav.json` (gitignored) | Registers custom pages in the sidebar |
| Shared chrome | `frontend/components/AppShell.tsx` | Sidebar + tab bar wrapping every page |
| Page header | `frontend/components/PageHeader.tsx` | Consistent page title/subtitle/actions bar |
| Data | PocketBase at `http://localhost:8090` | Auth, chat history, skill data |

Every route except `/login` gets the sidebar automatically via the root layout — no per-page setup needed.

## Creating a new agent

Agents are rows in the PocketBase `agents` collection.

**Option A — PocketBase admin UI** (easiest for the user):
1. Open `http://localhost:8090/_/` and sign in with the admin credentials.
2. Open the `agents` collection and click "+ New record".
3. Fill in `name`, `description` (optional), and `workspace_path` (absolute path the agent should work out of).
4. Save. Refresh the dashboard — the agent appears in the sidebar.

**Option B — programmatically** (if the user wants to script it):
```python
from nanobot.nanobot import Nanobot
# ... or via the PocketBase REST API directly
```

The dashboard lists whatever is in the `agents` collection. There is no extra registration step.

## Custom pages (the overlay pattern)

`frontend/app/custom/` and `frontend/config/custom-nav.json` are **gitignored**. This lets the user add pages without fighting merge conflicts when they pull upstream nanobot updates.

### 1. Create the page

```tsx
// frontend/app/custom/<name>/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {/* content */}
        </div>
      </div>
    </div>
  );
}
```

The sidebar is already rendered by the root layout — don't add it again.

### 2. Register the sidebar link

Edit `frontend/config/custom-nav.json` (copy from `custom-nav.example.json` if it doesn't exist):

```json
{
  "items": [
    { "label": "My Page", "href": "/custom/my-page", "icon": "records" }
  ]
}
```

Available icons: `Chat`, `Files`, `MCP`, `Records` (fallback for anything else).

### 3. (Optional) Server-side API routes

If the page needs server-only access (filesystem, secrets), put API routes under `frontend/app/custom/api/<name>/route.ts`. Those are also gitignored.

## Custom skills

Skills teach the agent *how* to do things. They're markdown files with frontmatter that the agent loads on startup.

- **Bundled skills** live in `nanobot/skills/` (tracked — shipped with nanobot).
- **User skills** live in the agent's workspace under `skills/<skill-name>/SKILL.md`.

When the user asks to build a new skill, invoke the **skill-creator** skill — it handles scaffolding, frontmatter, and the writing conventions. Do not hand-roll a skill from scratch.

Skill frontmatter:
```yaml
---
name: my-skill
description: "One-line description of when this skill applies"
always: true   # or omit to load on demand
---
```

## PocketBase: data-backed skills

When the user says "track X in the db", "store this in the database", etc., use the **`db` tool** to create a collection and insert/query/update/delete records. Without that explicit opt-in, don't touch the db.

Common queries from the frontend:
```ts
pb.collection("name").getFullList({ sort: "-created" });
pb.collection("name").getFullList({ filter: "value > 500" });
pb.collection("name").getOne("record_id");
pb.collection("name").getList(page, perPage);
```

## Design conventions

Stick to these so custom pages feel native:

- Use `PageHeader` for the page title bar.
- Use CSS variables: `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--bg-elevated)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-tertiary)`, `var(--accent)`, `var(--accent-soft)`, `var(--border)`, `var(--border-strong)`.
- Rounded containers: `rounded-xl` or `rounded-2xl`.
- Type scale: titles ~`text-[19px] font-semibold`, body `text-[13px]`, captions `text-[11px]` uppercase for section headers.
- Dark mode is automatic — just use the variables.

## Quick troubleshooting

- **Sidebar missing on a page** → the page probably renders `<Sidebar>` itself or wraps in its own `<html>` chrome. Remove it; the root layout handles it.
- **Custom nav link doesn't show** → `frontend/config/custom-nav.json` isn't there or isn't valid JSON. Check the file and reload.
- **Agent restart needed** → hit `POST /restart` on the nanobot API (the MCP page has a "Restart Agent" button for this).
