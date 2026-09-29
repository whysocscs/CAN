"""Own one bounded, local, persistent KUKSA door-signal experiment."""

import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from secrets import token_hex
from typing import Literal, TypedDict

from repro.kuksa_live_run import VARIANTS


TARGET_PATH = "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"
MAX_LINE = 8192
MAX_LOG = 20000


class KuksaSessionConflict(Exception):
    """A session ID or revision is stale, or the single slot is occupied."""


class KuksaSessionUnavailable(RuntimeError):
    """The owned upstream process failed or returned untrustworthy evidence."""


class SessionState(TypedDict):
    sessionId: str
    revision: int
    variant: Literal["vulnerable", "patched"]
    sourceCommit: str
    targetPath: str


SessionEvent = dict[str, object]


def _host_command(*, root: str, distro: str, variant: str) -> list[str]:
    script = Path(__file__).resolve().parents[2] / "repro/kuksa_door_session.py"
    if os.name == "nt":
        drive, rest = os.path.splitdrive(str(script))
        path = f"/mnt/{drive[0].lower()}/{rest.replace(chr(92), '/').lstrip('/')}"
        command = ["wsl", "-d", distro, "--", "python3", "-u", path]
    else:
        command = [sys.executable, "-u", str(script)]
    return [*command, "--root", root, "--variant", variant]


def _bounded_stdout(stream, destination: queue.Queue[str | None]) -> None:
    try:
        while True:
            line = stream.readline(MAX_LINE + 1)
            if not line:
                break
            try:
                destination.put(line, timeout=1)
            except queue.Full:
                break
    finally:
        stream.close()
        try:
            destination.put(None, timeout=1)
        except queue.Full:
            pass


class _StderrTail:
    def __init__(self):
        self._text = ""
        self._lock = threading.Lock()

    def add(self, line: str) -> None:
        with self._lock:
            self._text = (self._text + line)[-4000:]

    def get(self) -> str:
        with self._lock:
            return self._text


def _drain_stderr(stream, tail: _StderrTail) -> None:
    try:
        for line in stream:
            tail.add(line)
    finally:
        stream.close()


@dataclass
class _Active:
    state: SessionState
    process: subprocess.Popen
    responses: queue.Queue[str | None]
    stderr: _StderrTail
    last_activity: float
    timer: threading.Timer | None = None


def _validate_command(command: dict[str, object]) -> dict[str, object]:
    if not isinstance(command, dict):
        raise ValueError("invalid KUKSA command")
    action = command.get("action")
    if action in ("metadata", "read") and set(command) == {"action"}:
        return {"action": action}
    if action == "register" and set(command) == {"action", "providerRole", "providedOpen"}:
        role, value = command["providerRole"], command["providedOpen"]
        if role in ("read", "provide") and type(value) is bool:
            return {"action": action, "providerRole": role, "providedOpen": value}
    raise ValueError("invalid KUKSA command fields")


def _checked_json_line(line: str | None) -> dict[str, object]:
    if line is None or len(line.encode("utf-8")) > MAX_LINE or not line.endswith("\n"):
        raise KuksaSessionUnavailable("KUKSA process output ended or exceeded its limit")
    try:
        body = json.loads(line)
    except json.JSONDecodeError as exc:
        raise KuksaSessionUnavailable("KUKSA process returned invalid JSON") from exc
    if not isinstance(body, dict):
        raise KuksaSessionUnavailable("KUKSA process returned an invalid event")
    return body


class KuksaSessionManager:
    def __init__(self, *, idle_seconds: float = 300):
        if idle_seconds <= 0:
            raise ValueError("idle timeout must be positive")
        self._idle_seconds = idle_seconds
        self._lock = threading.RLock()
        self._active: _Active | None = None

    def _read(self, active: _Active, timeout: float) -> dict[str, object]:
        try:
            line = active.responses.get(timeout=timeout)
        except queue.Empty as exc:
            raise KuksaSessionUnavailable("KUKSA process did not respond before the deadline") from exc
        return _checked_json_line(line)

    def _schedule_idle(self, active: _Active) -> None:
        if active.timer is not None:
            active.timer.cancel()
        timer = threading.Timer(
            self._idle_seconds, self._expire_if_idle, args=(active.state["sessionId"],),
        )
        timer.daemon = True
        active.timer = timer
        timer.start()

    def _expire_if_idle(self, session_id: str) -> None:
        with self._lock:
            active = self._active
            if active is None or active.state["sessionId"] != session_id:
                return
            if time.monotonic() - active.last_activity >= self._idle_seconds:
                self._close_unlocked()
            else:
                self._schedule_idle(active)

    def _close_unlocked(self) -> None:
        active = self._active
        self._active = None
        if active is None:
            return
        if active.timer is not None:
            active.timer.cancel()
        process = active.process
        if process.stdin is not None and not process.stdin.closed:
            try:
                process.stdin.close()
            except OSError:
                pass
        try:
            process.wait(timeout=12)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    def start(
        self, *, root: str, distro: str, variant: Literal["vulnerable", "patched"]
    ) -> SessionState:
        with self._lock:
            if self._active is not None:
                raise KuksaSessionConflict("이미 진행 중인 KUKSA 실습이 있습니다. 먼저 초기화하세요.")
            if variant not in VARIANTS or not root.startswith("/") or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", distro):
                raise ValueError("invalid pinned KUKSA environment")
            responses: queue.Queue[str | None] = queue.Queue(maxsize=8)
            stderr = _StderrTail()
            command = _host_command(root=root, distro=distro, variant=variant)
            try:
                process = subprocess.Popen(
                    command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, bufsize=1,
                )
            except OSError as exc:
                raise KuksaSessionUnavailable(f"KUKSA host could not start: {exc}") from exc
            assert process.stdout is not None and process.stderr is not None
            threading.Thread(
                target=_bounded_stdout, args=(process.stdout, responses), daemon=True,
            ).start()
            threading.Thread(
                target=_drain_stderr, args=(process.stderr, stderr), daemon=True,
            ).start()
            expected_commit = VARIANTS[variant][1]
            active = _Active(
                state={
                    "sessionId": token_hex(16), "revision": 0, "variant": variant,
                    "sourceCommit": expected_commit, "targetPath": TARGET_PATH,
                },
                process=process, responses=responses, stderr=stderr,
                last_activity=time.monotonic(),
            )
            self._active = active
            try:
                ready = self._read(active, 45)
                if (
                    ready.get("kind") != "ready"
                    or ready.get("evidenceKind") != "actual_process"
                    or ready.get("variant") != variant
                    or ready.get("sourceCommit") != expected_commit
                    or ready.get("targetPath") != TARGET_PATH
                ):
                    raise KuksaSessionUnavailable("KUKSA host did not verify pinned source")
                active.last_activity = time.monotonic()
                self._schedule_idle(active)
                return active.state.copy()
            except (KuksaSessionUnavailable, OSError):
                self._close_unlocked()
                raise

    def execute(
        self, *, session_id: str, revision: int, command: dict[str, object]
    ) -> tuple[SessionState, SessionEvent]:
        with self._lock:
            active = self._active
            if active is None or active.state["sessionId"] != session_id or active.state["revision"] != revision:
                raise KuksaSessionConflict("KUKSA 세션이 바뀌었습니다. 현재 실습을 다시 시작하세요.")
            if time.monotonic() - active.last_activity >= self._idle_seconds:
                self._close_unlocked()
                raise KuksaSessionConflict("KUKSA 실습이 유휴 시간 만료로 종료됐습니다.")
            prepared = _validate_command(command)
            seq = revision + 1
            request = json.dumps({"seq": seq, **prepared}, separators=(",", ":")) + "\n"
            try:
                assert active.process.stdin is not None
                active.process.stdin.write(request)
                active.process.stdin.flush()
                envelope = self._read(active, 10)
                event = envelope.get("event")
                if (
                    envelope.get("kind") != "event"
                    or envelope.get("evidenceKind") != "actual_process"
                    or envelope.get("variant") != active.state["variant"]
                    or envelope.get("sourceCommit") != active.state["sourceCommit"]
                    or not isinstance(event, dict)
                    or event.get("seq") != seq
                    or event.get("action") != prepared["action"]
                    or event.get("signalPath") != TARGET_PATH
                    or event.get("outcome") not in ("ok", "denied", "error")
                    or not isinstance(event.get("grpcStatus"), str)
                ):
                    raise KuksaSessionUnavailable("KUKSA host returned mismatched process evidence")
                if prepared["action"] == "read":
                    if type(event.get("readValue")) not in (bool, type(None)):
                        raise KuksaSessionUnavailable("KUKSA read returned a non-boolean value")
                elif "readValue" in event:
                    raise KuksaSessionUnavailable("KUKSA host returned a read value without a read")
                if prepared["action"] == "register" and type(event.get("registrationAccepted")) is not bool:
                    raise KuksaSessionUnavailable("KUKSA registration response was incomplete")
                broker_log = envelope.get("brokerLog")
                client_error = envelope.get("clientError")
                if not isinstance(broker_log, str) or not isinstance(client_error, str):
                    raise KuksaSessionUnavailable("KUKSA process logs were incomplete")
                event["brokerLog"] = broker_log[-MAX_LOG:]
                event["clientError"] = client_error[-4000:]
                active.state["revision"] += 1
                active.last_activity = time.monotonic()
                self._schedule_idle(active)
                return active.state.copy(), event
            except (OSError, BrokenPipeError, KuksaSessionUnavailable) as exc:
                self._close_unlocked()
                if isinstance(exc, KuksaSessionUnavailable):
                    raise
                raise KuksaSessionUnavailable("KUKSA host connection was lost") from exc

    def close(self, *, session_id: str, revision: int) -> None:
        with self._lock:
            active = self._active
            if active is None or active.state["sessionId"] != session_id or active.state["revision"] != revision:
                raise KuksaSessionConflict("KUKSA 세션이 바뀌었습니다. 현재 실습을 다시 시작하세요.")
            self._close_unlocked()

    def shutdown(self) -> None:
        with self._lock:
            self._close_unlocked()
