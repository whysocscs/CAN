"""Health and WebSocket routes for the local terminal."""

import os
from pathlib import Path
from typing import Final

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
    # PTY support is POSIX-specific.  Keep the health/CAN routers importable on
    # Windows; the restricted door lab itself never uses this real terminal.
    from server.services.terminal_service import run_terminal_session

    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await run_terminal_session(
        websocket,
        project_root=PROJECT_ROOT,
        shell=SHELL,
    )
