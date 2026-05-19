#!/usr/bin/env python3
"""Fetch the latest tweets from an X community.

A "community" is X's group feature. Its URL looks like
    https://x.com/i/communities/1493446837214187523
and the numeric part at the end is the `community_id`.

Auth uses the same cookies.json the user-tweet fetcher uses; set it up
once via set_cookies.py.

Usage:
    cd scripts/twitter
    # First time only:
    cp .env.example .env       # fill in X_AUTH_TOKEN and X_CT0
    uv run python set_cookies.py

    # Then either set X_COMMUNITY_ID in .env or pass it on the command line:
    uv run python fetch_community.py 1493446837214187523
    uv run python fetch_community.py 1493446837214187523 Latest 60

Output: community_<id>.json in the script directory.
"""

import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from twikit import Client
from twikit.errors import TwitterException, Unauthorized

import _compat  # noqa: F401 — applies the tolerant User patch on import
from _compat import serialize_tweet

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

COOKIES_FILE = Path(os.environ.get("TWITTER_COOKIES_FILE", str(ROOT / "cookies.json")))
OUTPUT_DIR = Path(os.environ.get("TWITTER_OUTPUT_DIR", str(ROOT)))

log = logging.getLogger("twitter-fetch-community")
logging.basicConfig(
    format="%(asctime)s %(levelname)s %(message)s",
    level=os.environ.get("LOG_LEVEL", "INFO"),
    stream=sys.stderr,
)


def _parse_community_id(raw: str) -> str:
    """Accept either a bare numeric id or a full URL."""
    raw = raw.strip()
    if raw.isdigit():
        return raw
    m = re.search(r"/communities/(\d+)", raw)
    if m:
        return m.group(1)
    sys.exit(f"Couldn't extract a community id from '{raw}'. Pass either the numeric id or the full https://x.com/i/communities/<id> URL.")


async def main() -> int:
    # community id from argv, then env
    raw_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("X_COMMUNITY_ID", "")
    if not raw_id:
        sys.exit("No community id. Pass one as argv, or set X_COMMUNITY_ID in .env.")
    community_id = _parse_community_id(raw_id)

    # Tweet flavour: Latest | Top | Media. Latest = chronological feed.
    tweet_type = (
        sys.argv[2] if len(sys.argv) > 2 else os.environ.get("X_COMMUNITY_TWEET_TYPE", "Latest")
    )
    if tweet_type not in ("Latest", "Top", "Media"):
        sys.exit(f"X_COMMUNITY_TWEET_TYPE must be Latest | Top | Media (got '{tweet_type}')")

    limit = int(sys.argv[3] if len(sys.argv) > 3 else os.environ.get("X_COMMUNITY_LIMIT", "40"))

    if not COOKIES_FILE.exists():
        sys.exit(
            f"No {COOKIES_FILE.name} yet. Extract auth_token + ct0 from your "
            "browser and run set_cookies.py first."
        )

    client = Client("en-US")
    client.load_cookies(str(COOKIES_FILE))
    log.info("Loaded cookies from %s", COOKIES_FILE.name)

    # Best-effort: fetch community metadata for a nicer header. Wrapped
    # because Community parsing is brittle for the same reason User is.
    community_name: str | None = None
    try:
        community = await client.get_community(community_id)
        community_name = getattr(community, "name", None)
    except Exception as e:
        log.warning("Couldn't fetch community metadata (continuing anyway): %s", e)

    log.info(
        "Fetching %d %s tweets from community %s%s…",
        limit,
        tweet_type,
        community_id,
        f" ({community_name})" if community_name else "",
    )
    try:
        tweets = await client.get_community_tweets(community_id, tweet_type, count=limit)
    except Unauthorized as e:
        sys.exit(f"Cookies rejected: {e}. Re-extract auth_token + ct0 and re-run set_cookies.py.")
    except TwitterException as e:
        sys.exit(f"Fetch failed: {e}")

    data = [serialize_tweet(t) for t in tweets]
    out_file = OUTPUT_DIR / f"community_{community_id}.json"
    out_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    log.info("Wrote %d tweets to %s", len(data), out_file.name)

    # Persist cookie rotations from this run (see fetch_tweets.py for why).
    client.save_cookies(str(COOKIES_FILE))

    for t in data[:5]:
        author = t.get("author") or "?"
        snippet = (t.get("text") or "").replace("\n", " ")[:80]
        print(f"  {str(t['created_at'])[:19]}  @{author}: {snippet}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
