"""Real YouTube videos for roadmap steps via the YouTube Data API v3.

The model never supplies video URLs (it can't know real video IDs). It
writes a search phrase per step; this module turns that phrase into real
videos. Without YOUTUBE_API_KEY, or on any API error (e.g. quota
exhausted), it returns an empty list and callers fall back to a YouTube
search link.
"""

import html
import os
from urllib.parse import quote_plus

import httpx

SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
MAX_QUERY_LENGTH = 100
CACHE_LIMIT = 256

# query -> list of videos. Only successful lookups are cached, so a
# temporary failure (quota, network) is retried on the next roadmap.
_cache: dict[str, list[dict]] = {}


def search_url(query: str) -> str:
    """YouTube results page for a query; always works, no API key needed."""
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def search_videos(query: str, max_results: int = 2) -> list[dict]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    query = query.strip()[:MAX_QUERY_LENGTH]
    if not api_key or not query:
        return []

    cache_key = f"{max_results}:{query.lower()}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        resp = httpx.get(
            SEARCH_URL,
            params={
                "part": "snippet",
                "type": "video",
                "q": query,
                "maxResults": max_results,
                "safeSearch": "strict",
                "relevanceLanguage": "en",
                "key": api_key,
            },
            timeout=5.0,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
    except (httpx.HTTPError, ValueError) as e:
        # Log the error class only: the request URL contains the API key.
        print(f"YouTube search failed: {type(e).__name__}")
        return []

    videos = []
    for item in items:
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        if not video_id:
            continue
        thumbs = snippet.get("thumbnails", {})
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
        videos.append({
            "id": video_id,
            "title": html.unescape(snippet.get("title", "")),
            "channel": html.unescape(snippet.get("channelTitle", "")),
            "thumbnail": thumb,
            "url": f"https://www.youtube.com/watch?v={video_id}",
        })

    if len(_cache) >= CACHE_LIMIT:
        _cache.pop(next(iter(_cache)))
    _cache[cache_key] = videos
    return videos
