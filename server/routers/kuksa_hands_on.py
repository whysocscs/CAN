"""Local-only, restricted commands for the actual KUKSA door-signal experiment."""

import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from server.labs.kuksa_hands_on import (
    KuksaSessionConflict,
    KuksaSessionManager,
    KuksaSessionUnavailable,
)


router = APIRouter(prefix="/labs/repro/kuksa", tags=["cve-reproduction"])
manager = KuksaSessionManager()


class StartBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    variant: Literal["vulnerable", "patched"]


class CommandBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    revision: int = Field(ge=0)
    action: Literal["metadata", "read", "register"]
    providerRole: Literal["read", "provide"] | None = None
    providedOpen: bool | None = None

    @model_validator(mode="after")
    def require_register_fields_only_for_registration(self):
        if self.action == "register":
            if self.providerRole is None or self.providedOpen is None:
                raise ValueError("register requires providerRole and providedOpen")
        elif {"providerRole", "providedOpen"} & self.model_fields_set:
            raise ValueError("only register accepts providerRole and providedOpen")
        return self

    def session_command(self) -> dict[str, object]:
        command: dict[str, object] = {"action": self.action}
        if self.action == "register":
            command["providerRole"] = self.providerRole
            command["providedOpen"] = self.providedOpen
        return command


class ResetBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    revision: int = Field(ge=0)


def _require_local(request: Request) -> None:
    if request.client is None or request.client.host not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "KUKSA 실습은 이 컴퓨터의 브라우저에서만 사용할 수 있습니다.")


def _handle_session_error(exc: Exception) -> None:
    if isinstance(exc, KuksaSessionConflict):
        raise HTTPException(409, str(exc)) from exc
    raise HTTPException(
        503, "KUKSA 실습 프로세스에 연결할 수 없습니다. 고정 빌드와 서버 로그를 확인하세요.",
    ) from exc


@router.post("/session", status_code=201)
def start_kuksa_session(body: StartBody, request: Request) -> dict[str, object]:
    _require_local(request)
    root = os.environ.get("CANLITE_KUKSA_REPRO_ROOT")
    if not root:
        raise HTTPException(503, "CANLITE_KUKSA_REPRO_ROOT 설정 후 서버를 다시 시작하세요.")
    try:
        return manager.start(
            root=root,
            distro=os.environ.get("CANLITE_KUKSA_WSL_DISTRO", "Ubuntu-22.04"),
            variant=body.variant,
        )
    except (KuksaSessionConflict, KuksaSessionUnavailable, ValueError) as exc:
        _handle_session_error(exc)


@router.post("/session/{session_id}/command")
def run_kuksa_command(session_id: str, body: CommandBody, request: Request) -> dict[str, object]:
    _require_local(request)
    try:
        state, event = manager.execute(
            session_id=session_id, revision=body.revision, command=body.session_command(),
        )
        return {"session": state, "event": event, "evidenceKind": "actual_process"}
    except (KuksaSessionConflict, KuksaSessionUnavailable, ValueError) as exc:
        _handle_session_error(exc)


@router.post("/session/{session_id}/reset")
def reset_kuksa_session(session_id: str, body: ResetBody, request: Request) -> dict[str, bool]:
    _require_local(request)
    try:
        manager.close(session_id=session_id, revision=body.revision)
        return {"closed": True}
    except (KuksaSessionConflict, KuksaSessionUnavailable) as exc:
        _handle_session_error(exc)
