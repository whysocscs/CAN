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


def is_allowed_origin(
    origin: str | None,
    *,
    require_origin: bool = False,
) -> bool:
    """허용된 로컬 개발 서버에서 시작한 WebSocket 요청인지 확인한다.

    CAN stream은 Origin을 보내지 않는 로컬 도구도 구독할 수 있다. 반면 실제 PTY는
    브라우저 Origin이 없는 요청을 허용하면 안 되므로 호출 지점에서 엄격 모드를 켠다.
    """
    if not origin:
        return not require_origin
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
    if not is_allowed_origin(origin, require_origin=True):
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
