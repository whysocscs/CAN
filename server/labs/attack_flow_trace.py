from __future__ import annotations

from collections.abc import Sequence
from typing import Literal


FlowKind = Literal["local", "observe", "capture", "inject"]
FlowOutcome = Literal["LOCAL", "OBSERVED", "EXECUTED", "REJECTED"]


def make_flow_trace(
    *,
    trace_id: str,
    attempt_id: str | None,
    sequence: int,
    kind: FlowKind,
    command_label: str,
    command_index: int | None,
    can_id: str | None,
    data: Sequence[str],
    route: Sequence[str],
    stopped_at: str | None,
    outcome: FlowOutcome,
    ecu_verdict: str | None,
    ids_verdict: str | None,
    effect_target: str | None,
    effect_state: str | None,
    effect_applied: bool,
) -> dict[str, object]:
    return {
        "traceId": trace_id,
        "attemptId": attempt_id,
        "sequence": sequence,
        "kind": kind,
        "commandLabel": command_label,
        "commandIndex": command_index,
        "canId": can_id,
        "data": list(data),
        "route": list(route),
        "stoppedAt": stopped_at,
        "outcome": outcome,
        "ecuVerdict": ecu_verdict,
        "idsVerdict": ids_verdict,
        "effectTarget": effect_target,
        "effectState": effect_state,
        "effectApplied": effect_applied,
    }
