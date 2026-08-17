"""PTY, shell process, and terminal I/O handling."""

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

from fastapi import WebSocket, WebSocketDisconnect


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


async def run_terminal_session(
    websocket: WebSocket,
    *,
    project_root: Path,
    shell: str,
) -> None:
    master_fd, slave_fd = pty.openpty()
    set_window_size(master_fd, rows=28, columns=112)
    process = await asyncio.create_subprocess_exec(
        shell,
        "--noprofile",
        "--norc",
        "-i",
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=str(project_root),
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
