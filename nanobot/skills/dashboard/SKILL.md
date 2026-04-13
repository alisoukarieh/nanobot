---
name: dashboard
description: "Add custom dashboard pages and components to the Next.js frontend. Use when the user asks to create a dashboard view, chart, or UI for skill data."
always: true
---

# Dashboard

The nanobot dashboard is a Next.js app that lives alongside the agent codebase.

## Location

The frontend root is at the `frontend/` directory relative to the project root. Key paths:

- `frontend/components/` — reusable React components
- `frontend/app/agent/[id]/` — agent-scoped pages (chat, files, and custom pages)
- `frontend/lib/` — shared utilities, PocketBase client, hooks
- `frontend/lib/types.ts` — TypeScript interfaces

## Adding a custom dashboard page for a skill

When a skill stores data in PocketBase (via the `db` tool), the user may ask for a dashboard page
to visualize that data. Create the page under the agent route:

```
frontend/app/agent/[id]/<page-name>/page.tsx
```

Then add a tab for it in `frontend/components/TabBar.tsx` by adding an entry to the `tabs` array.

## Component conventions

- Use `"use client"` directive for interactive components
- Import PocketBase client from `@/lib/pocketbase`
- Query collections with `pb.collection("collection_name").getFullList()`
- Use Tailwind CSS for styling
- Follow the existing design: clean, minimal, Apple-inspired
- Use CSS variables from `globals.css`: `var(--bg-primary)`, `var(--text-secondary)`, `var(--accent)`, etc.

## Example: adding a calorie chart page

```tsx
// frontend/app/agent/[id]/calories/page.tsx
"use client";

import { useEffect, useState } from "react";
import pb from "@/lib/pocketbase";

export default function CaloriesPage() {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    pb.collection("calorie_logs")
      .getFullList({ sort: "-created" })
      .then(setRecords)
      .catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Calorie Log</h2>
      {/* render records */}
    </div>
  );
}
```

Then add `{ label: "Calories", href: \`/agent/\${agentId}/calories\` }` to the tabs array in TabBar.tsx.

## PocketBase queries

- List all records: `pb.collection("name").getFullList({ sort: "-created" })`
- Filter: `pb.collection("name").getFullList({ filter: 'calories > 500' })`
- Single record: `pb.collection("name").getOne("record_id")`
- Paginated: `pb.collection("name").getList(page, perPage, { filter: "..." })`
