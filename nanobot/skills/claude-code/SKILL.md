---
name: claude-code
description: Delegate coding tasks to Claude Code, a headless coding sub-agent that reads/writes/runs code in a dedicated per-conversation workspace.
metadata: {"nanobot":{"emoji":"🤖","requires":{"bins":["claude"],"tools":["claude_code"]}}}
---

# Claude Code

Use the **`claude_code`** tool to hand a coding task to Claude Code (the headless
`claude` CLI). It reads, writes, and runs code in a workspace dedicated to *this*
conversation, and remembers what it did across turns.

Only use this when the user actually wants code written, debugged, refactored,
or run — not for normal chat or quick one-liners (use `exec` for those).

## How it behaves (important)

- **On chat channels (WhatsApp, Telegram, …) a run is asynchronous.** The tool
  returns immediately with "Started …". You must **briefly tell the user you've
  started and will report back — then stop.** Do **not** wait, poll, or call the
  tool again to check; progress updates and the final result are delivered to the
  chat automatically when ready.
- **On the dashboard / CLI it runs synchronously** and the tool returns the final
  result directly — relay it.
- Each conversation has **one** Claude Code memory. Follow-up tasks in the same
  chat continue it automatically (no need to repeat context). Pass
  `new_session: true` only when switching to an unrelated project/task.
- **Only one task per conversation at a time.** If one is already running, tell
  the user and offer to `stop` it.

## Actions

**Start / continue a task:**
```json
{"action": "run", "task": "Clone github.com/me/app, add a /healthz endpoint returning 200, run the tests, and summarize what changed."}
```

**Continue (same chat, no extra context needed):**
```json
{"action": "run", "task": "now add a unit test for /healthz and run it"}
```

**Start fresh (unrelated task):**
```json
{"action": "run", "task": "...", "new_session": true}
```

**Check / cancel:**
```json
{"action": "status"}
{"action": "stop"}
```

## Writing good tasks

- Be explicit about the goal **and** the repo/dir to work in (the workspace starts
  empty per conversation — tell it to `git clone <url>` first if needed).
- Ask it to **verify** (run tests/build) and to **summarize what changed** so the
  reply back to the user is useful.
- It can run shell commands and edit files autonomously within its workspace, so
  scope the task; don't ask it to touch unrelated systems.

## Don't

- Don't call `run` again to "check on" an async job — wait for the pushed result.
- Don't paste Claude Code's streamed progress back into the tool as a new task.
- Don't use it for trivial shell/file actions you can do with `exec`/`read_file`.
