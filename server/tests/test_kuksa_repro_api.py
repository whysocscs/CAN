"""The browser API must expose only bounded real-broker experiments."""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers.kuksa_repro import router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_real_repro_requires_a_configured_upstream_build(client, monkeypatch):
    monkeypatch.delenv("CANLITE_KUKSA_REPRO_ROOT", raising=False)

    response = client.post("/labs/repro/kuksa/run", json={
        "variant": "vulnerable", "providerRole": "read", "fakeValue": "TEST_REPRO",
    })

    assert response.status_code == 503
    assert "CANLITE_KUKSA_REPRO_ROOT" in response.json()["detail"]


def test_real_repro_refuses_arbitrary_command_text(client):
    response = client.post("/labs/repro/kuksa/run", json={
        "variant": "vulnerable", "providerRole": "read", "fakeValue": "x; rm -rf /",
    })

    assert response.status_code == 422


@pytest.mark.skipif(not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"), reason="local KUKSA build not configured")
def test_live_api_returns_broker_evidence(client):
    response = client.post("/labs/repro/kuksa/run", json={
        "variant": "patched", "providerRole": "read", "fakeValue": "TEST_REPRO",
    })

    assert response.status_code == 200
    body = response.json()
    assert body["evidenceKind"] == "actual_process"
    assert body["observation"]["providerRegistration"] == "denied"
    assert "PermissionDenied" in body["clientOutput"]
