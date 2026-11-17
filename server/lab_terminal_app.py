"""Isolated Linux shell service for browser-based CAN exercises.

This application is intentionally run in its own restricted container.  It
must never be mounted to the Docker socket or to a host project directory.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import re
from pathlib import Path
from typing import Final

from fastapi import FastAPI, WebSocket, status

from server.routers.terminal import is_allowed_origin
from server.services.terminal_service import run_terminal_session


WORKSPACE_ROOT: Final = Path(os.environ.get("CANLITE_LAB_WORKSPACE", "/workspace"))
SHELL: Final = os.environ.get("CANLITE_LAB_SHELL", "/bin/bash")
ALLOWED_LABS: Final = frozenset(
    {
        "can-basics",
        "can-frame-sender",
        "can-monitor",
        "attack-chain",
        "attack-spoofing",
        "attack-replay",
        "attack-dos",
        "attack-kuksa",
        "attack-swupdate",
        "ids-rule-based",
        "ids-period-based",
        "ids-counter-status",
        "ids-ips-blocking",
        "ids-unknown-id",
        "ids-frequency",
        "ids-payload-jump",
        "ids-gateway",
    }
)
_CANDUMP_LINE = re.compile(
    r"^\([^)]*\)\s+(?P<channel>\S+)\s+(?P<can_id>[0-9A-Fa-f]{3,8})#(?P<data>[0-9A-Fa-f]*)$"
)


app = FastAPI(title="CANLite Isolated Lab Terminal", docs_url=None, redoc_url=None)


def parse_candump_frame(line: str) -> dict[str, object] | None:
    """Turn one ``candump -L`` line into a small browser control message."""

    match = _CANDUMP_LINE.match(line.strip())
    if not match:
        return None

    payload = match.group("data").upper()
    if len(payload) % 2:
        return None

    return {
        "type": "can-frame",
        "channel": match.group("channel"),
        "canId": match.group("can_id").upper(),
        "data": [payload[index : index + 2] for index in range(0, len(payload), 2)],
    }


async def _watch_can_frames(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
) -> None:
    """Observe frames that really reached vcan0 and report them to the UI."""

    process = await asyncio.create_subprocess_exec(
        "candump",
        "-L",
        "vcan0",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        assert process.stdout is not None
        while line := await process.stdout.readline():
            frame = parse_candump_frame(line.decode(errors="replace"))
            if frame is None:
                continue
            async with send_lock:
                await websocket.send_text(json.dumps(frame, separators=(",", ":")))
    finally:
        if process.returncode is None:
            process.terminate()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(process.wait(), timeout=1)


@app.get("/health")
async def health() -> dict[str, object]:
    vcan_mode = os.environ.get("CANLITE_VCAN_MODE", "unavailable")
    return {
        "status": "ok",
        "shell": SHELL,
        "workspace": str(WORKSPACE_ROOT),
        "vcan0": Path("/sys/class/net/vcan0").exists() or vcan_mode == "userspace",
        "vcanMode": vcan_mode,
    }


@app.websocket("/ws/lab-terminal")
async def lab_terminal_socket(websocket: WebSocket, lab: str = "can-basics") -> None:
    if lab not in ALLOWED_LABS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    origin = websocket.headers.get("origin")
    if not is_allowed_origin(origin, require_origin=True):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    send_lock = asyncio.Lock()
    workspace = (WORKSPACE_ROOT / lab).resolve()
    if WORKSPACE_ROOT.resolve() not in workspace.parents or not workspace.is_dir():
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async def send_output(payload: bytes) -> None:
        async with send_lock:
            await websocket.send_bytes(payload)

    await websocket.accept()
    vcan_mode = os.environ.get("CANLITE_VCAN_MODE", "unavailable")
    if vcan_mode == "userspace":
        await send_output(
            b"\r\n\x1b[33m[CANLite] kernel vcan is unavailable; "
            b"the isolated userspace CAN bus is active.\x1b[0m\r\n"
        )
    else:
        await send_output(b"\r\n\x1b[32m[CANLite] kernel SocketCAN vcan0 is active.\x1b[0m\r\n")
    watcher = asyncio.create_task(_watch_can_frames(websocket, send_lock))
    try:
        await run_terminal_session(
            websocket,
            project_root=workspace,
            shell=SHELL,
            send_output=send_output,
            environment={
                "CANLITE_LAB_ID": lab,
                "HOME": str(workspace),
                "PS1": f"\\[\\e[38;2;126;178;158m\\]{lab}\\[\\e[0m\\]:\\[\\e[38;2;170;191;184m\\]\\w\\[\\e[0m\\]$ ",
            },
        )
    finally:
        watcher.cancel()
        with contextlib.suppress(asyncio.CancelledError, OSError):
            await watcher
