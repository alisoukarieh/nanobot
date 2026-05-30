#!/bin/sh
# Entrypoint for the nanobot HTTP API service (`nanobot-api` in
# docker-compose.yml). Runs `nanobot serve` on 0.0.0.0:8900.

set -e

if [ -x /home/nanobot/.nanobot/bin/gog ]; then
  ln -sf /home/nanobot/.nanobot/bin/gog /usr/local/bin/gog || true
fi
if [ -x /home/nanobot/.nanobot/bin/gh ]; then
  ln -sf /home/nanobot/.nanobot/bin/gh /usr/local/bin/gh || true
fi

# Ensure the Claude Code workspace exists + is owned by the unprivileged user.
# The CLI itself is installed by the gateway entrypoint onto the shared volume.
mkdir -p /home/nanobot/.nanobot/claude_code \
  && chown nanobot:nanobot /home/nanobot/.nanobot/claude_code 2>/dev/null || true

exec nanobot serve --host 0.0.0.0 --verbose
