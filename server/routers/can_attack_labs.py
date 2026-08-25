"""FastAPI boundary for isolated spoofing and replay beginner labs."""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Awaitable, Callable
import threading
from typing import Any, Final
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.labs.can_attack_basics import (
    BeginnerCanAttackSession,
    CaptureRecord,
    FrameAttempt,
    SCENARIO_SPECS,
    ScriptResult,
    TerminalResult,
)
from server.labs.attack_flow_trace import make_flow_trace


router = APIRouter(prefix="/labs/can-attacks", tags=["labs"])
_MAX_SESSIONS_PER_SCENARIO: Final = 128
_sessions: dict[str, OrderedDict[str, BeginnerCanAttackSession]] = {
    "spoofing": OrderedDict(),
    "replay": OrderedDict(),
}
_active_correlations: dict[str, tuple[str, int]] = {}

VirtualEventPublisher = Callable[..., Awaitable[bool]]


class _AsyncThreadLock:
    """A process-wide async lock usable by multiple TestClient event loops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()

    async def __aenter__(self) -> _AsyncThreadLock:
        acquisition = asyncio.get_running_loop().run_in_executor(None, self._lock.acquire)
        try:
            await asyncio.shield(acquisition)
        except asyncio.CancelledError:
            def release_late(future: asyncio.Future[bool]) -> None:
                if future.cancelled():
                    return
                try:
                    acquired = future.result()
                except BaseException:
                    return
                if acquired:
                    self._lock.release()

            acquisition.add_done_callback(release_late)
            raise
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._lock.release()


_lifecycle_lock = _AsyncThreadLock()


class TerminalRequest(BaseModel):
    command: str = Field(min_length=1, max_length=512)


class ScriptRequest(BaseModel):
    script: str = Field(min_length=1, max_length=4096)


def get_virtual_event_publisher() -> VirtualEventPublisher:
    from server.routers.can import publish_virtual_event

    return publish_virtual_event


def _validated_scenario(scenario: str) -> str:
    if scenario not in SCENARIO_SPECS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="lab scenario not found")
    return scenario


def _session_or_404(scenario: str, session_id: str) -> BeginnerCanAttackSession:
    scenario = _validated_scenario(scenario)
    session = _sessions[scenario].get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="lab session not found")
    return session


def _clear_scenario_snapshot(scenario: str) -> None:
    from server.routers.can import clear_frame_snapshot

    clear_frame_snapshot(SCENARIO_SPECS[scenario].target_can_id)


def _attempt_response(attempt: FrameAttempt) -> dict[str, object]:
    return {
        "attemptId": attempt.attempt_id,
        "timestamp": attempt.timestamp,
        "sessionId": attempt.session_id,
        "generation": attempt.generation,
        "canId": attempt.can_id,
        "data": list(attempt.data),
        "verdict": attempt.verdict,
    }


def _capture_response(capture: CaptureRecord) -> dict[str, object]:
    return {
        "captureId": capture.capture_id,
        "timestamp": capture.timestamp,
        "sessionId": capture.session_id,
        "generation": capture.generation,
        "fileName": capture.file_name,
        "canId": capture.can_id,
        "data": list(capture.data),
        "verdict": capture.verdict,
    }


def _attempt_trace(
    scenario: str,
    command_label: str,
    attempt: FrameAttempt,
    sequence: int,
    ids_status: str | None,
) -> dict[str, object]:
    spec = SCENARIO_SPECS[scenario]
    accepted = attempt.accepted
    route = ["terminal", *spec.route]
    if accepted:
        route.append(spec.effect_target)
    return make_flow_trace(
        trace_id=attempt.attempt_id,
        attempt_id=attempt.attempt_id,
        sequence=sequence,
        kind="inject",
        command_label=command_label,
        command_index=1,
        can_id=attempt.can_id,
        data=attempt.data,
        route=route,
        stopped_at=None if accepted else spec.target_node,
        outcome="EXECUTED" if accepted else "REJECTED",
        ecu_verdict=attempt.verdict,
        ids_verdict=ids_status,
        effect_target=spec.effect_target if accepted else None,
        effect_state="open" if accepted else None,
        effect_applied=accepted,
    )


def _beginner_result_traces(
    scenario: str,
    command_label: str,
    result: TerminalResult | ScriptResult,
) -> list[dict[str, object]]:
    if result.attempts:
        return [
            _attempt_trace(
                scenario,
                command_label,
                attempt,
                index + 1,
                result.ids_status,
            )
            for index, attempt in enumerate(result.attempts)
        ]

    capture = result.captures[0] if result.captures else None
    if command_label.startswith("cat "):
        kind, route = "observe", ["terminal", "evidence"]
    elif command_label.startswith("candump "):
        kind = "capture" if ">" in command_label else "observe"
        route = ["terminal", "obd", "monitor"]
    elif not result.ok:
        return [
            make_flow_trace(
                trace_id="result:" + result.code,
                attempt_id=None,
                sequence=1,
                kind="local",
                command_label=command_label,
                command_index=None,
                can_id=None,
                data=[],
                route=["terminal"],
                stopped_at="terminal",
                outcome="REJECTED",
                ecu_verdict=result.code,
                ids_verdict=result.ids_status,
                effect_target=None,
                effect_state=None,
                effect_applied=False,
            )
        ]
    else:
        kind, route = "local", ["terminal"]

    return [
        make_flow_trace(
            trace_id=capture.capture_id if capture else "result:" + result.code,
            attempt_id=None,
            sequence=1,
            kind=kind,
            command_label=command_label,
            command_index=None,
            can_id=capture.can_id if capture else None,
            data=capture.data if capture else (),
            route=route,
            stopped_at=None,
            outcome="LOCAL" if kind == "local" else "OBSERVED",
            ecu_verdict=None,
            ids_verdict=result.ids_status,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]


def _result_response(
    scenario: str,
    command_label: str,
    result: TerminalResult | ScriptResult,
) -> dict[str, object]:
    return {
        "ok": result.ok,
        "code": result.code,
        "output": result.output,
        "attempts": [_attempt_response(attempt) for attempt in result.attempts],
        "captures": [_capture_response(capture) for capture in result.captures],
        "state": result.state,
        "idsStatus": result.ids_status,
        "flowTraces": _beginner_result_traces(
            scenario,
            command_label,
            result,
        ),
    }


def _metadata_for(scenario: str, attempt: FrameAttempt) -> dict[str, dict[str, Any]]:
    spec = SCENARIO_SPECS[scenario]
    return {
        "context": {
            "command": spec.command,
            "source": spec.source,
            "target": spec.target_node,
            "route": list(spec.route),
            "action": spec.action,
        },
        "processing": {"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
        "monitoring": {"idsObserved": True, "status": "NORMAL"},
        "lab": {
            "labId": spec.lab_id,
            "scenario": spec.scenario,
            "sessionId": attempt.session_id,
            "generation": attempt.generation,
            "attemptId": attempt.attempt_id,
            "stage": "impact",
        },
    }


async def _emit_if_active(
    scenario: str,
    correlation: tuple[str, int],
    attempt: FrameAttempt,
    publish_event: VirtualEventPublisher,
) -> bool:
    """Recheck exact request ownership immediately before event publication."""
    async with _lifecycle_lock:
        if (
            _active_correlations.get(scenario) != correlation
            or attempt.session_id != correlation[0]
            or attempt.generation != correlation[1]
            or not attempt.accepted
        ):
            return False
        return await publish_event(
            attempt.can_id,
            list(attempt.data),
            **_metadata_for(scenario, attempt),
        )


@router.post("/{scenario}/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(scenario: str) -> dict[str, object]:
    scenario = _validated_scenario(scenario)
    async with _lifecycle_lock:
        _clear_scenario_snapshot(scenario)
        session_id = str(uuid4())
        session = BeginnerCanAttackSession(scenario=scenario, session_id=session_id)
        scenario_sessions = _sessions[scenario]
        scenario_sessions[session_id] = session
        while len(scenario_sessions) > _MAX_SESSIONS_PER_SCENARIO:
            scenario_sessions.popitem(last=False)
        state = session.public_state()
        _active_correlations[scenario] = (session_id, int(state["generation"]))
        return state


@router.get("/{scenario}/sessions/{session_id}")
async def get_session(scenario: str, session_id: str) -> dict[str, object]:
    async with _lifecycle_lock:
        return _session_or_404(scenario, session_id).public_state()


@router.post("/{scenario}/sessions/{session_id}/reset")
async def reset_session(scenario: str, session_id: str) -> dict[str, object]:
    scenario = _validated_scenario(scenario)
    async with _lifecycle_lock:
        session = _session_or_404(scenario, session_id)
        state = session.reset()
        current = _active_correlations.get(scenario)
        if current is not None and current[0] == session_id:
            _active_correlations[scenario] = (session_id, int(state["generation"]))
            _clear_scenario_snapshot(scenario)
        return state


@router.post("/{scenario}/sessions/{session_id}/terminal")
async def terminal_command(
    scenario: str,
    session_id: str,
    request: TerminalRequest,
    publish_event: VirtualEventPublisher = Depends(get_virtual_event_publisher),
) -> dict[str, object]:
    scenario = _validated_scenario(scenario)
    async with _lifecycle_lock:
        session = _session_or_404(scenario, session_id)
        correlation = (session.session_id, int(session.public_state()["generation"]))
        result = session.execute_terminal(request.command)
    for attempt in result.attempts:
        if attempt.accepted:
            await _emit_if_active(scenario, correlation, attempt, publish_event)
    return _result_response(scenario, request.command, result)

@router.post("/{scenario}/sessions/{session_id}/run")
async def run_script(
    scenario: str,
    session_id: str,
    request: ScriptRequest,
    publish_event: VirtualEventPublisher = Depends(get_virtual_event_publisher),
) -> dict[str, object]:
    scenario = _validated_scenario(scenario)
    async with _lifecycle_lock:
        session = _session_or_404(scenario, session_id)
        correlation = (session.session_id, int(session.public_state()["generation"]))
        result = session.run_script(request.script)
    for attempt in result.attempts:
        if attempt.accepted:
            await _emit_if_active(scenario, correlation, attempt, publish_event)
    return _result_response(scenario, request.script, result)
