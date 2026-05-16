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

# Start the WhatsApp bridge in the background. If WhatsApp is disabled in
# config.json it exits immediately and the gateway runs without it.
nohup nanobot channels login whatsapp \
  > /home/nanobot/.nanobot/logs/whatsapp-bridge.log 2>&1 &

exec nanobot gateway
