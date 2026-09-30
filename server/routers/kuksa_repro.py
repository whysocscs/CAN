"""Local-only API for real KUKSA Databroker reproduction."""

import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from server.labs.kuksa_repro import run_repro_process

router = APIRouter(prefix="/labs/repro", tags=["cve-reproduction"])


class KuksaReproRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    variant: Literal["vulnerable", "patched"]
    providerRole: Literal["read", "provide"]
    fakeValue: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")


@router.post("/kuksa/run")
def run_kuksa(body: KuksaReproRequest, request: Request) -> dict[str, object]:
    client_host = request.client.host if request.client else None
    if client_host not in ("127.0.0.1", "::1", "testclient"):
        raise HTTPException(403, "실제 제품 재현 API는 로컬에서만 사용할 수 있습니다.")
    root = os.environ.get("CANLITE_KUKSA_REPRO_ROOT")
    if not root:
        raise HTTPException(503, "CANLITE_KUKSA_REPRO_ROOT 환경 변수를 설정하고 서버를 다시 시작하세요.")
    try:
        return run_repro_process(
            root=root,
            distro=os.environ.get("CANLITE_KUKSA_WSL_DISTRO", "Ubuntu-22.04"),
            variant=body.variant,
            provider_role=body.providerRole,
            fake_value=body.fakeValue,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(503, str(exc)) from exc
