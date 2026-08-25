"""Security boundary tests for the optional real PTY WebSocket."""

from __future__ import annotations

import asyncio
import builtins
import sys
from types import ModuleType

from fastapi import status

from server.routers import terminal


class FakeWebSocket:
    def __init__(self, origin: str | None) -> None:
        self.headers = {} if origin is None else {"origin": origin}
        self.accepted = False
        self.close_code: int | None = None

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, *, code: int) -> None:
        self.close_code = code


def _fail_if_pty_service_is_imported(monkeypatch) -> None:
    real_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "server.services.terminal_service":
            raise AssertionError("blocked PTY requests must not import the POSIX service")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)


def test_real_terminal_is_disabled_by_default_before_posix_import(monkeypatch) -> None:
    """Removing the default-off gate would import fcntl/pty on blocked requests."""

    monkeypatch.delenv("CANLITE_ENABLE_REAL_TERMINAL", raising=False)
    _fail_if_pty_service_is_imported(monkeypatch)
    websocket = FakeWebSocket("http://127.0.0.1:8447")

    asyncio.run(terminal.terminal_socket(websocket))

    assert websocket.close_code == status.WS_1008_POLICY_VIOLATION
    assert websocket.accepted is False


def test_enabled_terminal_rejects_missing_origin_before_posix_import(monkeypatch) -> None:
    """Accepting an Origin-less browser request would bypass the CSWSH boundary."""

    monkeypatch.setenv("CANLITE_ENABLE_REAL_TERMINAL", "true")
    _fail_if_pty_service_is_imported(monkeypatch)
    websocket = FakeWebSocket(None)

    asyncio.run(terminal.terminal_socket(websocket))

    assert websocket.close_code == status.WS_1008_POLICY_VIOLATION
    assert websocket.accepted is False


def test_enabled_terminal_rejects_disallowed_origin_before_posix_import(monkeypatch) -> None:
    """Allowing an arbitrary Origin would expose the local shell to another site."""

    monkeypatch.setenv("CANLITE_ENABLE_REAL_TERMINAL", "true")
    _fail_if_pty_service_is_imported(monkeypatch)
    websocket = FakeWebSocket("https://attacker.invalid")

    asyncio.run(terminal.terminal_socket(websocket))

    assert websocket.close_code == status.WS_1008_POLICY_VIOLATION
    assert websocket.accepted is False


def test_enabled_terminal_with_allowed_origin_calls_lazy_pty_service(monkeypatch) -> None:
    """Breaking the positive gate would make the documented opt-in unusable."""

    calls: list[tuple[FakeWebSocket, object, str]] = []

    async def fake_run_terminal_session(websocket, *, project_root, shell) -> None:
        calls.append((websocket, project_root, shell))

    fake_service = ModuleType("server.services.terminal_service")
    fake_service.run_terminal_session = fake_run_terminal_session
    monkeypatch.setitem(sys.modules, "server.services.terminal_service", fake_service)
    monkeypatch.setenv("CANLITE_ENABLE_REAL_TERMINAL", "true")
    websocket = FakeWebSocket("http://127.0.0.1:8447")

    asyncio.run(terminal.terminal_socket(websocket))

    assert websocket.accepted is True
    assert websocket.close_code is None
    assert calls == [(websocket, terminal.PROJECT_ROOT, terminal.SHELL)]
