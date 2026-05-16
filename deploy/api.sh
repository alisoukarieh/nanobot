#!/bin/sh
# Entrypoint for the nanobot HTTP API service (`nanobot-api` in
# docker-compose.yml). Runs `nanobot serve` on 0.0.0.0:8900.

set -e

if [ -x /home/nanobot/.nanobot/bin/gog ]; then
  ln -sf /home/nanobot/.nanobot/bin/gog /usr/local/bin/gog || true
fi

exec nanobot serve --host 0.0.0.0 --verbose
