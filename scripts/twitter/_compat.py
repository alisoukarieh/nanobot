"""Shared twikit compatibility shims and helpers.

Imported by every fetch_*.py script in this directory. Holds:

- Tolerant patch of twikit.User.__init__ so missing `legacy` keys (which
  X drops without warning whenever it ships UI changes) don't crash
  every Tweet that has an author.
- A small Tweet -> dict serializer with only stable, hand-picked fields.
"""

from __future__ import annotations

from twikit.user import User

_orig_user_init = User.__init__


def _tolerant_user_init(self, client, data):
    try:
        _orig_user_init(self, client, data)
    except (KeyError, TypeError):
        legacy = data.get("legacy", {}) or {}
        entities = legacy.get("entities", {}) or {}
        self._client = client
        self.id = data.get("rest_id")
        self.screen_name = legacy.get("screen_name")
        self.name = legacy.get("name")
        self.description = legacy.get("description")
        self.description_urls = (entities.get("description") or {}).get("urls", [])
        self.urls = (entities.get("url") or {}).get("urls", [])
        self.created_at = legacy.get("created_at")
        self.location = legacy.get("location", "")
        self.profile_image_url = legacy.get("profile_image_url_https")
        self.profile_banner_url = legacy.get("profile_banner_url")
        self.url = legacy.get("url")
        self.pinned_tweet_ids = legacy.get("pinned_tweet_ids_str", [])
        self.is_blue_verified = data.get("is_blue_verified", False)
        self.verified = legacy.get("verified", False)
        self.possibly_sensitive = legacy.get("possibly_sensitive", False)
        self.can_dm = legacy.get("can_dm", False)
        self.can_media_tag = legacy.get("can_media_tag", False)
        self.want_retweets = legacy.get("want_retweets", False)
        self.default_profile = legacy.get("default_profile", False)
        self.default_profile_image = legacy.get("default_profile_image", False)
        self.has_custom_timelines = legacy.get("has_custom_timelines", False)
        self.followers_count = legacy.get("followers_count", 0)
        self.fast_followers_count = legacy.get("fast_followers_count", 0)
        self.normal_followers_count = legacy.get("normal_followers_count", 0)
        self.following_count = legacy.get("friends_count", 0)
        self.favourites_count = legacy.get("favourites_count", 0)
        self.listed_count = legacy.get("listed_count", 0)
        self.media_count = legacy.get("media_count", 0)
        self.statuses_count = legacy.get("statuses_count", 0)
        self.is_translator = legacy.get("is_translator", False)
        self.translator_type = legacy.get("translator_type", "none")
        self.withheld_in_countries = legacy.get("withheld_in_countries", [])
        self.protected = legacy.get("protected", False)


User.__init__ = _tolerant_user_init


def serialize_tweet(tweet) -> dict:
    """Hand-picked stable subset. Author screen_name comes from the
    associated User (whether on `tweet.user` or via `tweet.user.screen_name`)
    and is fetched defensively because community/timeline tweets sometimes
    have a partial user object."""
    author = getattr(getattr(tweet, "user", None), "screen_name", None)
    return {
        "id": tweet.id,
        "created_at": str(tweet.created_at),
        "text": getattr(tweet, "text", None) or getattr(tweet, "full_text", None),
        "author": author,
        "lang": getattr(tweet, "lang", None),
        "reply_count": getattr(tweet, "reply_count", None),
        "retweet_count": getattr(tweet, "retweet_count", None),
        "favorite_count": getattr(tweet, "favorite_count", None),
        "view_count": getattr(tweet, "view_count", None),
        "is_quote_status": getattr(tweet, "is_quote_status", None),
        "in_reply_to": getattr(tweet, "in_reply_to", None),
        "url": f"https://x.com/{author or 'i'}/status/{tweet.id}",
    }
