"""HTTP boundary for the isolated Toy CAN door lab."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Final
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.labs.door_blackbox import _TARGET_CAN_ID, DoorBlackboxSession, FrameAttempt, ScriptResult, TerminalResult


router = APIRouter(prefix="/labs/door-blackbox", tags=["labs"])
_sessions: dict[str, DoorBlackboxSession] = {}

FrameEmitter = Callable[..., Awaitable[bool]]
_LAB_TARGET_CAN_ID: Final = _TARGET_CAN_ID


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


def _terminal_response(result: TerminalResult) -> dict[str, object]:
    return {
        "ok": result.ok,
        "code": result.code,
        "output": result.output,
        "frames": [_attempt_response(frame) for frame in result.frames],
    }


def _script_response(result: ScriptResult) -> dict[str, object]:
    return {
        "attempts": [_attempt_response(attempt) for attempt in result.attempts],
        "idsStatus": result.ids_status,
        "state": result.state,
        "error": result.error,
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
        },
    }


def _clear_lab_replay_state() -> None:
    from server.routers.can import clear_frame_snapshot

    clear_frame_snapshot(_LAB_TARGET_CAN_ID)


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session() -> dict[str, object]:
    _clear_lab_replay_state()
    session_id = str(uuid4())
    session = DoorBlackboxSession(session_id=session_id)
    _sessions[session_id] = session
    return session.public_state()


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, object]:
    return _session_or_404(session_id).public_state()


@router.post("/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, object]:
    session = _session_or_404(session_id)
    session.reset()
    # The reset response is the frontend state-reset contract.  Clearing only
    # the Toy door's replay state prevents a reconnect from reapplying an old
    # accepted frame without touching unrelated vehicle CAN snapshots.
    _clear_lab_replay_state()
    return session.public_state()


@router.post("/sessions/{session_id}/terminal")
async def terminal_command(
    session_id: str,
    request: TerminalRequest,
    emit_frame: FrameEmitter = Depends(get_frame_emitter),
) -> dict[str, object]:
    session = _session_or_404(session_id)
    result = session.execute_terminal(request.command)
    # Capture output contains observed frames, not executable frames.  Only the
    # ECU's explicit EXECUTED verdict can reach the shared vehicle event path.
    for attempt in result.frames:
        if attempt.accepted:
            await emit_frame(attempt.can_id, list(attempt.data), **_metadata_for(session.session_id, attempt, "ALERT"))
    return _terminal_response(result)


@router.post("/sessions/{session_id}/run")
async def run_script(
    session_id: str,
    request: ScriptRequest,
    emit_frame: FrameEmitter = Depends(get_frame_emitter),
) -> dict[str, object]:
    session = _session_or_404(session_id)
    result = session.run_script(request.script)
    emitted = False
    for attempt in result.attempts:
        if not attempt.accepted:
            continue
        if emitted and result.interval_ms is not None:
            await asyncio.sleep(result.interval_ms / 1000)
        await emit_frame(attempt.can_id, list(attempt.data), **_metadata_for(session.session_id, attempt, result.ids_status))
        emitted = True
    return _script_response(result)
