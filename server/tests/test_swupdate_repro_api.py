import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.swupdate_repro import router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_swupdate_repro_requires_configured_upstream_build(client, monkeypatch):
    monkeypatch.delenv("CANLITE_SWUPDATE_REPRO_ROOT", raising=False)

    response = client.post("/labs/repro/swupdate/run", json={
        "variant": "vulnerable", "mode": "truncated", "boundary": "ABC",
    })

    assert response.status_code == 503
    assert "CANLITE_SWUPDATE_REPRO_ROOT" in response.json()["detail"]


def test_swupdate_repro_refuses_unbounded_boundary(client):
    response = client.post("/labs/repro/swupdate/run", json={
        "variant": "vulnerable", "mode": "truncated", "boundary": "ABC; exit",
    })

    assert response.status_code == 422


@pytest.mark.skipif(not os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT"), reason="local SWUpdate builds not configured")
def test_live_swupdate_api_returns_actual_process_log(client):
    response = client.post("/labs/repro/swupdate/run", json={
        "variant": "vulnerable", "mode": "truncated", "boundary": "ABC",
    })

    assert response.status_code == 200
    body = response.json()
    assert body["evidenceKind"] == "actual_process"
    assert body["observation"]["negativeReportedLength"] is True
    assert body["observation"]["reportedBytes"] == -2
    assert body["observation"]["serverAliveAfterRequest"] is True
    assert "-2 bytes." in body["request"]["httpResponse"]
