# nanobot — agent context

You're working on **nanobot**, a Python agent framework + a Next.js dashboard that wraps it. This file exists so a fresh chat can immediately tell repo-level work from this user's private deployment work.

---

## Two scopes — read carefully before doing anything

### Repo scope (public, tracked in git)

- Everything under `nanobot/` (Python package) and `frontend/` (Next.js dashboard).
- Changes here affect anyone who clones the repo. Treat as a library — minimal, backwards-compatible, and general-purpose.
- Ships with bundled skills in `nanobot/skills/<name>/SKILL.md`.
- Pushed to `origin/main` at `github.com:alisoukarieh/nanobot.git`.

### Private-instance scope (this user's deployment only)

- Lives on the user's Dokploy VPS at **`173.212.239.198`**.
- Instance-specific pages/data/config never belong in the repo. Don't commit them.
- If you need to add something only for this user (e.g., their `/po` workouts page), it's either:
  - gitignored in `frontend/app/` and written via the compose entrypoint (base64 heredoc), or
  - written at runtime by the agent into `/app/frontend/...` on the deployed volume.

**Default assumption**: work is repo-scope unless the user says otherwise. Ask when in doubt.

---

## Project architecture

Runtime has four Docker services on the user's VPS (Docker Compose, managed by Dokploy):

| Service | Image | Role | Volumes (mount → purpose) |
|---|---|---|---|
| `pocketbase` | `muchobien/pocketbase` | Data layer: auth, chat messages, sessions, any skill tables | `pb-data:/pb_data` |
| `nanobot` | `astral-sh/uv` | Gateway — WebSocket + channels (Telegram, Discord, etc.) | `nanobot-code:/app`, `nanobot-data:/data/.nanobot` |
| `nanobot-api` | `astral-sh/uv` | HTTP API (`/v1/chat/completions`, `/restart`, `/health`). **This container runs the agent loop; exec tool commands run here.** | `nanobot-code:/app`, `nanobot-data:/data/.nanobot` |
| `dashboard` | `node:20-slim` | Next.js frontend. Proxies `/api/chat` to `nanobot-api`, reads PB directly for history. Rebuild endpoint lives here. | `nanobot-code:/repo:ro`, `nanobot-data:/data/.nanobot`, `dashboard-build:/app` |

**Key volume insight**: `nanobot-code` is the git clone. It's writable from `nanobot`/`nanobot-api` as `/app`, read-only on `dashboard` as `/repo`. The dashboard re-cp's `/repo/frontend/` into its own `dashboard-build` (`/app`) on every rebuild.

---

## Compose entrypoint logic (live in Dokploy, not the repo)

- **nanobot** on start: `git fetch && git reset --hard origin/main`, then `uv sync`, then writes `config.json` if missing, then `touch /app/.ready`, then `exec uv run nanobot gateway`. Force-pull is hardened with sequential statements (not `&&`) so transient git failures fail the container instead of silently serving stale code.
- **nanobot-api** on start: `sleep 5` (let nanobot clear stale `.ready`), wait for `/app/.ready`, `uv sync --extra api`, then `exec uv run nanobot serve`.
- **dashboard** on start: `sleep 5`, wait for `/repo/.ready`, wipe `/app/*` except `node_modules`/`.next`, `cp -r /repo/frontend/. /app/`, then write any instance-specific base64-embedded files (e.g. the PO page + `custom-nav.json`), then `npm install && rm -rf .next && npm run build && exec npx next start`.
- All three services have `CACHE_BUST=<unix_ts>` env vars. Bumping a service's `CACHE_BUST` is how you force that container to recreate on the next deploy.

---

## Deployment operations

### Dokploy API

- URL: `http://173.212.239.198:3000`
- API key: `EIGwFGJryjuOtIzPzdYfqWygyXncfCRRHQBznIFokjDFVfiEtLNZtDpCZEkUBSvu` (header: `x-api-key`). User said "fine, rotate later" — leaked in commit history regardless.
- Compose id: `SHcdxi_t7Z89x5E_WmLtV`
- Useful endpoints:
  - `POST /api/compose.one?composeId=...` — get current compose
  - `POST /api/compose.update` `{composeId, composeFile}` — update
  - `POST /api/compose.deploy` `{composeId}` — trigger redeploy
  - `POST /api/compose.stop|start` `{composeId}` — hard cycle
  - `GET /api/docker.getContainers` — container list with states
  - `GET /api/deployment.allByCompose?composeId=...` — deploy history
  - **No** exec, logs, or shell endpoints. If you need one, update the compose.

### Deploy flow a repo change

1. `git commit && git push origin main`
2. Bump `CACHE_BUST=<ts>` on relevant services in the compose file via `compose.update`. Which services?
   - Python change under `nanobot/` → nanobot + nanobot-api
   - Frontend change under `frontend/` → nanobot (it's the one that pulls the repo) + dashboard (it does the build)
   - Changed the skill file → nanobot + nanobot-api (both use it)
   - Compose entrypoint itself → all touched services
3. Call `compose.deploy`. Containers whose config changed will recreate.
4. Wait ~1–3 min and verify.

### Gotcha: only-one-service bump can serve stale code

If you bump only `dashboard` but not `nanobot`, dashboard runs its `cp -r /repo/frontend/. /app/` against a `/repo` that hasn't been `git pull`ed — you'll end up with dashboard serving old source. Always bump nanobot (or both) for frontend changes.

### Dashboard rebuild endpoint (for live page additions)

- `POST /api/dashboard/rebuild` (internal only — rejected from Traefik).
- Called from inside the Docker network: `curl -X POST $DASHBOARD_INTERNAL_URL/api/dashboard/rebuild`. No auth.
- Returns `{"status":"rebuilding","eta_seconds":90}` and `process.exit(0)`s. Docker restart brings it back with a fresh build.
- The agent has `$DASHBOARD_INTERNAL_URL=http://dashboard:3000` in its exec env (whitelisted via `tools.exec.allowed_env_keys` in `config.json`).

### Restart just the agent (config change, skill change, etc.)

- `POST http://nanobot-api-173-212-239-198.traefik.me/restart` with `Authorization: Bearer <NANOBOT_API_KEY>` — only restarts nanobot-api. Use this when you've changed a skill or the agent config and don't want to bump CACHE_BUST.

---

## Credentials & public URLs

| What | Value |
|---|---|
| Dashboard | http://nanobot-173-212-239-198.traefik.me/ |
| Dashboard login | `admin@nanobot.local` / `Nanobot2026Admin` |
| PocketBase admin UI | http://nanobot-pb-173-212-239-198.traefik.me/_/ |
| PocketBase admin | `admin@nanobot.local` / `Nanobot2026Admin` |
| nanobot-api | http://nanobot-api-173-212-239-198.traefik.me/ (Bearer `NANOBOT_API_KEY`) |
| `NANOBOT_API_KEY` | `e1fff3f463732981834c92d4b218e60589644815a1b37485335b9218ca6cf2eb` |
| OpenRouter key | in compose env (shown in `compose.one` → `env`) |
| GitHub Copilot token | `/data/.nanobot/auth/github-copilot.json` in the nanobot-data volume (persisted; `OAUTH_CLI_KIT_TOKEN_PATH` env points to it) |

Current model: `github-copilot/gpt-5-mini` (set in `/data/.nanobot/config.json`, config read from the nanobot-data volume).

---

## Session storage contract — do not regress this

PocketBase is the **single source of truth** for chat history.

- **One** `sessions` row per key. `SessionManager.get_or_create` enforces it by deleting dups (keeping the OLDEST to preserve history).
- `save()` is **append-only**: each in-memory message dict tracks `_pb_id` once persisted; subsequent saves skip it. No delete-then-reinsert.
- `/api/messages` (dashboard) looks up by key, pages by timestamp (the `messages` collection has a `timestamp` field, **not** `created` — sorting by `created` 500s).
- No silent fallbacks on PB errors — transient PB failures raise. If a restart can't reach PB, the first request 500s; a later request recovers.

If you find yourself adding retry loops, dedup stubs, or JSONL write-through, **stop and re-read the contract**. The messy version was patched to death before I collapsed it to this.

---

## Custom pages (the `custom/` convention)

Every hoster of this repo keeps their custom dashboard code in directories named `custom/` (or `(custom)/` for routes). These are gitignored; upstream never touches them.

**File layout:**

```
frontend/
  app/
    (custom)/            ← GITIGNORED; instance routes go here
      todos/page.tsx     → served at /todos (route group hides the folder name)
      api/workouts/route.ts → /api/workouts
  components/custom/     ← GITIGNORED; instance components (import as @/components/custom/…)
  lib/custom/            ← GITIGNORED; instance hooks + utils (import as @/lib/custom/…)
  config/custom-nav.json ← GITIGNORED; extra sidebar entries
```

**Key detail**: `(custom)` uses Next.js **route groups** — parentheses mark it as a folder organizer that is absent from the URL. `app/(custom)/todos/page.tsx` serves at `/todos`, not `/custom/todos`.

**Agent workflow for adding a page:**

1. Write the file to `/app/frontend/app/(custom)/<name>/page.tsx` (absolute path). Use `import { PageHeader }` (named export).
2. If it needs a sidebar link, append to `/app/frontend/config/custom-nav.json`: `{"items":[{"label":"...","href":"/<name>"}]}`.
3. `curl -X POST $DASHBOARD_INTERNAL_URL/api/dashboard/rebuild` (internal-only, no auth header).
4. Warn the user about ~60–90s downtime, then verify: `curl -s -o /dev/null -w "%{http_code}" http://dashboard:3000/<name>`.

**Persistence**: the dashboard container's `/app` is a persistent volume. Files under `(custom)/`, `components/custom/`, etc. survive restarts. On each rebuild, the entrypoint does **additive** cp from the repo (`cp -r /repo/frontend/. /app/`) — it overwrites core files with latest but doesn't delete the instance-only directories, so custom pages keep working after upstream pulls.

**Overriding shipped components**: don't. The convention is "custom adds, never mutates." If you need a different Sidebar, either contribute upstream or fork.

---

## Frontend URL scheme (current)

- `/chat`, `/files`, `/mcp` — core pages (tracked)
- `/login` — the only route without sidebar chrome
- `/<anything>` — instance pages. No `/custom/` or `/agent/[id]/` prefixes anywhere. Runtime is single-agent.

The `agents` PB collection is cosmetic right now (used only by `/files` to find the workspace path). Don't promise multi-agent switching.

---

## PocketBase schema quirks

- Collections auto-register `created` but the message collection was set up with only a custom `timestamp` field — no automatic `created`/`updated`. Use `timestamp` for sorting messages.
- FK validation IS enforced: inserting a message with a non-existent `session` id returns 400. Stale cached `_pb_session_id` will silently fail saves with that error; always re-resolve if unsure.
- `relationTarget` filter syntax `session.id = '<id>'` works for messages. Simple `key = 'foo'` works on sessions. Use single quotes inside the filter expression.

---

## Cleanup / maintenance commands (private scope)

Run these against the user's PB when sessions/messages get tangled. Reference code lives in `/tmp/cleanup.py` on my local from a previous session (not committed) — here's the pattern:

```python
# Auth
TOKEN = POST /api/collections/_superusers/auth-with-password
       {identity: "admin@nanobot.local", password: "Nanobot2026Admin"}

# Migrate all messages from stale sessions into the target (keep most-messages),
# delete stale sessions.
sessions = [s for s in GET /api/collections/sessions/records where key=="api:default"]
all_msgs = GET /api/collections/messages/records?perPage=500
target = max(sessions, key=lambda s: count_messages_in(s))
for s in sessions - target:
    for m in msgs_of(s): PATCH messages/records/<id> {session: target.id}
    DELETE sessions/records/<s.id>
```

---

## Known fixed bugs (don't re-introduce)

- `_pb_save` used to delete-all-then-reinsert-all → partial failures wiped history. Now append-only with `_pb_id` tracking.
- `_pb_load` used to catch exceptions and return `None` → silent dup session creation on any transient error. Now exceptions propagate.
- Messages sort used `position,created` → 500 because `created` field doesn't exist. Use `position,timestamp`.
- Compose entrypoints used `&&` chains which `set -e` doesn't catch → stale code served silently. Now sequential.
- Dashboard consumer could see a stale `.ready` from a previous boot and proceed with old code → `sleep 5` at start so nanobot clears it first.
- `rebuild` endpoint was behind Traefik and auth-gated → agent couldn't hit it reliably. Now internal-only via `Host` header check, no auth header.
- Copilot OAuth token stored at `~/.config/nanobot/...` which wasn't a persistent volume → every deploy logged the user out. Fixed with `OAUTH_CLI_KIT_TOKEN_PATH=/data/.nanobot/auth/github-copilot.json`.

---

## When unsure, follow these:

1. **Don't patch. Re-read the contract.** The session storage bug was five layers of fixes on a broken foundation. Each added complexity. The rewrite in one file is less code and works.
2. **Verify your changes at the public URL**, not just by reading the repo. The deploy pipeline has three places something can go stale (git pull, cp, npm build). Hit the endpoint.
3. **Scope check before writing**: is this a repo change or a private-instance one? If instance, is it a UI file (goes to `/app/frontend/...` via compose heredoc or agent exec) or data/config (lives in PB or `/data/.nanobot`)?
4. **Bump `CACHE_BUST` on every service whose behavior your change touches.** Otherwise Docker Compose will no-op the redeploy for that service.
