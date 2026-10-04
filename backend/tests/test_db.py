"""db.py: optional configuration, per-transaction claims, error mapping.
No network: the connection pool is faked."""

import json
from contextlib import contextmanager

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg_pool import PoolTimeout

import config
import db
import main

USER = "5b0c7a4e-1111-4222-8333-944455556666"


class FakeConn:
    def __init__(self, error_on=None):
        self.calls = []
        self.events = []
        self.error_on = error_on

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if self.error_on and self.error_on in sql:
            raise psycopg.OperationalError("server closed the connection")

    @contextmanager
    def transaction(self):
        self.events.append("begin")
        try:
            yield
        except BaseException:
            self.events.append("rollback")
            raise
        self.events.append("commit")


class FakePool:
    def __init__(self, conn=None, error=None):
        self.conn = conn or FakeConn()
        self.error = error

    @contextmanager
    def connection(self):
        if self.error:
            raise self.error
        yield self.conn


def test_not_configured_without_database_url(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert not db.configured()
    with pytest.raises(db.DatabaseUnavailable):
        with db.transaction(USER):
            pass


def test_app_starts_and_is_healthy_without_database_url():
    assert not db.configured()
    with TestClient(main.app) as client:  # runs the lifespan (startup + shutdown)
        assert client.get("/health").json() == {"status": "ok"}


def test_transaction_sets_transaction_local_claims_first(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(db, "_get_pool", lambda: pool)
    with db.transaction(USER) as conn:
        conn.execute("select 1")
    sql, params = pool.conn.calls[0]
    assert "set_config('request.jwt.claims'" in sql and sql.rstrip(")").endswith("true")
    assert json.loads(params[0]) == {"sub": USER, "role": "authenticated"}
    assert pool.conn.calls[1][0] == "select 1"
    assert pool.conn.events == ["begin", "commit"]


def test_transaction_rolls_back_on_error(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(db, "_get_pool", lambda: pool)
    with pytest.raises(ValueError):
        with db.transaction(USER):
            raise ValueError("boom")
    assert pool.conn.events == ["begin", "rollback"]


def test_pool_timeout_becomes_unavailable(monkeypatch):
    monkeypatch.setattr(db, "_get_pool", lambda: FakePool(error=PoolTimeout("no connection")))
    with pytest.raises(db.DatabaseUnavailable):
        with db.transaction(USER):
            pass


def test_connection_failure_inside_block_becomes_unavailable(monkeypatch):
    pool = FakePool(conn=FakeConn(error_on="select 1"))
    monkeypatch.setattr(db, "_get_pool", lambda: pool)
    with pytest.raises(db.DatabaseUnavailable):
        with db.transaction(USER) as conn:
            conn.execute("select 1")


def test_other_database_errors_propagate(monkeypatch):
    monkeypatch.setattr(db, "_get_pool", lambda: FakePool())
    with pytest.raises(psycopg.errors.UniqueViolation):
        with db.transaction(USER):
            raise psycopg.errors.UniqueViolation("duplicate")


def test_close_without_pool_is_safe():
    db.close()
    db.close()
