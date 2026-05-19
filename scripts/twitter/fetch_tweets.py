#!/usr/bin/env python3
"""Fetch recent tweets from an X account using twikit (cookie-based scrape).

First run: reads X_USERNAME/X_EMAIL/X_PASSWORD from .env, logs in once,
saves cookies.json. Every subsequent run reuses cookies.json and never
touches the password again.

Output: writes tweets.json (latest N tweets, newest first) and prints a
short summary to stderr.

Usage:
    cd scripts/twitter
    cp .env.example .env       # fill it in
    uv run fetch_tweets.py [handle]

    # or with explicit venv:
    uv sync && uv run python fetch_tweets.py [handle]
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from twikit import Client
from twikit.errors import BadRequest, Forbidden, TwitterException, Unauthorized

# Apply the tolerant User patch and pull in the shared tweet serializer.
import _compat  # noqa: F401 — side effects only
from _compat import serialize_tweet

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# Cookies live on a persistent volume in prod; output goes to a writable
# dir. Both default to next to the script for local dev.
COOKIES_FILE = Path(os.environ.get("TWITTER_COOKIES_FILE", str(ROOT / "cookies.json")))
OUTPUT_DIR = Path(os.environ.get("TWITTER_OUTPUT_DIR", str(ROOT)))
OUTPUT_FILE = OUTPUT_DIR / "tweets.json"

log = logging.getLogger("twitter-fetch")
logging.basicConfig(
    format="%(asctime)s %(levelname)s %(message)s",
    level=os.environ.get("LOG_LEVEL", "INFO"),
    stream=sys.stderr,
)


async def _ensure_logged_in(client: Client) -> None:
    """Load cookies from cookies.json. We deliberately don't attempt the
    password login flow — X's /1.1/onboarding/task.json endpoint sits
    behind Cloudflare and 403s every non-browser client. Cookies
    extracted from your already-logged-in browser are the only stable
    auth path. See set_cookies.py for the extraction recipe."""
    if not COOKIES_FILE.exists():
        sys.exit(
            f"No {COOKIES_FILE.name} yet. Extract auth_token + ct0 from your "
            "browser and run set_cookies.py first. See set_cookies.py's "
            "docstring for the steps."
        )
    client.load_cookies(str(COOKIES_FILE))
    log.info("Loaded cookies from %s", COOKIES_FILE.name)


async def main() -> int:
    handle = (
        sys.argv[1].lstrip("@")
        if len(sys.argv) > 1
        else (os.environ.get("X_TARGET") or os.environ.get("X_USERNAME") or "").lstrip("@")
    )
    if not handle:
        sys.exit("No handle provided. Pass one as argv, or set X_TARGET / X_USERNAME in .env.")

    limit = int(os.environ.get("X_FETCH_LIMIT", "40"))

    client = Client("en-US")
    try:
        await _ensure_logged_in(client)
    except Unauthorized as e:
        sys.exit(f"Cookies rejected by X: {e}. They probably expired — re-extract auth_token + ct0 from your browser and re-run set_cookies.py.")
    except (BadRequest, Forbidden, TwitterException) as e:
        sys.exit(f"Auth failed: {e}")

    # Bypass twikit's User() class: it indexes a dozen hard-coded keys
    # in `legacy` and crashes if any are missing (e.g. bios with no URLs
    # in entities.description.urls). We only need rest_id, so reach into
    # the raw GraphQL response ourselves.
    try:
        response, _ = await client.gql.user_by_screen_name(handle)
    except TwitterException as e:
        sys.exit(f"Could not resolve @{handle}: {e}")
    user_node = response.get("data", {}).get("user", {}).get("result") or {}
    if user_node.get("__typename") == "UserUnavailable":
        sys.exit(f"@{handle}: {user_node.get('message', 'unavailable')}")
    user_id = user_node.get("rest_id")
    if not user_id:
        sys.exit(f"@{handle}: GraphQL response had no rest_id (got: {sorted(user_node.keys())})")

    log.info("Fetching last %d tweets for @%s (id=%s)…", limit, handle, user_id)
    try:
        tweets = await client.get_user_tweets(user_id, "Tweets", count=limit)
    except TwitterException as e:
        sys.exit(f"Fetch failed: {e}")

    data = [serialize_tweet(t) for t in tweets]
    OUTPUT_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    log.info("Wrote %d tweets to %s", len(data), OUTPUT_FILE.name)

    # Persist any cookie rotations X did during this run. Same mechanism
    # the browser uses to keep the session fresh — every authenticated
    # call rotates `ct0` (and occasionally `auth_token`) via Set-Cookie
    # headers; we capture them here so the next run starts from the
    # latest values instead of the original snapshot.
    client.save_cookies(str(COOKIES_FILE))

    # Quick console preview (newest first)
    for t in data[:5]:
        snippet = (t["text"] or "").replace("\n", " ")[:90]
        print(f"  {t['created_at'][:19]}  {snippet}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
