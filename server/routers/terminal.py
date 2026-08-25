"""Health and WebSocket routes for the local terminal."""

import os
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, status

HOST: Final = "127.0.0.1"
PROJECT_ROOT: Final = Path(os.environ.get("CANLITE_SHELL_CWD", Path.cwd())).resolve()
SHELL: Final = os.environ.get("CANLITE_SHELL", "/bin/bash")
ALLOWED_ORIGINS: Final = frozenset(
    origin.strip()
    for origin in os.environ.get(
        "CANLITE_TERMINAL_ORIGINS",
        "http://127.0.0.1:8447,http://localhost:8447",
    ).split(",")
    if origin.strip()
)


def is_allowed_origin(origin: str | None) -> bool:
    """로컬 Vite 개발 서버는 포트가 달라질 수 있어 호스트 기준으로 허용한다."""
    if not origin:
        return True
    parsed = urlparse(origin)
    return origin in ALLOWED_ORIGINS or parsed.hostname in {"localhost", "127.0.0.1"}

router = APIRouter()


def _real_terminal_enabled() -> bool:
    return os.environ.get("CANLITE_ENABLE_REAL_TERMINAL", "").strip().lower() == "true"


@router.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "host": HOST,
        "cwd": str(PROJECT_ROOT),
        "shell": SHELL,
    }


@router.websocket("/ws/terminal")
async def terminal_socket(websocket: WebSocket) -> None:
    if not _real_terminal_enabled():
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    origin = websocket.headers.get("origin")
    if not is_allowed_origin(origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # PTY support is POSIX-specific. Keep the health/CAN routers importable on
    # Windows and load it only when a real terminal session is requested.
    from server.services.terminal_service import run_terminal_session

    await websocket.accept()
    await run_terminal_session(
        websocket,
        project_root=PROJECT_ROOT,
        shell=SHELL,
    )
