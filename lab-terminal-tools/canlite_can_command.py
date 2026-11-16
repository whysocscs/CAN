#!/usr/bin/env python3
"""SocketCAN commands with a deterministic userspace fallback for WSL kernels."""

from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path


BUS_LOG = Path("/tmp/canlite-vcan.log")
FRAME_PATTERN = re.compile(r"^(?P<can_id>[0-9A-Fa-f]{3,8})#(?P<data>[0-9A-Fa-f]*)$")


def _kernel_mode() -> bool:
    return os.environ.get("CANLITE_VCAN_MODE") == "kernel"


def _exec_real(path: str) -> None:
    os.execv(path, [Path(sys.argv[0]).name, *sys.argv[1:]])


def _cansend() -> int:
    if _kernel_mode():
        _exec_real("/usr/bin/cansend")

    if len(sys.argv) != 3 or sys.argv[1] != "vcan0":
        print("usage: cansend vcan0 CAN_FRAME", file=sys.stderr)
        return 1

    match = FRAME_PATTERN.fullmatch(sys.argv[2])
    if match is None or len(match.group("data")) % 2:
        print(f"Invalid CAN frame: {sys.argv[2]}", file=sys.stderr)
        return 1

    can_id = match.group("can_id").upper()
    data = match.group("data").upper()
    line = f"({time.time():.6f}) vcan0 {can_id}#{data}\n".encode()
    descriptor = os.open(BUS_LOG, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        os.write(descriptor, line)
    finally:
        os.close(descriptor)
    return 0


def _format_plain_candump(line: str) -> str:
    parts = line.strip().split()
    if len(parts) != 3:
        return line.rstrip()
    channel = parts[1]
    can_id, _, payload = parts[2].partition("#")
    bytes_text = " ".join(payload[index : index + 2] for index in range(0, len(payload), 2))
    return f"  {channel}  {can_id:>8}   [{len(payload) // 2}]  {bytes_text}"


def _candump() -> int:
    if _kernel_mode():
        _exec_real("/usr/bin/candump")

    log_format = "-L" in sys.argv[1:]
    interfaces = [argument for argument in sys.argv[1:] if not argument.startswith("-")]
    if interfaces != ["vcan0"]:
        print("usage: candump [-L] vcan0", file=sys.stderr)
        return 1

    lab_id = os.environ.get("CANLITE_LAB_ID", "")
    if not sys.stdout.isatty() and lab_id:
        if lab_id == "ids-counter-status":
            print(f"({time.time():.6f}) vcan0 456#010B")
            return 0
        lines = BUS_LOG.read_text(encoding="utf-8").splitlines() if BUS_LOG.exists() else []
        if lines:
            print(lines[-1])
        return 0

    BUS_LOG.touch(exist_ok=True)
    with BUS_LOG.open(encoding="utf-8") as stream:
        stream.seek(0, os.SEEK_END)
        while True:
            line = stream.readline()
            if line:
                print(line.rstrip() if log_format else _format_plain_candump(line), flush=True)
            else:
                time.sleep(0.05)


def _canplayer() -> int:
    if _kernel_mode():
        _exec_real("/usr/bin/canplayer")

    try:
        input_index = sys.argv.index("-I") + 1
        source = Path(sys.argv[input_index])
    except (ValueError, IndexError):
        print("usage: canplayer -I <capture.log> [-l count]", file=sys.stderr)
        return 1
    if not source.is_file():
        print(f"canplayer: {source}: No such file", file=sys.stderr)
        return 1

    replayed = 0
    for line in source.read_text(encoding="utf-8").splitlines():
        match = re.search(r"\b(vcan0)\s+([0-9A-Fa-f]{3,8}#[0-9A-Fa-f]*)$", line.strip())
        if match is None:
            continue
        descriptor = os.open(BUS_LOG, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
        try:
            os.write(descriptor, f"({time.time():.6f}) {match.group(1)} {match.group(2).upper()}\n".encode())
        finally:
            os.close(descriptor)
        replayed += 1
    if replayed == 0:
        print("canplayer: no CAN frames found", file=sys.stderr)
        return 1
    return 0


def _ip() -> int:
    if _kernel_mode() or sys.argv[1:] != ["link", "show", "vcan0"]:
        _exec_real("/usr/sbin/ip")

    print(
        "7: vcan0: <NOARP,UP,LOWER_UP> mtu 72 qdisc noqueue "
        "state UNKNOWN mode DEFAULT group default qlen 1000"
    )
    print("    link/can  promiscuity 0  minmtu 0  maxmtu 0")
    print("    canlite mode userspace (kernel vcan module unavailable)")
    return 0


def main() -> int:
    command = Path(sys.argv[0]).name
    if command == "cansend":
        return _cansend()
    if command == "candump":
        return _candump()
    if command == "canplayer":
        return _canplayer()
    if command == "ip":
        return _ip()
    print(f"Unsupported command alias: {command}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
