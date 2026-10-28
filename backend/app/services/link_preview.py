"""Page titles for the Links tab. The server fetches the page, so it must never be talked into reaching our own network."""
import asyncio
import html
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlsplit

import httpx

TIMEOUT = 4.0
MAX_BYTES = 200_000
MAX_REDIRECTS = 3
MAX_TITLE = 200
_TITLE = re.compile(rb"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


async def _is_public(host: str) -> bool:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global:  # private, loopback, link-local, reserved, multicast...
            return False
    return bool(infos)


async def _allowed(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme in ("http", "https") and bool(parts.hostname) and await _is_public(parts.hostname)


async def fetch_title(url: str) -> str | None:
    """The page's <title>, or None when there isn't one or the address isn't a public web page."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": "TaskManagerLinkPreview/1.0"}) as http:
            for _ in range(MAX_REDIRECTS + 1):
                if not await _allowed(url):  # checked again on every hop: a redirect can point inward
                    return None
                async with http.stream("GET", url) as resp:
                    if resp.is_redirect and (nxt := resp.headers.get("location")):
                        url = urljoin(url, nxt)
                        continue
                    if resp.status_code != 200 or "html" not in resp.headers.get("content-type", "").lower():
                        return None
                    body = b""
                    async for chunk in resp.aiter_bytes():
                        body += chunk
                        if len(body) >= MAX_BYTES:
                            break
                    found = _TITLE.search(body)
                    if not found:
                        return None
                    title = " ".join(html.unescape(found.group(1).decode(resp.encoding or "utf-8", "replace")).split())
                    return title[:MAX_TITLE] or None
    except (httpx.HTTPError, ValueError):
        return None
    return None
