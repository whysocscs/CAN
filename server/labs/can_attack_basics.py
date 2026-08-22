"""Pure, framework-free domain for two safe beginner CAN attack labs.

The terminal below is a fixed interpreter over in-memory strings.  It never
opens a host file, starts a process, or forwards learner input to a shell.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
import re
import time
from types import MappingProxyType
from typing import Final, Literal
from uuid import uuid4


ScenarioName = Literal["spoofing", "replay"]

_MAX_COMMAND_CHARS: Final = 512
_MAX_SCRIPT_CHARS: Final = 4096
_MAX_SCRIPT_LINES: Final = 20
_CANSEND_RE: Final = re.compile(
    r"^cansend vcan0 ([0-9A-Fa-f]{1,3})#([0-9A-Fa-f]{2,16})$"
)
_CANPLAYER_RE: Final = re.compile(
    r"^canplayer -I ([A-Za-z0-9_.-]{1,64}) -l ([0-9]+)$"
)
_UNSAFE_TOKEN_RE: Final = re.compile(r"(?:[;&|`]|\$\(|\r|\n)")
_HOST_PATH_RE: Final = re.compile(r"(?:^|\s)(?:[A-Za-z]:|/|\\|\.\.?[/\\])")

_NORMAL_SPOOFING_FRAME: Final = "(1721000000.100000) vcan0 5A1#00"
_REPLAY_CAPTURE_LINE: Final = "(1721000100.100000) vcan0 5A2#0001"
_MESSAGE_MAP: Final = (
    "Toy Rear ECU message map\n"
    "0x5A1 byte0: 00=tailgate closed, 01=tailgate open"
)
_NORMAL_IDS_EXPLANATION: Final = (
    "Toy IDS status NORMAL: this lab models a limited Toy allowlist/freshness gap; "
    "it is not a real IDS bypass."
)


@dataclass(frozen=True, slots=True)
class ScenarioSpec:
    scenario: ScenarioName
    lab_id: str
    target_can_id: str
    success_payload: tuple[str, ...] | None
    captured_payload: tuple[str, ...] | None
    target_label: str
    target_node: str
    effect_target: str
    command: str
    source: str
    route: tuple[str, ...]
    action: str


SCENARIO_SPECS: Final[Mapping[str, ScenarioSpec]] = MappingProxyType(
    {
        "spoofing": ScenarioSpec(
            scenario="spoofing",
            lab_id="can-spoofing-basic-v1",
            target_can_id="0x5A1",
            success_payload=("01",),
            captured_payload=None,
            target_label="Toy Rear ECU",
            target_node="rear",
            effect_target="tailgate",
            command="TRUNK_OPEN",
            source="obd",
            route=("obd", "ids", "gateway", "rear"),
            action="TAILGATE_OPEN",
        ),
        "replay": ScenarioSpec(
            scenario="replay",
            lab_id="can-replay-basic-v1",
            target_can_id="0x5A2",
            success_payload=None,
            captured_payload=("00", "01"),
            target_label="Toy Body ECU",
            target_node="body",
            effect_target="leftDoor",
            command="DOOR_LOCK",
            source="obd",
            route=("obd", "ids", "gateway", "body"),
            action="LEFT_DOOR_OPEN",
        ),
    }
)


@dataclass(frozen=True, slots=True)
class FrameAttempt:
    attempt_id: str
    timestamp: int
    session_id: str
    generation: int
    can_id: str
    data: tuple[str, ...]
    verdict: str

    @property
    def accepted(self) -> bool:
        return self.verdict == "EXECUTED"


@dataclass(frozen=True, slots=True)
class CaptureRecord:
    capture_id: str
    timestamp: int
    session_id: str
    generation: int
    file_name: str
    can_id: str
    data: tuple[str, ...]
    verdict: str = "CAPTURED"


@dataclass(frozen=True, slots=True)
class TerminalResult:
    ok: bool
    code: str
    output: str
    attempts: tuple[FrameAttempt, ...]
    captures: tuple[CaptureRecord, ...]
    state: dict[str, object]
    ids_status: str | None = None


@dataclass(frozen=True, slots=True)
class ScriptResult:
    ok: bool
    code: str
    output: str
    attempts: tuple[FrameAttempt, ...]
    captures: tuple[CaptureRecord, ...]
    state: dict[str, object]
    ids_status: str | None = None


class BeginnerCanAttackSession:
    """Stateful Toy ECU lab with a deliberately tiny virtual command grammar."""

    def __init__(
        self,
        *,
        scenario: str,
        session_id: str,
        clock_ms: Callable[[], int] | None = None,
    ) -> None:
        try:
            self.spec = SCENARIO_SPECS[scenario]
        except KeyError as exc:
            raise ValueError(f"unsupported scenario: {scenario}") from exc
        self.session_id = session_id
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._generation = -1
        self._capture_files: dict[str, CaptureRecord] = {}
        self.reset()

    def reset(self) -> dict[str, object]:
        self._generation += 1
        self._stage = "RECON"
        self._left_door = "closed"
        self._right_door = "closed"
        self._tailgate = "closed"
        self._evidence: list[dict[str, str]] = []
        self._attempt_count = 0
        self._last_verdict: str | None = None
        self._completed = False
        self._capture_files.clear()
        return self.public_state()

    def public_state(self) -> dict[str, object]:
        return {
            "labId": self.spec.lab_id,
            "scenario": self.spec.scenario,
            "sessionId": self.session_id,
            "generation": self._generation,
            "stage": self._stage,
            "targetLabel": self.spec.target_label,
            "targetNode": self.spec.target_node,
            "effectTarget": self.spec.effect_target,
            "vehicleState": {
                "leftDoor": self._left_door,
                "rightDoor": self._right_door,
                "tailgate": self._tailgate,
            },
            "evidence": [dict(item) for item in self._evidence],
            "attemptCount": self._attempt_count,
            "lastVerdict": self._last_verdict,
            "completed": self._completed,
        }

    def execute_terminal(self, command: str) -> TerminalResult:
        if len(command) > _MAX_COMMAND_CHARS:
            return self._terminal_error("COMMAND_TOO_LARGE", "command exceeds 512 characters")
        if command != command.strip() or not command:
            return self._terminal_error("COMMAND_REJECTED", "restricted lab shell: exact command required")

        fixed_outputs = {"pwd": "/lab", "whoami": "learner"}
        if command in fixed_outputs:
            return self._terminal_ok("OK", fixed_outputs[command])
        if command == "ls":
            files = ["message-map.txt"] if self.spec.scenario == "spoofing" else []
            if "capture.log" in self._capture_files:
                files.append("capture.log")
            return self._terminal_ok("OK", "\n".join(files))

        if command == "candump -L vcan0 > capture.log":
            if self.spec.scenario != "replay":
                return self._terminal_error(
                    "SCENARIO_COMMAND_UNSUPPORTED",
                    "capture redirection is available only in the replay lab",
                )
            capture = CaptureRecord(
                capture_id=str(uuid4()),
                timestamp=self._clock_ms(),
                session_id=self.session_id,
                generation=self._generation,
                file_name="capture.log",
                can_id=self.spec.target_can_id,
                data=self.spec.captured_payload or (),
            )
            self._capture_files["capture.log"] = capture
            self._stage = "CAPTURE"
            self._last_verdict = "CAPTURED"
            self._evidence.append({"kind": "capture", "status": "recorded"})
            return self._terminal_ok(
                "CAPTURED",
                "captured one virtual CAN frame to capture.log",
                captures=(capture,),
            )

        if _UNSAFE_TOKEN_RE.search(command):
            return self._terminal_error("UNSAFE_SYNTAX", "shell metacharacters are not allowed")
        if _HOST_PATH_RE.search(command):
            return self._terminal_error("HOST_PATH_REJECTED", "host paths are not available")

        if command == "candump -L vcan0":
            self._stage = "OBSERVE"
            output = (
                _NORMAL_SPOOFING_FRAME
                if self.spec.scenario == "spoofing"
                else _REPLAY_CAPTURE_LINE
            )
            return self._terminal_ok("OBSERVED", output)

        if command == "cat message-map.txt":
            if self.spec.scenario != "spoofing":
                return self._terminal_error("FILE_NOT_FOUND", "virtual file not found")
            self._stage = "CRAFT"
            return self._terminal_ok("OBSERVED", _MESSAGE_MAP)
        if command == "cat capture.log":
            capture = self._capture_files.get("capture.log")
            if capture is None:
                return self._terminal_error("FILE_NOT_FOUND", "virtual file not found")
            self._stage = "EXECUTE"
            return self._terminal_ok("OBSERVED", _REPLAY_CAPTURE_LINE, captures=(capture,))
        if command.startswith("cat "):
            return self._terminal_error("COMMAND_REJECTED", "unknown virtual file")

        cansend = _CANSEND_RE.fullmatch(command)
        if cansend is not None:
            if self.spec.scenario != "spoofing":
                return self._terminal_error(
                    "SCENARIO_COMMAND_UNSUPPORTED",
                    "cansend is not the replay lab's final action",
                )
            raw_id, raw_payload = cansend.groups()
            data = tuple(
                raw_payload[index : index + 2].upper()
                for index in range(0, len(raw_payload), 2)
            )
            return self._spoofing_attempt(self._normalize_can_id(raw_id), data)
        if command.startswith("cansend "):
            return self._terminal_error("COMMAND_REJECTED", "malformed cansend command")

        canplayer = _CANPLAYER_RE.fullmatch(command)
        if canplayer is not None:
            if self.spec.scenario != "replay":
                return self._terminal_error(
                    "SCENARIO_COMMAND_UNSUPPORTED",
                    "canplayer is not the spoofing lab's final action",
                )
            file_name, raw_repeat = canplayer.groups()
            return self._replay_attempt(file_name, raw_repeat)
        if command.startswith("canplayer "):
            return self._terminal_error("COMMAND_REJECTED", "malformed canplayer command")

        return self._terminal_error(
            "COMMAND_REJECTED",
            "restricted lab shell: command is not allowed",
        )

    def run_script(self, script: str) -> ScriptResult:
        if len(script) > _MAX_SCRIPT_CHARS:
            return self._script_error("SCRIPT_TOO_LARGE", "script exceeds 4096 characters")
        lines = script.splitlines()
        if len(lines) > _MAX_SCRIPT_LINES:
            return self._script_error("SCRIPT_TOO_MANY_LINES", "script exceeds 20 lines")

        actions: list[str] = []
        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if self.spec.scenario == "spoofing" and _CANSEND_RE.fullmatch(line):
                actions.append(line)
                continue
            if self.spec.scenario == "replay" and _CANPLAYER_RE.fullmatch(line):
                actions.append(line)
                continue
            return self._script_error(
                "SCRIPT_COMMAND_INVALID",
                "scripts allow comments and one scenario final action only",
            )
        if len(actions) != 1:
            code = "SCRIPT_EMPTY" if not actions else "SCRIPT_ACTION_COUNT_INVALID"
            return self._script_error(code, "script requires exactly one final action")

        terminal = self.execute_terminal(actions[0])
        return ScriptResult(
            terminal.ok,
            terminal.code,
            terminal.output,
            terminal.attempts,
            terminal.captures,
            terminal.state,
            terminal.ids_status,
        )

    def _spoofing_attempt(self, can_id: str, data: tuple[str, ...]) -> TerminalResult:
        if can_id != self.spec.target_can_id:
            verdict = "TARGET_ID_MISMATCH"
        elif len(data) != 1:
            verdict = "LENGTH_INVALID"
        elif data[0] not in ("00", "01"):
            verdict = "STATE_INVALID"
        elif data != self.spec.success_payload:
            verdict = "STATE_NOT_ALTERED"
        else:
            verdict = "EXECUTED"
        attempt = self._record_attempt(can_id, data, verdict)
        if attempt.accepted:
            self._tailgate = "open"
            self._completed = True
            self._stage = "EVIDENCE"
            return self._terminal_ok(
                verdict,
                _NORMAL_IDS_EXPLANATION,
                attempts=(attempt,),
                ids_status="NORMAL",
            )
        self._stage = "CRAFT"
        return self._terminal_error(
            verdict,
            f"Toy ECU rejected spoofing attempt: {verdict}",
            attempts=(attempt,),
            ids_status="ALERT",
        )

    def _replay_attempt(self, file_name: str, raw_repeat_count: str) -> TerminalResult:
        capture = self._capture_files.get(file_name)
        if capture is None:
            verdict = "CAPTURE_REQUIRED" if file_name == "capture.log" else "CAPTURE_FILE_UNKNOWN"
            data: tuple[str, ...] = ()
        else:
            data = capture.data
            if raw_repeat_count != "1":
                verdict = "REPEAT_COUNT_INVALID"
            elif capture.session_id != self.session_id:
                verdict = "CAPTURE_SESSION_MISMATCH"
            elif capture.generation != self._generation:
                verdict = "CAPTURE_GENERATION_MISMATCH"
            elif capture.can_id != self.spec.target_can_id or capture.data != self.spec.captured_payload:
                verdict = "CAPTURE_CONTENT_MISMATCH"
            else:
                verdict = "EXECUTED"
        attempt = self._record_attempt(self.spec.target_can_id, data, verdict)
        if attempt.accepted:
            self._left_door = "open"
            self._right_door = "closed"
            self._completed = True
            self._stage = "EVIDENCE"
            return self._terminal_ok(
                verdict,
                _NORMAL_IDS_EXPLANATION,
                attempts=(attempt,),
                ids_status="NORMAL",
            )
        self._stage = "EXECUTE" if capture is not None else "CAPTURE"
        return self._terminal_error(
            verdict,
            f"Toy ECU rejected replay attempt: {verdict}",
            attempts=(attempt,),
            ids_status="ALERT",
        )

    def _record_attempt(
        self,
        can_id: str,
        data: tuple[str, ...],
        verdict: str,
    ) -> FrameAttempt:
        self._attempt_count += 1
        self._last_verdict = verdict
        self._evidence.append({"kind": "attempt", "status": verdict})
        return FrameAttempt(
            attempt_id=str(uuid4()),
            timestamp=self._clock_ms(),
            session_id=self.session_id,
            generation=self._generation,
            can_id=can_id,
            data=data,
            verdict=verdict,
        )

    def _terminal_ok(
        self,
        code: str,
        output: str,
        *,
        attempts: tuple[FrameAttempt, ...] = (),
        captures: tuple[CaptureRecord, ...] = (),
        ids_status: str | None = None,
    ) -> TerminalResult:
        return TerminalResult(
            True,
            code,
            output,
            attempts,
            captures,
            self.public_state(),
            ids_status,
        )

    def _terminal_error(
        self,
        code: str,
        output: str,
        *,
        attempts: tuple[FrameAttempt, ...] = (),
        ids_status: str | None = None,
    ) -> TerminalResult:
        return TerminalResult(
            False,
            code,
            output,
            attempts,
            (),
            self.public_state(),
            ids_status,
        )

    def _script_error(self, code: str, output: str) -> ScriptResult:
        return ScriptResult(False, code, output, (), (), self.public_state(), None)

    @staticmethod
    def _normalize_can_id(can_id: str) -> str:
        return f"0x{int(can_id, 16):03X}"
