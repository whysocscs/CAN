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
    origin = websocket.headers.get("origin")
    if not is_allowed_origin(origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Windows에서는 PTY 전용 fcntl을 사용할 수 없다. CAN API 기동은 막지 않고,
    # 실제 Linux 터미널 요청이 들어온 경우에만 해당 서비스를 불러온다.
    from server.services.terminal_service import run_terminal_session

    await websocket.accept()
    await run_terminal_session(
        websocket,
        project_root=PROJECT_ROOT,
        shell=SHELL,
    )
