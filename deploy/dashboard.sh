#!/bin/sh
# Entrypoint for the dashboard service. Runs in a stock `node:20-slim`
# image (no custom Dockerfile), so this script is fetched at runtime from
# the same repo the deploy is pulling from. Clones the frontend source
# from $DASHBOARD_REPO_URL on every restart, copies it on top of /app
# (preserving any instance-local files under (custom)/), then builds and
# starts Next.js.

set -e

REPO_URL="${DASHBOARD_REPO_URL:-https://github.com/alisoukarieh/nanobot.git}"
REPO_BRANCH="${DASHBOARD_REPO_BRANCH:-main}"

mkdir -p /app
apt-get update -qq && apt-get install -y -qq git > /dev/null 2>&1

rm -rf /tmp/repo
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" /tmp/repo

# Additive sync: refresh core files; leave (custom)/ instance dirs alone.
cp -r /tmp/repo/frontend/. /app/ 2>/dev/null || cp -Rf /tmp/repo/frontend/. /app/
rm -rf /tmp/repo

cd /app
npm install --no-audit --no-fund
rm -rf .next
npm run build

exec npx next start
