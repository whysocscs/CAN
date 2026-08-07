"""Loopback-only PTY bridge for the CANLite local lab terminal.

This service intentionally executes commands with the same permissions as the
person who starts it.  It is for a single local browser only: keep the Uvicorn
host set to 127.0.0.1 and do not deploy it to a shared or public network.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import json
import os
import pty
import signal
import struct
import termios
from pathlib import Path
from typing import Final

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware


HOST: Final = "127.0.0.1"
PORT: Final = 8010
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

app = FastAPI(title="CANLite Local Terminal", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def set_window_size(file_descriptor: int, rows: int, columns: int) -> None:
    rows = max(1, min(rows, 500))
    columns = max(1, min(columns, 500))
    fcntl.ioctl(
        file_descriptor,
        termios.TIOCSWINSZ,
        struct.pack("HHHH", rows, columns, 0, 0),
    )


def shell_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "TERM": "xterm-256color",
            "COLORTERM": "truecolor",
            "PS1": "\\[\\e[38;2;126;178;158m\\]can@canlite\\[\\e[0m\\]:\\[\\e[38;2;170;191;184m\\]\\w\\[\\e[0m\\]$ ",
        }
    )
    return environment


def terminate_process(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGTERM)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "host": HOST,
        "cwd": str(PROJECT_ROOT),
        "shell": SHELL,
    }


@app.websocket("/ws/terminal")
async def terminal_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    master_fd, slave_fd = pty.openpty()
    set_window_size(master_fd, rows=28, columns=112)
    process = await asyncio.create_subprocess_exec(
        SHELL,
        "--noprofile",
        "--norc",
        "-i",
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=str(PROJECT_ROOT),
        env=shell_environment(),
        start_new_session=True,
    )
    os.close(slave_fd)

    async def forward_terminal_output() -> None:
        while True:
            output = await asyncio.to_thread(os.read, master_fd, 4096)
            if not output:
                return
            await websocket.send_bytes(output)

    output_task = asyncio.create_task(forward_terminal_output())
    try:
        while True:
            event = await websocket.receive()
            if event.get("type") == "websocket.disconnect":
                break

            if payload := event.get("bytes"):
                os.write(master_fd, payload)
                continue

            text = event.get("text")
            if not text:
                continue
            message = json.loads(text)
            if message.get("type") == "input":
                data = str(message.get("data", "")).encode()
                if data:
                    os.write(master_fd, data)
            elif message.get("type") == "resize":
                set_window_size(
                    master_fd,
                    rows=int(message.get("rows", 28)),
                    columns=int(message.get("cols", 112)),
                )
    except (WebSocketDisconnect, ConnectionError, json.JSONDecodeError, OSError):
        pass
    finally:
        terminate_process(process)
        with contextlib.suppress(OSError):
            os.close(master_fd)
        output_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, OSError):
            await output_task
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(process.wait(), timeout=1)
