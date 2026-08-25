"""HTTP boundary for the isolated Toy CAN door lab."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import threading
from typing import Any, Final
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.labs.attack_flow_trace import make_flow_trace
from server.labs.door_blackbox import _TARGET_CAN_ID, DoorBlackboxSession, FrameAttempt, ScriptResult, TerminalResult


router = APIRouter(prefix="/labs/door-blackbox", tags=["labs"])
_sessions: dict[str, DoorBlackboxSession] = {}
_active_correlation: tuple[str, int] | None = None

FrameEmitter = Callable[..., Awaitable[bool]]
_LAB_TARGET_CAN_ID: Final = _TARGET_CAN_ID


class _AsyncThreadLock:
    """A process-wide async lock that is safe across ASGI/TestClient loops."""

    def __init__(self) -> None:
        self._lock = threading.Lock()

    async def __aenter__(self) -> _AsyncThreadLock:
        acquire = asyncio.get_running_loop().run_in_executor(None, self._lock.acquire)
        try:
            await asyncio.shield(acquire)
        except asyncio.CancelledError:
            # Never await cleanup in the cancelled task: a second cancellation
            # can interrupt that await while the executor later acquires the
            # threading lock.  The shielded future owns the eventual release.
            def release_late_acquisition(future: asyncio.Future[bool]) -> None:
                if future.cancelled():
                    return
                try:
                    acquired = future.result()
                except BaseException:
                    return
                if acquired:
                    self._lock.release()

            acquire.add_done_callback(release_late_acquisition)
            raise
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._lock.release()


_lifecycle_lock = _AsyncThreadLock()


def get_frame_emitter() -> FrameEmitter:
    """Late import avoids making the pure lab domain depend on the CAN router."""
    from server.routers.can import emit

    return emit


class TerminalRequest(BaseModel):
    command: str = Field(min_length=1, max_length=512)


class ScriptRequest(BaseModel):
    script: str = Field(min_length=1, max_length=4096)


def _session_or_404(session_id: str) -> DoorBlackboxSession:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="lab session not found")
    return session


def _attempt_response(attempt: FrameAttempt) -> dict[str, object]:
    return {
        "attemptId": attempt.attempt_id,
        "timestamp": attempt.timestamp,
        "canId": attempt.can_id,
        "data": list(attempt.data),
        "verdict": attempt.verdict,
    }


def _door_attempt_trace(
    attempt: FrameAttempt,
    *,
    sequence: int,
    command_label: str,
    command_index: int | None,
    ids_status: str | None,
) -> dict[str, object]:
    accepted = attempt.accepted
    route = ["terminal", "obd", "ids", "gateway", "body"]
    if accepted:
        route.append("leftDoor")
    return make_flow_trace(
        trace_id=attempt.attempt_id,
        attempt_id=attempt.attempt_id,
        sequence=sequence,
        kind="inject",
        command_label=command_label,
        command_index=command_index,
        can_id=attempt.can_id,
        data=attempt.data,
        route=route,
        stopped_at=None if accepted else "body",
        outcome="EXECUTED" if accepted else "REJECTED",
        ecu_verdict=attempt.verdict,
        ids_verdict=ids_status,
        effect_target="leftDoor" if accepted else None,
        effect_state=("open" if attempt.data[0] == "00" else "closed") if accepted else None,
        effect_applied=accepted,
    )


def _door_terminal_traces(command: str, result: TerminalResult) -> list[dict[str, object]]:
    normalized_command = command.strip()
    if result.frames and normalized_command.startswith("cansend "):
        return [
            _door_attempt_trace(
                result.frames[0],
                sequence=1,
                command_label=command,
                command_index=None,
                ids_status=result.ids_status,
            )
        ]
    if normalized_command.startswith("cat "):
        kind, route, outcome = "observe", ["terminal", "evidence"], "OBSERVED"
    elif normalized_command.startswith("candump "):
        kind, route, outcome = "observe", ["terminal", "obd", "monitor"], "OBSERVED"
    else:
        kind, route, outcome = "local", ["terminal"], "LOCAL"
    return [
        make_flow_trace(
            trace_id="terminal:" + command,
            attempt_id=None,
            sequence=1,
            kind=kind,
            command_label=command,
            command_index=None,
            can_id=None,
            data=[],
            route=route,
            stopped_at="terminal" if not result.ok else None,
            outcome="REJECTED" if not result.ok else outcome,
            ecu_verdict=None,
            ids_verdict=None,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]


def _door_script_traces(script: str, result: ScriptResult) -> list[dict[str, object]]:
    commands = [
        (line_number, stripped)
        for line_number, line in enumerate(script.splitlines(), start=1)
        if (stripped := line.strip()).startswith("cansend ")
    ]
    if result.attempts:
        return [
            _door_attempt_trace(
                attempt,
                sequence=index + 1,
                command_label=commands[index][1],
                command_index=commands[index][0],
                ids_status=result.ids_status,
            )
            for index, attempt in enumerate(result.attempts)
        ]
    if result.error is None:
        return []
    return [
        make_flow_trace(
            trace_id="script:" + result.error,
            attempt_id=None,
            sequence=1,
            kind="local",
            command_label=script,
            command_index=None,
            can_id=None,
            data=[],
            route=["terminal"],
            stopped_at="terminal",
            outcome="REJECTED",
            ecu_verdict=result.error,
            ids_verdict=None,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]


def _terminal_response(command: str, result: TerminalResult, state: dict[str, object]) -> dict[str, object]:
    return {
        "ok": result.ok,
        "code": result.code,
        "output": result.output,
        "frames": [_attempt_response(frame) for frame in result.frames],
        "state": state,
        "idsStatus": result.ids_status,
        "flowTraces": _door_terminal_traces(command, result),
    }


def _script_response(script: str, result: ScriptResult) -> dict[str, object]:
    return {
        "attempts": [_attempt_response(attempt) for attempt in result.attempts],
        "idsStatus": result.ids_status,
        "state": result.state,
        "error": result.error,
        "flowTraces": _door_script_traces(script, result),
    }


def _metadata_for(session_id: str, attempt: FrameAttempt, ids_status: str) -> dict[str, dict[str, Any]]:
    return {
        "context": {
            "command": "DOOR_LOCK",
            "source": "obd",
            "target": "body",
            "route": ["obd", "ids", "gateway", "body"],
            "meaning": "Toy Body ECU accepted state frame",
            "action": "LEFT_DOOR_OPEN" if attempt.data[0] == "00" else "LEFT_DOOR_CLOSE",
        },
        "processing": {"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
        "monitoring": {"idsObserved": True, "status": ids_status},
        "lab": {
            "labId": "door-blackbox-v1",
            "sessionId": session_id,
            "generation": attempt.generation,
            "attemptId": attempt.attempt_id,
        },
    }


def _clear_lab_replay_state() -> None:
    from server.routers.can import clear_frame_snapshot

    clear_frame_snapshot(_LAB_TARGET_CAN_ID)


def _is_active_attempt(correlation: tuple[str, int], attempt: FrameAttempt) -> bool:
    return _active_correlation == correlation and attempt.generation == correlation[1]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session() -> dict[str, object]:
    global _active_correlation
    async with _lifecycle_lock:
        _clear_lab_replay_state()
        session_id = str(uuid4())
        session = DoorBlackboxSession(session_id=session_id)
        _sessions[session_id] = session
        state = session.public_state()
        _active_correlation = (session_id, int(state["generation"]))
        return state


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, object]:
    async with _lifecycle_lock:
        return _session_or_404(session_id).public_state()


@router.post("/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, object]:
    global _active_correlation
    async with _lifecycle_lock:
        session = _session_or_404(session_id)
        session.reset()
        state = session.public_state()
        # An old browser tab may still call reset, but it must not reactivate
        # its session or clear the current learner's replay state.
        if _active_correlation is not None and _active_correlation[0] == session_id:
            _active_correlation = (session_id, int(state["generation"]))
            # The reset response is the frontend state-reset contract.  Clearing only
            # the Toy door's replay state prevents a reconnect from reapplying an old
            # accepted frame without touching unrelated vehicle CAN snapshots.
            _clear_lab_replay_state()
        return state


@router.post("/sessions/{session_id}/terminal")
async def terminal_command(
    session_id: str,
    request: TerminalRequest,
    emit_frame: FrameEmitter = Depends(get_frame_emitter),
) -> dict[str, object]:
    async with _lifecycle_lock:
        session = _session_or_404(session_id)
        request_correlation = (
            session.session_id,
            int(session.public_state()["generation"]),
        )
        result = session.execute_terminal(request.command)
        response_state = session.public_state()
    # Capture output contains observed frames, not executable frames.  Only the
    # ECU's explicit EXECUTED verdict can reach the shared vehicle event path.
    for attempt in result.frames:
        if attempt.accepted and result.ids_status is not None:
            async with _lifecycle_lock:
                if _is_active_attempt(request_correlation, attempt):
                    await emit_frame(
                        attempt.can_id,
                        list(attempt.data),
                        **_metadata_for(session.session_id, attempt, result.ids_status),
                    )
    return _terminal_response(request.command, result, response_state)


@router.post("/sessions/{session_id}/run")
async def run_script(
    session_id: str,
    request: ScriptRequest,
    emit_frame: FrameEmitter = Depends(get_frame_emitter),
) -> dict[str, object]:
    async with _lifecycle_lock:
        session = _session_or_404(session_id)
        request_correlation = (
            session.session_id,
            int(session.public_state()["generation"]),
        )
        result = session.run_script(request.script)
    emitted = False
    for attempt in result.attempts:
        if not attempt.accepted:
            continue
        if emitted and result.interval_ms is not None:
            await asyncio.sleep(result.interval_ms / 1000)
        async with _lifecycle_lock:
            if not _is_active_attempt(request_correlation, attempt):
                continue
            await emit_frame(
                attempt.can_id,
                list(attempt.data),
                **_metadata_for(session.session_id, attempt, result.ids_status),
            )
            emitted = True
    return _script_response(request.script, result)
