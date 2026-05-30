#!/bin/sh
# Entrypoint for the nanobot gateway service (`nanobot` in docker-compose.yml).
# Starts the WhatsApp bridge in the background, then exec's the gateway.

set -e

mkdir -p /home/nanobot/.nanobot/logs

# Convenience symlink for the optional `gog` helper if the user dropped it
# into the workspace volume.
if [ -x /home/nanobot/.nanobot/bin/gog ]; then
  ln -sf /home/nanobot/.nanobot/bin/gog /usr/local/bin/gog || true
fi

# Put the GitHub CLI on PATH if it was installed onto the volume (used by the
# claude_code tool for clone/push/PR via `gh auth git-credential`).
if [ -x /home/nanobot/.nanobot/bin/gh ]; then
  ln -sf /home/nanobot/.nanobot/bin/gh /usr/local/bin/gh || true
fi

# Claude Code tool: install the CLI onto the persistent data volume (once) and
# prepare its per-conversation workspace owned by the unprivileged `nanobot`
# user (uid 1000), so the tool can run `claude` non-root with bypassPermissions.
# Self-heals if the volume was wiped; harmless when the tool is disabled.
if command -v npm >/dev/null 2>&1 && [ ! -x /home/nanobot/.nanobot/npm/bin/claude ]; then
  NPM_CONFIG_PREFIX=/home/nanobot/.nanobot/npm npm install -g @anthropic-ai/claude-code \
    > /home/nanobot/.nanobot/logs/claude-install.log 2>&1 || echo "claude-code install failed (non-fatal)"
fi
mkdir -p /home/nanobot/.nanobot/claude_code \
  && chown nanobot:nanobot /home/nanobot/.nanobot/claude_code /home/nanobot/.nanobot/npm 2>/dev/null || true

# Start the WhatsApp bridge in the background. If WhatsApp is disabled in
# config.json it exits immediately and the gateway runs without it.
nohup nanobot channels login whatsapp \
  > /home/nanobot/.nanobot/logs/whatsapp-bridge.log 2>&1 &

exec nanobot gateway
