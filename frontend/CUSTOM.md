# Custom Overlay

Add your own pages to the dashboard without touching the core codebase.
Your customizations live in `app/custom/` and `config/custom-nav.json`,
both of which are gitignored. `git pull` will never conflict with them.

## Quick Start

### 1. Add a custom page

Create a React page at `frontend/app/custom/<name>/page.tsx`:

```tsx
"use client";

export default function MyPage() {
  return <div>My custom page</div>;
}
```

Routes are available at `/custom/<name>`.

### 2. Add it to the sidebar

Create `frontend/config/custom-nav.json`:

```json
{
  "items": [
    {
      "label": "My Page",
      "href": "/custom/mypage",
      "icon": "records"
    }
  ]
}
```

The sidebar will show it under a "Custom" section.

### 3. Add API routes (optional)

Custom server-side API routes go in `app/custom/api/<name>/route.ts`:

```ts
import { NextResponse } from "next/server";

export async function GET() {
  // Call PocketBase, read files, whatever
  return NextResponse.json({ ok: true });
}
```

They're reachable at `/custom/api/<name>`.

## PocketBase

You can use PocketBase directly from your custom pages (client-side SDK)
or through server-side API routes. The backend `db` tool can also be
taught to work with custom collections — update your skill's SKILL.md
with instructions.

## Deployment

- `git pull` — core updates never touch your custom files
- Docker rebuild — your custom files are included in the image
- Share your custom code? Copy `app/custom/` and `config/custom-nav.json`
  to the other machine
