"""Pure, deliberately limited Toy Body ECU and IDS domain.

This module parses only the documented educational command grammar.  It never
starts a shell or evaluates learner supplied text.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import re
import time
from typing import Final


_TARGET_CAN_ID: Final = "0x456"
_RESET_COUNTER: Final = 0x12
_MAX_SCRIPT_CHARS: Final = 4096
_MAX_SCRIPT_LINES: Final = 20
_CANSEND_RE: Final = re.compile(r"^cansend vcan0 ([0-9a-fA-F]{1,3})#([0-9a-fA-F]{2,16})$")
_BYTE_RE: Final = re.compile(r"^[0-9a-fA-F]{2}$")

_BASELINE_LOG: Final = "\n".join(
    (
        "(1720000000.100000) vcan0 18F#3A7C",
        "(1720000000.200000) vcan0 456#010110B5",
        "(1720000000.300000) vcan0 321#FFE0",
        "(1720000000.400000) vcan0 456#010111B4",
        "(1720000000.500000) vcan0 2A0#10",
        "(1720000000.600000) vcan0 456#010112B7",
    )
)
_DOOR_OPEN_LOG: Final = "\n".join(
    (
        "(1720000100.100000) vcan0 18F#3A7C",
        "(1720000100.200000) vcan0 456#00012084",
        "(1720000100.300000) vcan0 321#FFE0",
        "(1720000100.400000) vcan0 456#00012185",
        "(1720000100.500000) vcan0 2A0#10",
        "(1720000100.600000) vcan0 456#00012286",
    )
)


@dataclass(frozen=True)
class FrameAttempt:
    attempt_id: str
    timestamp: int
    can_id: str
    data: tuple[str, ...]
    verdict: str

    @property
    def accepted(self) -> bool:
        return self.verdict == "EXECUTED"


@dataclass(frozen=True)
class TerminalResult:
    ok: bool
    code: str
    output: str
    frames: tuple[FrameAttempt, ...] = ()


@dataclass(frozen=True)
class ScriptResult:
    attempts: tuple[FrameAttempt, ...]
    ids_status: str
    state: dict[str, object]
    interval_ms: int | None = None
    error: str | None = None


class DoorBlackboxSession:
    """Stateful session for a Toy ECU, with private protocol validation state."""

    def __init__(self, *, session_id: str, clock_ms: Callable[[], int] | None = None) -> None:
        self.session_id = session_id
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._attempt_sequence = 0
        self._capture_sequence = 0
        self.reset()

    def reset(self) -> None:
        self._expected_counter = _RESET_COUNTER
        self._left_door = "closed"
        self._right_door = "closed"
        self._attempt_count = 0
        self._capture_seen = False
        self._last_verdicts: list[str] = []
        self._completed = False

    def public_state(self) -> dict[str, object]:
        if self._completed:
            stage = "증거"
        elif self._last_verdicts and self._last_verdicts[-1] == "COUNTER_REJECTED":
            stage = "Replay 실패"
        elif self._last_verdicts and self._last_verdicts[-1] == "EXECUTED":
            stage = "IDS 검증"
        elif self._attempt_count:
            stage = "프레임 제작"
        elif self._capture_seen:
            stage = "분석"
        else:
            stage = "정찰"

        evidence: list[dict[str, str]] = []
        if self._capture_seen:
            evidence.append({"kind": "capture", "status": "observed"})
        if self._attempt_count:
            evidence.append({"kind": "attempt", "status": "recorded"})
        if self._completed:
            evidence.append({"kind": "toy_ids", "status": "normal"})
        return {
            "sessionId": self.session_id,
            "stage": stage,
            "targetLabel": "Toy Body ECU",
            "messageContractStatus": "INFERRED" if self._attempt_count else ("OBSERVED" if self._capture_seen else "UNKNOWN"),
            "vehicleState": {"leftDoor": self._left_door, "rightDoor": self._right_door},
            "evidence": evidence,
            "attemptCount": self._attempt_count,
            "completed": self._completed,
        }

    def execute_terminal(self, command: str) -> TerminalResult:
        """Interpret a tiny fixed command whitelist; never execute command text."""
        normalized = command.strip()
        fixed_outputs = {
            "pwd": "/lab",
            "whoami": "learner",
            "ls": "baseline.log\ndoor-open.log",
            "ip link show dev vcan0": "3: vcan0: <NOARP,UP,LOWER_UP> mtu 72 qdisc noop state UNKNOWN",
        }
        if normalized in fixed_outputs:
            return TerminalResult(True, "OK", fixed_outputs[normalized])
        if normalized in {"cat baseline.log", "cat door-open.log", "candump vcan0", "candump -L vcan0"}:
            self._capture_seen = True
            output = _BASELINE_LOG if "baseline" in normalized else _DOOR_OPEN_LOG
            frames = self._capture_frames(output)
            return TerminalResult(True, "OK", output, frames)
        if _CANSEND_RE.fullmatch(normalized):
            result = self.run_script(normalized)
            attempt = result.attempts[0] if result.attempts else None
            if attempt is None:
                return TerminalResult(False, result.error or "COMMAND_REJECTED", "invalid educational CAN frame")
            return TerminalResult(attempt.accepted, attempt.verdict, attempt.verdict, (attempt,))
        return TerminalResult(False, "COMMAND_REJECTED", "restricted lab shell: command is not allowed")

    def run_script(self, script: str) -> ScriptResult:
        if len(script) > _MAX_SCRIPT_CHARS:
            return self._script_error("SCRIPT_TOO_LARGE")
        lines = script.splitlines()
        if len(lines) > _MAX_SCRIPT_LINES:
            return self._script_error("SCRIPT_TOO_MANY_LINES")

        interval_ms = 100
        commands: list[tuple[str, list[str]]] = []
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("interval_ms="):
                if not line.removeprefix("interval_ms=").isdigit():
                    return self._script_error("INTERVAL_INVALID")
                interval_ms = int(line.removeprefix("interval_ms="))
                if not 10 <= interval_ms <= 2000:
                    return self._script_error("INTERVAL_INVALID")
                continue
            match = _CANSEND_RE.fullmatch(line)
            if match is None:
                return self._script_error("SCRIPT_COMMAND_INVALID")
            raw_id, raw_payload = match.groups()
            commands.append((raw_id, [raw_payload[i : i + 2] for i in range(0, len(raw_payload), 2)]))

        if not commands:
            return self._script_error("SCRIPT_EMPTY")

        start_timestamp = self._clock_ms()
        attempts = tuple(
            self.process_frame(can_id, data, timestamp=start_timestamp + index * interval_ms)
            for index, (can_id, data) in enumerate(commands)
        )
        ids_status = self._evaluate_ids(attempts, interval_ms)
        return ScriptResult(attempts, ids_status, self.public_state(), interval_ms)

    def process_frame(self, can_id: str, data: list[str], *, timestamp: int | None = None) -> FrameAttempt:
        """Apply the explicit Toy ECU validation order to one decoded frame."""
        normalized_id = self._normalize_can_id(can_id)
        normalized_data = tuple(part.upper() for part in data)
        if normalized_id != _TARGET_CAN_ID:
            return self._record_attempt(normalized_id, normalized_data, "TARGET_ID_MISMATCH", timestamp)
        if len(normalized_data) != 4:
            return self._record_attempt(normalized_id, normalized_data, "LENGTH_INVALID", timestamp)
        if any(_BYTE_RE.fullmatch(part) is None for part in normalized_data):
            return self._record_attempt(normalized_id, normalized_data, "DATA_INVALID", timestamp)

        left, right, counter, checksum = (int(part, 16) for part in normalized_data)
        if checksum != (left ^ right ^ counter ^ 0xA5):
            return self._record_attempt(normalized_id, normalized_data, "CHECKSUM_INVALID", timestamp)
        if counter != ((self._expected_counter + 1) & 0xFF):
            return self._record_attempt(normalized_id, normalized_data, "COUNTER_REJECTED", timestamp)

        self._expected_counter = counter
        self._left_door = "open" if left == 0 else "closed"
        self._right_door = "open" if right == 0 else "closed"
        return self._record_attempt(normalized_id, normalized_data, "EXECUTED", timestamp)

    def _record_attempt(
        self,
        can_id: str,
        data: tuple[str, ...],
        verdict: str,
        timestamp: int | None,
    ) -> FrameAttempt:
        self._attempt_count += 1
        self._last_verdicts.append(verdict)
        self._attempt_sequence += 1
        return FrameAttempt(
            f"{self.session_id}-attempt-{self._attempt_sequence:06d}",
            self._clock_ms() if timestamp is None else timestamp,
            can_id,
            data,
            verdict,
        )

    def _evaluate_ids(self, attempts: tuple[FrameAttempt, ...], interval_ms: int) -> str:
        complete = (
            len(attempts) == 3
            and all(attempt.accepted for attempt in attempts)
            and 80 <= interval_ms <= 120
            and all(attempt.data[:2] == ("00", "01") for attempt in attempts)
        )
        self._completed = complete
        return "NORMAL" if complete else "ALERT"

    def _script_error(self, code: str) -> ScriptResult:
        self._completed = False
        return ScriptResult((), "ALERT", self.public_state(), error=code)

    @staticmethod
    def _normalize_can_id(can_id: str) -> str:
        try:
            return f"0x{int(can_id.lower().removeprefix('0x'), 16):03x}"
        except ValueError:
            return can_id.lower()

    def _capture_frames(self, log: str) -> tuple[FrameAttempt, ...]:
        frames: list[FrameAttempt] = []
        for line in log.splitlines():
            raw_timestamp, _, raw_frame = line.split()
            raw_id, _, payload = raw_frame.partition("#")
            self._capture_sequence += 1
            frames.append(
                FrameAttempt(
                    f"{self.session_id}-capture-{self._capture_sequence:06d}",
                    int(float(raw_timestamp.strip("()")) * 1000),
                    f"0x{raw_id.lower()}",
                    tuple(payload[i : i + 2] for i in range(0, len(payload), 2)),
                    "OBSERVED",
                )
            )
        return tuple(frames)
