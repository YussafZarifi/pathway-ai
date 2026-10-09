"""Check AI-suggested resource links before they are shown (ROADMAP P-7).

The model sometimes invents pages (3 of 13 links were broken in the
2026-09-29 review). This module sends one HEAD request per link and drops a
link only on clear evidence that it is broken: 404/410, a host that doesn't
exist, or a URL that isn't plain public HTTPS. Anything
inconclusive (timeouts, refused connections, DNS trouble on the server,
403/429 from sites that block bots, 5xx) keeps the link.

The URLs come from model output, which a user's free-text answers can steer,
so the checker is built against server-side request forgery:
- https only, port 443 only, no credentials in the URL;
- the host is resolved **inside the connection step** and every address
  must be public (no private, loopback, link-local, reserved, multicast or
  unspecified ranges, IPv4 or IPv6); the socket then connects to that exact
  address, so DNS can't be switched between the check and the connection
  (no rebinding window); TLS still verifies the real hostname;
- redirects are followed by hand (at most 3) and every hop is re-checked;
- HEAD only, no response body is read, short timeouts, a small thread pool.
Nothing about the URLs or responses is logged except counts.
"""

import ipaddress
import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlsplit

import httpcore

logger = logging.getLogger("pathwayai.links")

TIMEOUT_SECONDS = 3.0
MAX_REDIRECTS = 3
MAX_WORKERS = 8
USER_AGENT = "PathwayAI-LinkCheck/1.0 (+https://github.com/YussafZarifi)"

BROKEN = "broken"
OK = "ok"
UNKNOWN = "unknown"


_NO_SUCH_HOST = {getattr(socket, n) for n in ("EAI_NONAME", "EAI_NODATA") if hasattr(socket, n)}


class BlockedAddress(Exception):
    """The host resolves to an address the checker must not contact."""


def _public_ip(host: str) -> str:
    """The first public address of `host`; raises BlockedAddress otherwise."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        # Only "no such host" is evidence of a broken link; other DNS
        # failures are the server's problem, not the link's.
        if e.errno in _NO_SUCH_HOST:
            raise BlockedAddress("no such host") from None
        raise OSError("dns unavailable") from None
    for *_, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if ip.is_global and not ip.is_multicast:
            return str(ip)
    raise BlockedAddress("not public")


class _PublicOnlyBackend(httpcore.SyncBackend):
    """Resolve and vet the host at connect time, then connect to that IP."""

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        if port != 443:
            raise BlockedAddress("port")
        return super().connect_tcp(_public_ip(host), port, timeout, local_address, socket_options)


def _allowed_url(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and bool(parts.hostname)
        and parts.port in (None, 443)
        and not parts.username
        and not parts.password
    )


def _pool() -> httpcore.ConnectionPool:
    return httpcore.ConnectionPool(network_backend=_PublicOnlyBackend(), max_connections=MAX_WORKERS, retries=0)


def check_url(url: str, pool: httpcore.ConnectionPool | None = None) -> str:
    """OK, BROKEN or UNKNOWN for one link."""
    pool = pool or _pool()
    timeout = {"connect": TIMEOUT_SECONDS, "read": TIMEOUT_SECONDS, "write": TIMEOUT_SECONDS, "pool": TIMEOUT_SECONDS}
    for _ in range(MAX_REDIRECTS + 1):
        if not _allowed_url(url):
            return BROKEN
        try:
            response = pool.request(
                "HEAD", url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"}, extensions={"timeout": timeout}
            )
        except BlockedAddress:
            return BROKEN
        except (httpcore.TimeoutException, httpcore.NetworkError, httpcore.ProtocolError, OSError):
            # Includes refused connections: inconclusive, so the link stays.
            return UNKNOWN
        status = response.status
        if status in (301, 302, 303, 307, 308):
            location = next((v for k, v in response.headers if k.lower() == b"location"), None)
            if not location:
                return UNKNOWN
            url = urljoin(url, location.decode("latin-1"))
            continue
        if status in (404, 410):
            return BROKEN
        return OK if 200 <= status < 300 else UNKNOWN
    return UNKNOWN  # too many redirects: inconclusive


def filter_resources(steps: list[dict]) -> int:
    """Drop clearly broken resource links from roadmap steps in place.
    Returns how many were dropped."""
    urls = sorted({r["url"] for s in steps for r in s.get("resources") or [] if isinstance(r, dict) and r.get("url")})
    if not urls:
        return 0
    pool = _pool()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        verdicts = dict(zip(urls, executor.map(lambda u: check_url(u, pool), urls)))
    pool.close()
    dropped = 0
    for step in steps:
        kept = [r for r in step.get("resources") or [] if verdicts.get(r.get("url")) != BROKEN]
        dropped += len(step.get("resources") or []) - len(kept)
        step["resources"] = kept
    counts = {v: list(verdicts.values()).count(v) for v in (OK, UNKNOWN, BROKEN)}
    logger.info("Resource links checked: %d ok, %d unknown, %d dropped", counts[OK], counts[UNKNOWN], dropped)
    return dropped
