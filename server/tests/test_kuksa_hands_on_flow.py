"""Live API gate: a real pinned Databroker must answer every learner step."""

import os

import pytest
from fastapi.testclient import TestClient

from server.main import app


pytestmark = pytest.mark.skipif(
    not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"),
    reason="local pinned KUKSA builds not configured",
)


def _start(client: TestClient, variant: str) -> dict:
    response = client.post("/labs/repro/kuksa/session", json={"variant": variant})
    assert response.status_code == 201, response.text
    return response.json()


def _command(client: TestClient, state: dict, action: str, **fields) -> tuple[dict, dict]:
    response = client.post(
        f"/labs/repro/kuksa/session/{state['sessionId']}/command",
        json={"revision": state["revision"], "action": action, **fields},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["evidenceKind"] == "actual_process"
    assert body["event"]["seq"] == state["revision"] + 1
    return body["session"], body["event"]


def _reset(client: TestClient, state: dict) -> None:
    response = client.post(
        f"/labs/repro/kuksa/session/{state['sessionId']}/reset",
        json={"revision": state["revision"]},
    )
    assert response.status_code == 200, response.text


def test_live_api_vulnerable_read_twice():
    with TestClient(app) as client:
        state = _start(client, "vulnerable")
        try:
            state, metadata = _command(client, state, "metadata")
            assert metadata["signalType"] == "boolean"
            state, initial = _command(client, state, "read")
            assert initial["readValue"] is None
            state, registration = _command(
                client, state, "register", providerRole="read", providedOpen=True,
            )
            assert registration["registrationAccepted"] is True
            assert "readValue" not in registration
            state, first = _command(client, state, "read")
            state, second = _command(client, state, "read")
            assert first["readValue"] is True
            assert second["readValue"] is True
        finally:
            _reset(client, state)


def test_live_api_patched_denied():
    with TestClient(app) as client:
        state = _start(client, "patched")
        try:
            state, metadata = _command(client, state, "metadata")
            assert metadata["signalType"] == "boolean"
            state, registration = _command(
                client, state, "register", providerRole="read", providedOpen=True,
            )
            assert registration["registrationAccepted"] is False
            assert registration["grpcStatus"] == "PermissionDenied"
            assert "readValue" not in registration
            state, observation = _command(client, state, "read")
            assert observation["readValue"] is None
        finally:
            _reset(client, state)


def test_live_api_reset_releases_port():
    with TestClient(app) as client:
        first = _start(client, "vulnerable")
        _reset(client, first)
        second = _start(client, "vulnerable")
        try:
            assert second["sessionId"] != first["sessionId"]
            second, metadata = _command(client, second, "metadata")
            assert metadata["signalPath"] == "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"
        finally:
            _reset(client, second)
