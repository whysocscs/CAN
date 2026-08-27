from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict


FlowKind = Literal["local", "observe", "capture", "inject"]
FlowOutcome = Literal["LOCAL", "OBSERVED", "EXECUTED", "REJECTED"]


class FlowTrace(TypedDict):
    """Frontend playback에 전달하는 한 번의 권위 있는 명령 이동 경로."""

    traceId: str
    attemptId: str | None
    sequence: int
    kind: FlowKind
    commandLabel: str
    commandIndex: int | None
    canId: str | None
    data: list[str]
    route: list[str]
    stoppedAt: str | None
    outcome: FlowOutcome
    ecuVerdict: str | None
    idsVerdict: str | None
    effectTarget: str | None
    effectState: str | None
    effectApplied: bool


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
) -> FlowTrace:
    """Python 내부 결과를 camelCase API 계약으로 직렬화한다.

    호출자가 가진 mutable sequence를 그대로 노출하지 않도록 data와 route는 복사한다.
    """
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
