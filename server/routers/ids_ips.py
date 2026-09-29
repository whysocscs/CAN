"""HTTP boundary for the isolated IDS/IPS virtual-shell labs."""

from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server.labs.ids_ips import IdsIpsSession, SCENARIOS, create_session

router = APIRouter(prefix="/labs/ids-ips", tags=["labs"])
_sessions: dict[str, OrderedDict[str, IdsIpsSession]] = {name: OrderedDict() for name in SCENARIOS}


class TerminalRequest(BaseModel):
    command: str = Field(min_length=1, max_length=512)


def _session(scenario: str, session_id: str) -> IdsIpsSession:
    if scenario not in SCENARIOS:
        raise HTTPException(404, "IDS/IPS scenario not found")
    session = _sessions[scenario].get(session_id)
    if session is None:
        raise HTTPException(404, "IDS/IPS session not found")
    return session


@router.post("/{scenario}/sessions", status_code=201)
async def new_session(scenario: str) -> dict[str, object]:
    try:
        session = create_session(scenario)
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    sessions = _sessions[scenario]
    sessions[session.session_id] = session
    while len(sessions) > 128:
        sessions.popitem(last=False)
    return session.public_state()


@router.post("/{scenario}/sessions/{session_id}/terminal")
async def terminal(scenario: str, session_id: str, request: TerminalRequest) -> dict[str, Any]:
    session = _session(scenario, session_id)
    ok, output, frame = session.execute(request.command)
    if ok and frame is not None:
        can_id, data = frame
        from server.routers.can import publish_virtual_event

        target = "body" if can_id.upper() == "101" else "rear"
        await publish_virtual_event(
            can_id, data,
            context={"command": "DOOR_LOCK" if target == "body" else "TRUNK_OPEN", "source": "obd", "target": target, "route": ["obd", "ids", "gateway", target], "meaning": "IDS/IPS lab accepted frame", "action": "DOOR_OPEN" if target == "body" else "TRUNK_OPEN"},
            processing={"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
            monitoring={"idsObserved": True, "status": "NORMAL"},
            lab={"labId": "ids-ips-v1", "scenario": scenario, "sessionId": session_id, "stage": "terminal"},
        )
    return {"ok": ok, "output": output, "frame": frame, "state": session.public_state()}
