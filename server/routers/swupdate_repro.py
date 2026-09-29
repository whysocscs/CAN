"""Local-only API for real SWUpdate multipart comparisons."""

import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from repro.swupdate_http_probe import build_request
from server.labs.swupdate_repro import run_custom_repro_process, run_repro_process

router = APIRouter(prefix="/labs/repro", tags=["cve-reproduction"])


class SwupdateReproRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    variant: Literal["vulnerable", "patched"]
    mode: Literal["truncated", "complete"]
    boundary: str = Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9]+$")


class SwupdateSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    variant: Literal["vulnerable", "patched"]
    boundary: str = Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9]+$")
    terminal_chunk_escaped: str = Field(alias="terminalChunkEscaped", max_length=40)
    declared_content_length: int = Field(alias="declaredContentLength", ge=1, le=512)


@router.post("/swupdate/run")
def run_swupdate(body: SwupdateReproRequest, request: Request) -> dict[str, object]:
    client_host = request.client.host if request.client else None
    if client_host not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "실제 제품 재현 API는 로컬에서만 사용할 수 있습니다.")
    root = os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT")
    if not root:
        raise HTTPException(503, "CANLITE_SWUPDATE_REPRO_ROOT 환경 변수를 설정하고 서버를 다시 시작하세요.")
    try:
        return run_repro_process(
            root=root,
            distro=os.environ.get("CANLITE_SWUPDATE_WSL_DISTRO", "Ubuntu-22.04"),
            variant=body.variant,
            boundary=body.boundary,
            mode=body.mode,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/swupdate/send")
def send_swupdate(body: SwupdateSendRequest, request: Request) -> dict[str, object]:
    client_host = request.client.host if request.client else None
    if client_host not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "실제 제품 재현 API는 로컬에서만 사용할 수 있습니다.")
    try:
        build_request(
            boundary=body.boundary, terminal_chunk_escaped=body.terminal_chunk_escaped,
            declared_content_length=body.declared_content_length,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    root = os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT")
    if not root:
        raise HTTPException(503, "CANLITE_SWUPDATE_REPRO_ROOT 환경 변수를 설정하고 서버를 다시 시작하세요.")
    try:
        return run_custom_repro_process(
            root=root,
            distro=os.environ.get("CANLITE_SWUPDATE_WSL_DISTRO", "Ubuntu-22.04"),
            variant=body.variant,
            boundary=body.boundary,
            terminal_chunk_escaped=body.terminal_chunk_escaped,
            declared_content_length=body.declared_content_length,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
