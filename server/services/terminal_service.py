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
from collections.abc import Awaitable, Callable
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


def shell_environment(overrides: dict[str, str] | None = None) -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "TERM": "xterm-256color",
            "COLORTERM": "truecolor",
            "PS1": "\\[\\e[38;2;126;178;158m\\]can@canlite\\[\\e[0m\\]:\\[\\e[38;2;170;191;184m\\]\\w\\[\\e[0m\\]$ ",
        }
    )
    if overrides:
        environment.update(overrides)
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
    send_output: Callable[[bytes], Awaitable[None]] | None = None,
    environment: dict[str, str] | None = None,
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
        env=shell_environment(environment),
        start_new_session=True,
    )
    os.close(slave_fd)
    os.set_blocking(master_fd, False)

    async def forward_terminal_output() -> None:
        loop = asyncio.get_running_loop()
        while True:
            ready = loop.create_future()

            def on_readable() -> None:
                if not ready.done():
                    ready.set_result(None)

            loop.add_reader(master_fd, on_readable)
            try:
                await ready
            finally:
                loop.remove_reader(master_fd)
            try:
                output = os.read(master_fd, 4096)
            except BlockingIOError:
                continue
            if not output:
                return
            if send_output is None:
                await websocket.send_bytes(output)
            else:
                await send_output(output)

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
        output_task.cancel()
        with contextlib.suppress(asyncio.CancelledError, OSError):
            await output_task
        with contextlib.suppress(OSError):
            os.close(master_fd)
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(process.wait(), timeout=1)
