#!/usr/bin/env python3
"""Write cookies.json from X_AUTH_TOKEN + X_CT0 in .env.

X's login endpoint is behind Cloudflare and 403s any non-browser client,
so we don't attempt programmatic login. Instead: extract two cookies
from your already-logged-in browser session and let the fetcher use
those.

How to extract (works on any X login):
  1. Open https://x.com in your browser (logged in).
  2. Open DevTools → Application/Storage → Cookies → https://x.com.
  3. Copy the values of `auth_token` (40 hex chars) and `ct0`
     (~160 hex chars).
  4. Put them in .env:
        X_AUTH_TOKEN=<value>
        X_CT0=<value>
  5. Run: uv run python set_cookies.py
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).parent
COOKIES_FILE = ROOT / "cookies.json"

load_dotenv(ROOT / ".env")

auth_token = os.environ.get("X_AUTH_TOKEN", "").strip()
ct0 = os.environ.get("X_CT0", "").strip()

if not (auth_token and ct0):
    sys.exit(
        "Need X_AUTH_TOKEN and X_CT0 in .env. See this file's docstring for "
        "extraction steps."
    )

COOKIES_FILE.write_text(json.dumps({"auth_token": auth_token, "ct0": ct0}, indent=2))
print(f"Wrote {COOKIES_FILE} (auth_token len={len(auth_token)}, ct0 len={len(ct0)})")
