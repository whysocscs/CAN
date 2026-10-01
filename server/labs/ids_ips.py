"""Safe, in-memory IDS/IPS lab domain.

This is deliberately a fixed command interpreter, not a system shell.  Each
scenario demonstrates a different deterministic Toy IDS policy.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from uuid import uuid4

SCENARIOS = frozenset({"rule-based", "period-based", "counter-status"})
_CANSEND = re.compile(r"^cansend vcan0 ([0-9A-Fa-f]{1,3})#([0-9A-Fa-f]{2,16})$")


@dataclass
class IdsIpsSession:
    scenario: str
    session_id: str
    command_count: int = 0
    last_frame: str | None = None

    def public_state(self) -> dict[str, object]:
        return {"sessionId": self.session_id, "scenario": self.scenario}

    def execute(self, command: str) -> tuple[bool, str, tuple[str, list[str]] | None]:
        if command != command.strip() or not command or len(command) > 512:
            return False, "restricted lab shell: exact command required", None
        if command == "ls":
            return True, "baseline.log\nids-policy.txt", None
        if command == "pwd":
            return True, "/lab", None
        if command == "candump -L vcan0":
            return True, "(1721000000.100000) vcan0 101#00", None
        match = _CANSEND.fullmatch(command)
        if not match:
            return False, "restricted lab shell: allowed commands are ls, pwd, candump -L vcan0, and documented cansend frames", None

        can_id, payload = match.groups()
        normalized = f"{can_id.upper()}#{payload.upper()}"
        self.command_count += 1
        if self.scenario == "rule-based" and can_id.upper() not in {"101", "200"}:
            return False, f"IPS BLOCKED: unknown CAN ID {can_id.upper()} (RULE_UNKNOWN_ID)", None
        if self.scenario == "period-based" and self.last_frame == normalized:
            return False, "IPS BLOCKED: repeated frame period is below the Toy baseline (PERIOD_ANOMALY)", None
        if self.scenario == "counter-status" and len(payload) >= 4 and payload[-2:] == "FF":
            return False, "IPS BLOCKED: invalid counter/status value (COUNTER_STATUS_INVALID)", None

        self.last_frame = normalized
        return True, f"IDS NORMAL: accepted vcan0 {normalized}", (can_id, [payload[index:index + 2] for index in range(0, len(payload), 2)])


def create_session(scenario: str) -> IdsIpsSession:
    if scenario not in SCENARIOS:
        raise ValueError("unsupported IDS/IPS scenario")
    return IdsIpsSession(scenario=scenario, session_id=str(uuid4()))
