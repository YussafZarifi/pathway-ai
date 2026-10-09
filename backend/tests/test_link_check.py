"""link_check.py (P-7): SSRF-safe resource-link checks. No network: DNS
and connections are faked."""

import logging
import socket
from types import SimpleNamespace

import httpcore
import pytest

import link_check
from link_check import BROKEN, OK, UNKNOWN, BlockedAddress, check_url, filter_resources


def fake_dns(monkeypatch, *addresses, error=None):
    def getaddrinfo(host, port, type=None):
        if error is not None:
            raise error
        return [(socket.AF_INET6 if ":" in a else socket.AF_INET, socket.SOCK_STREAM, 6, "", (a, port)) for a in addresses]
    monkeypatch.setattr(link_check.socket, "getaddrinfo", getaddrinfo)


@pytest.mark.parametrize("address", [
    "10.0.0.5", "172.16.3.4", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1",
    "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
])
def test_non_public_addresses_are_blocked_before_connecting(monkeypatch, address):
    fake_dns(monkeypatch, address)
    connected = []
    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", lambda self, *a, **k: connected.append(a))
    with pytest.raises(BlockedAddress):
        link_check._PublicOnlyBackend().connect_tcp("evil.example", 443)
    assert connected == []


def test_public_address_is_used_for_the_connection(monkeypatch):
    fake_dns(monkeypatch, "10.0.0.1", "93.184.216.34")  # a private record is skipped
    connected = []
    monkeypatch.setattr(httpcore.SyncBackend, "connect_tcp", lambda self, host, port, *a, **k: connected.append((host, port)))
    link_check._PublicOnlyBackend().connect_tcp("example.com", 443)
    assert connected == [("93.184.216.34", 443)]  # the vetted IP, not the name (no rebinding window)


def test_only_port_443(monkeypatch):
    fake_dns(monkeypatch, "93.184.216.34")
    with pytest.raises(BlockedAddress):
        link_check._PublicOnlyBackend().connect_tcp("example.com", 8443)


def test_no_such_host_is_broken_but_other_dns_trouble_is_not(monkeypatch):
    fake_dns(monkeypatch, error=socket.gaierror(socket.EAI_NONAME, "no such host"))
    with pytest.raises(BlockedAddress):
        link_check._public_ip("missing.example")
    fake_dns(monkeypatch, error=socket.gaierror(socket.EAI_AGAIN, "temporary failure"))
    with pytest.raises(OSError):
        link_check._public_ip("flaky.example")


@pytest.mark.parametrize("url", [
    "http://example.com/page",
    "ftp://example.com/file",
    "https://user:pw@example.com/",
    "https://example.com:8443/",
    "javascript:alert(1)",
    "https:///nohost",
    "not a url",
])
def test_only_plain_https_urls_are_checked(url):
    assert check_url(url, pool=SimpleNamespace(request=lambda *a, **k: pytest.fail("no request expected"))) == BROKEN


class FakePool:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def request(self, method, url, headers=None, extensions=None):
        self.requests.append((method, url))
        item = self.responses.pop(0)
        if isinstance(item, BaseException):
            raise item
        status, headers = item if isinstance(item, tuple) else (item, [])
        return SimpleNamespace(status=status, headers=headers)


@pytest.mark.parametrize("response, verdict", [
    (200, OK), (204, OK), (404, BROKEN), (410, BROKEN), (403, UNKNOWN), (429, UNKNOWN), (500, UNKNOWN),
    (BlockedAddress("not public"), BROKEN),
    (httpcore.ConnectTimeout("t"), UNKNOWN), (httpcore.ConnectError("refused"), UNKNOWN), (OSError("dns"), UNKNOWN),
])
def test_verdicts(response, verdict):
    pool = FakePool([response])
    assert check_url("https://example.com/a", pool) == verdict
    assert pool.requests == [("HEAD", "https://example.com/a")]


def test_redirects_are_followed_and_each_hop_rechecked():
    pool = FakePool([(301, [(b"Location", b"/b")]), (302, [(b"location", b"https://other.example/c")]), 200])
    assert check_url("https://example.com/a", pool) == OK
    assert [u for _, u in pool.requests] == ["https://example.com/a", "https://example.com/b", "https://other.example/c"]


def test_redirect_to_http_or_internal_host_is_broken():
    pool = FakePool([(302, [(b"Location", b"http://example.com/insecure")])])
    assert check_url("https://example.com/a", pool) == BROKEN
    pool = FakePool([(302, [(b"Location", b"https://metadata.internal/")]), BlockedAddress("not public")])
    assert check_url("https://example.com/a", pool) == BROKEN


def test_too_many_redirects_is_inconclusive():
    pool = FakePool([(302, [(b"Location", b"/again")])] * (link_check.MAX_REDIRECTS + 1))
    assert check_url("https://example.com/a", pool) == UNKNOWN


def test_filter_resources_drops_only_broken_links(monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    verdicts = {"https://ok.example/": OK, "https://gone.example/": BROKEN, "https://slow.example/": UNKNOWN}
    monkeypatch.setattr(link_check, "check_url", lambda url, pool=None: verdicts[url])
    steps = [
        {"resources": [{"name": "A", "url": "https://ok.example/"}, {"name": "B", "url": "https://gone.example/"}]},
        {"resources": [{"name": "C", "url": "https://slow.example/"}, {"name": "B again", "url": "https://gone.example/"}]},
        {"resources": []},
    ]
    assert filter_resources(steps) == 2
    assert [[r["name"] for r in s["resources"]] for s in steps] == [["A"], ["C"], []]
    assert "1 ok, 1 unknown, 2 dropped" in caplog.text
    assert "gone.example" not in caplog.text


def test_roadmap_generation_runs_the_check_only_when_enabled(monkeypatch, fake_gemini):
    import config
    import generation
    from conftest import ANSWERS_V2, roadmap_reply
    from schemas import QuizAnswersV2

    calls = []
    monkeypatch.setattr(link_check, "filter_resources", lambda steps: calls.append(len(steps)) or 0)
    answers = QuizAnswersV2.model_validate(ANSWERS_V2)
    fake_gemini(roadmap_reply(), roadmap_reply())
    monkeypatch.setattr(config, "LINK_CHECK_ENABLED", False)
    generation.generate_roadmap(answers, "DevOps Engineer")
    assert calls == []
    monkeypatch.setattr(config, "LINK_CHECK_ENABLED", True)
    generation.generate_roadmap(answers, "DevOps Engineer")
    assert calls == [1]
