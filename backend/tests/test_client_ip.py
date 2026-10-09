import ipaddress

import pytest
from fastapi import HTTPException, Request

import config
import rate_limit


def make_request(peer, headers=()):
    return Request({
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/ai/career",
        "raw_path": b"/api/ai/career",
        "query_string": b"",
        "headers": [(name.lower().encode(), value.encode()) for name, value in headers],
        "client": (peer, 50000) if peer else None,
        "server": ("testserver", 8000),
    })


def use_cidr_proxies(monkeypatch, *cidrs):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "cidrs")
    monkeypatch.setattr(config, "TRUSTED_PROXY_CIDRS", tuple(ipaddress.ip_network(cidr) for cidr in cidrs))


def test_trusted_proxy_with_one_hop_uses_forwarded_client(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    request = make_request("10.0.0.8", [("X-Forwarded-For", "198.51.100.24")])
    assert rate_limit.client_ip(request) == "198.51.100.24"


def test_trusted_proxy_chain_skips_trusted_hops_from_right(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8", "192.0.2.0/24")
    request = make_request(
        "10.0.0.8",
        [("X-Forwarded-For", "198.51.100.24, 192.0.2.17")],
    )
    assert rate_limit.client_ip(request) == "198.51.100.24"


def test_untrusted_peer_cannot_choose_rate_limit_ip(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    request = make_request("203.0.113.7", [("X-Forwarded-For", "198.51.100.24")])
    assert rate_limit.client_ip(request) == "203.0.113.7"


@pytest.mark.parametrize("value", ["not-an-ip", "198.51.100.24:80", "198.51.100.24,", ""])
def test_malformed_forwarded_chain_falls_back_to_proxy_peer(monkeypatch, value):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    request = make_request("10.0.0.8", [("X-Forwarded-For", value)])
    assert rate_limit.client_ip(request) == "10.0.0.8"


def test_duplicate_forwarded_headers_fall_back_to_proxy_peer(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    request = make_request("10.0.0.8", [
        ("X-Forwarded-For", "198.51.100.24"),
        ("x-forwarded-for", "203.0.113.5"),
    ])
    assert rate_limit.client_ip(request) == "10.0.0.8"


def test_ipv6_client_and_proxy_addresses_are_supported(monkeypatch):
    use_cidr_proxies(monkeypatch, "fd00::/8")
    request = make_request("fd00::8", [("X-Forwarded-For", "2001:db8::24")])
    assert rate_limit.client_ip(request) == "2001:db8::24"


def test_ipv4_mapped_ipv6_peer_matches_ipv4_proxy_cidr(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    request = make_request("::ffff:10.0.0.8", [("X-Forwarded-For", "::ffff:198.51.100.24")])
    assert rate_limit.client_ip(request) == "198.51.100.24"


def test_render_mode_uses_only_cloudflare_overwritten_client_ip(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "render")
    monkeypatch.setattr(config, "RENDER_SERVICE_ID", "srv-test")
    request = make_request("10.0.0.8", [
        ("X-Forwarded-For", "192.0.2.99"),
        ("CF-Connecting-IP", "198.51.100.24"),
    ])
    assert rate_limit.client_ip(request) == "198.51.100.24"


def test_render_mode_supports_ipv6_client_ip(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "render")
    monkeypatch.setattr(config, "RENDER_SERVICE_ID", "srv-test")
    request = make_request("10.0.0.8", [("CF-Connecting-IP", "2001:db8::24")])
    assert rate_limit.client_ip(request) == "2001:db8::24"


def test_render_mode_rejects_duplicate_or_malformed_client_ip(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "render")
    monkeypatch.setattr(config, "RENDER_SERVICE_ID", "srv-test")
    duplicate = make_request("10.0.0.8", [
        ("CF-Connecting-IP", "198.51.100.24"),
        ("cf-connecting-ip", "203.0.113.5"),
    ])
    malformed = make_request("10.0.0.8", [("CF-Connecting-IP", "not-an-ip")])
    assert rate_limit.client_ip(duplicate) == "10.0.0.8"
    assert rate_limit.client_ip(malformed) == "10.0.0.8"


def test_render_mode_without_render_service_identity_ignores_forwarded_header(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "render")
    monkeypatch.setattr(config, "RENDER_SERVICE_ID", "")
    request = make_request("10.0.0.8", [("CF-Connecting-IP", "198.51.100.24")])
    assert rate_limit.client_ip(request) == "10.0.0.8"


@pytest.mark.parametrize("peer", ["127.0.0.1", "::1"])
def test_localhost_development_ignores_forwarded_headers(monkeypatch, peer):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "none")
    request = make_request(peer, [("X-Forwarded-For", "198.51.100.24")])
    assert rate_limit.client_ip(request) == peer


def test_direct_connection_uses_socket_peer_and_missing_peer_is_unknown(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "none")
    assert rate_limit.client_ip(make_request("2001:db8::5")) == "2001:db8::5"
    assert rate_limit.client_ip(make_request(None, [("X-Forwarded-For", "198.51.100.24")])) == "unknown"


def test_changing_spoofed_headers_does_not_bypass_rate_limit(monkeypatch):
    monkeypatch.setattr(config, "TRUSTED_PROXY_MODE", "none")
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1, 100, 100))
    rate_limit.limit_ai_requests(make_request("203.0.113.7", [("X-Forwarded-For", "198.51.100.1")]))
    with pytest.raises(HTTPException) as error:
        rate_limit.limit_ai_requests(make_request("203.0.113.7", [("X-Forwarded-For", "198.51.100.2")]))
    assert error.value.status_code == 429


def test_changing_leftmost_xff_entry_does_not_bypass_trusted_proxy_rate_limit(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.RateLimiter(1, 100, 100))
    rate_limit.limit_ai_requests(make_request(
        "10.0.0.8",
        [("X-Forwarded-For", "198.51.100.1, 203.0.113.7, 10.0.0.9")],
    ))
    with pytest.raises(HTTPException) as error:
        rate_limit.limit_ai_requests(make_request(
            "10.0.0.8",
            [("X-Forwarded-For", "198.51.100.2, 203.0.113.7, 10.0.0.9")],
        ))
    assert error.value.status_code == 429


@pytest.mark.parametrize("mode", ["none", "render", "cidrs"])
def test_proxy_mode_configuration_is_explicit_and_case_insensitive(mode):
    assert config._trusted_proxy_mode(mode.upper()) == mode


def test_proxy_cidr_configuration_accepts_ipv4_and_ipv6():
    networks = config._proxy_networks("10.0.0.0/8, 2001:db8::/32")
    assert networks == (ipaddress.ip_network("10.0.0.0/8"), ipaddress.ip_network("2001:db8::/32"))


def test_invalid_proxy_configuration_is_rejected():
    with pytest.raises(RuntimeError, match="TRUSTED_PROXY_MODE"):
        config._trusted_proxy_mode("all")
    with pytest.raises(RuntimeError, match="TRUSTED_PROXY_CIDRS"):
        config._proxy_networks("not-a-cidr")
    with pytest.raises(RuntimeError, match="global /0"):
        config._proxy_networks("0.0.0.0/0")


def test_excessive_forwarded_chain_falls_back_to_proxy_peer(monkeypatch):
    use_cidr_proxies(monkeypatch, "10.0.0.0/8")
    chain = ", ".join(["198.51.100.24"] * 33)
    request = make_request("10.0.0.8", [("X-Forwarded-For", chain)])
    assert rate_limit.client_ip(request) == "10.0.0.8"
