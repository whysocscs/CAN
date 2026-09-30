"""Run an isolated real SWUpdate multipart parser comparison."""

import json
import os
import re
import subprocess
from pathlib import Path
from threading import Lock

from repro.swupdate_http_probe import build_request


_lock = Lock()  # SWUpdate uses shared IPC sockets even when HTTP ports differ.


def _base_command(*, root: str, distro: str, variant: str, boundary: str) -> list[str]:
    if variant not in ("vulnerable", "patched"):
        raise ValueError("invalid SWUpdate variant")
    if not re.fullmatch(r"[A-Za-z0-9]{1,24}", boundary):
        raise ValueError("boundary must be 1 to 24 ASCII letters or numbers")
    if not root.startswith("/"):
        raise ValueError("SWUpdate reproduction root must be an absolute WSL path")
    script = Path(__file__).resolve().parents[2] / "repro/swupdate_live_run.py"
    if os.name == "nt":
        drive, rest = os.path.splitdrive(str(script))
        script_path = f"/mnt/{drive[0].lower()}/{rest.replace(chr(92), '/').lstrip('/')}"
        command = ["wsl", "-d", distro, "--", "timeout", "-s", "INT", "-k", "5s", "75s", "python3", script_path]
    else:
        command = ["timeout", "-s", "INT", "-k", "5s", "75s", "python3", str(script)]
    command.extend((
        "--root", root,
        "--variant", variant,
        "--boundary", boundary,
    ))
    return command


def _execute(command: list[str], *, variant: str, expected_hex: tuple[str, str] | None = None) -> dict[str, object]:
    with _lock:
        try:
            process = subprocess.run(command, capture_output=True, text=True, timeout=90)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(f"SWUpdate reproduction process could not run: {exc}") from exc
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or "SWUpdate reproduction process failed")
    try:
        result = json.loads(process.stdout)
        if result["evidenceKind"] != "actual_process" or result["variant"] != variant:
            raise ValueError("unexpected SWUpdate output")
        observation = result["observation"]
        reported_bytes = observation["reportedBytes"]
        if (not isinstance(result["serverLog"], str)
                or not isinstance(observation["ipcBadAddress"], bool)
                or not isinstance(observation["negativeReportedLength"], bool)
                or (reported_bytes is not None and type(reported_bytes) is not int)):
            raise ValueError("missing SWUpdate observation")
        if expected_hex is not None:
            request = result["request"]
            if request.get("transmissionComplete") is not True:
                raise ValueError("incomplete SWUpdate request transmission")
            if (request["firstChunkHex"], request["finalChunkHex"]) != expected_hex:
                raise ValueError("SWUpdate runner sent bytes different from the validated request")
            if request["declaredContentLength"] != request["actualBodyLength"]:
                raise ValueError("SWUpdate request body length mismatch")
        return result
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("SWUpdate reproduction output was incomplete") from exc


def run_repro_process(*, root: str, distro: str, variant: str, boundary: str, mode: str) -> dict[str, object]:
    if mode not in ("truncated", "complete"):
        raise ValueError("invalid multipart mode")
    command = _base_command(root=root, distro=distro, variant=variant, boundary=boundary)
    return _execute(command + ["--mode", mode], variant=variant)


def run_custom_repro_process(
    *, root: str, distro: str, variant: str, boundary: str,
    terminal_chunk_escaped: str, declared_content_length: int,
) -> dict[str, object]:
    """Preflight exact bytes locally, then serialize the real WSL run with legacy runs."""
    request = build_request(
        boundary=boundary, terminal_chunk_escaped=terminal_chunk_escaped,
        declared_content_length=declared_content_length,
    )
    command = _base_command(root=root, distro=distro, variant=variant, boundary=boundary)
    command.extend((
        # wsl.exe consumes backslashes in argv; pass the validated byte value as ASCII hex.
        "--terminal-chunk-hex", request.final_chunk.hex(),
        "--declared-content-length", str(declared_content_length),
    ))
    return _execute(
        command, variant=variant,
        expected_hex=((request.header + request.prefix).hex(), request.final_chunk.hex()),
    )
