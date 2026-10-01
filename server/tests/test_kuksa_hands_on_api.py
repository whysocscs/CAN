"""The browser can issue only scoped commands to a local owned KUKSA process."""

import os

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


class FakeManager:
    def __init__(self):
        self.state = None
        self.closed = False
        self.commands = []

    def start(self, *, root, distro, variant):
        from server.labs.kuksa_hands_on import KuksaSessionConflict, VARIANTS, TARGET_PATH

        if self.state is not None:
            raise KuksaSessionConflict("one active session")
        self.state = {
            "sessionId": "a" * 32, "revision": 0, "variant": variant,
            "sourceCommit": VARIANTS[variant][1], "targetPath": TARGET_PATH,
        }
        return self.state.copy()

    def execute(self, *, session_id, revision, command):
        from server.labs.kuksa_hands_on import KuksaSessionConflict, TARGET_PATH

        if self.state is None or session_id != self.state["sessionId"] or revision != self.state["revision"]:
            raise KuksaSessionConflict("stale revision")
        self.commands.append(command)
        self.state["revision"] += 1
        event = {
            "seq": self.state["revision"], "action": command["action"],
            "outcome": "ok", "grpcStatus": "OK", "signalPath": TARGET_PATH,
            "brokerLog": "actual test process log", "clientError": "",
        }
        if command["action"] == "read":
            event["readValue"] = True
        elif command["action"] == "register":
            event["registrationAccepted"] = True
        return self.state.copy(), event

    def close(self, *, session_id, revision):
        from server.labs.kuksa_hands_on import KuksaSessionConflict

        if self.state is None or session_id != self.state["sessionId"] or revision != self.state["revision"]:
            raise KuksaSessionConflict("stale revision")
        self.state = None
        self.closed = True

    def shutdown(self):
        self.state = None
        self.closed = True


@pytest.fixture
def api(monkeypatch):
    from server.routers import kuksa_hands_on

    fake = FakeManager()
    monkeypatch.setattr(kuksa_hands_on, "manager", fake)
    monkeypatch.setenv("CANLITE_KUKSA_REPRO_ROOT", "/home/test/pinned")
    app = FastAPI()
    app.include_router(kuksa_hands_on.router)
    return TestClient(app), fake


def test_rejects_remote_or_extra_input(api):
    client, fake = api
    remote = TestClient(client.app, client=("198.51.100.1", 1234))
    assert remote.post("/labs/repro/kuksa/session", json={"variant": "vulnerable"}).status_code == 403
    for body in (
        {"variant": "vulnerable", "root": "/tmp/attacker"},
        {"variant": "vulnerable", "token": "forged"},
        {"variant": "unlisted"},
    ):
        assert client.post("/labs/repro/kuksa/session", json=body).status_code == 422
    assert fake.state is None


def test_missing_environment_is_503(api, monkeypatch):
    client, _ = api
    monkeypatch.delenv("CANLITE_KUKSA_REPRO_ROOT")
    assert client.post("/labs/repro/kuksa/session", json={"variant": "vulnerable"}).status_code == 503


def test_conflict_stale_revision_and_strict_command(api):
    client, fake = api
    created = client.post("/labs/repro/kuksa/session", json={"variant": "vulnerable"})
    assert created.status_code == 201
    state = created.json()
    assert client.post("/labs/repro/kuksa/session", json={"variant": "patched"}).status_code == 409
    path = f"/labs/repro/kuksa/session/{state['sessionId']}/command"
    for command in (
        {"revision": 0, "action": "read", "providedOpen": True},
        {"revision": 0, "action": "read", "providedOpen": None},
        {"revision": 0, "action": "shell", "value": "id"},
        {"revision": True, "action": "metadata"},
    ):
        assert client.post(path, json=command).status_code == 422
    assert fake.commands == []
    good = client.post(path, json={"revision": 0, "action": "metadata"})
    assert good.status_code == 200
    assert client.post(path, json={"revision": 0, "action": "read"}).status_code == 409
    assert client.post(f"/labs/repro/kuksa/session/{state['sessionId']}/reset", json={"revision": 0}).status_code == 409
    assert client.post(f"/labs/repro/kuksa/session/{state['sessionId']}/reset", json={"revision": 1}).json() == {"closed": True}
    assert fake.closed


def test_returns_actual_event(api):
    client, fake = api
    state = client.post("/labs/repro/kuksa/session", json={"variant": "vulnerable"}).json()
    response = client.post(f"/labs/repro/kuksa/session/{state['sessionId']}/command", json={
        "revision": 0, "action": "register", "providerRole": "read", "providedOpen": True,
    })
    assert response.status_code == 200
    assert response.json()["evidenceKind"] == "actual_process"
    assert response.json()["event"]["registrationAccepted"] is True
    assert fake.commands == [{"action": "register", "providerRole": "read", "providedOpen": True}]


def test_shutdown_closes_child(api, monkeypatch):
    from server import main
    from server.routers import kuksa_hands_on

    _, fake = api
    monkeypatch.setattr(kuksa_hands_on, "manager", fake)
    monkeypatch.setattr(main, "kuksa_hands_on_manager", fake)
    with TestClient(main.app) as client:
        response = client.post("/labs/repro/kuksa/session", json={"variant": "vulnerable"})
        assert response.status_code == 201
        assert fake.state is not None
    assert fake.closed


@pytest.mark.skipif(
    not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"),
    reason="local pinned KUKSA builds not configured",
)
@pytest.mark.parametrize("variant,accepted", [("vulnerable", True), ("patched", False)])
def test_live_api_separates_registration_from_actual_read(variant, accepted):
    from server import main

    with TestClient(main.app) as client:
        start = client.post("/labs/repro/kuksa/session", json={"variant": variant})
        assert start.status_code == 201, start.text
        state = start.json()
        events = []
        try:
            for command in (
                {"action": "metadata"},
                {"action": "read"},
                {"action": "register", "providerRole": "read", "providedOpen": True},
                {"action": "read"},
            ):
                response = client.post(
                    f"/labs/repro/kuksa/session/{state['sessionId']}/command",
                    json={"revision": state["revision"], **command},
                )
                assert response.status_code == 200, response.text
                assert response.json()["evidenceKind"] == "actual_process"
                state = response.json()["session"]
                events.append(response.json()["event"])
            assert events[2]["registrationAccepted"] is accepted
            assert "readValue" not in events[2]
            if accepted:
                assert events[3]["readValue"] is True
            else:
                assert events[2]["grpcStatus"] == "PermissionDenied"
                assert events[3]["readValue"] is not True
        finally:
            reset = client.post(
                f"/labs/repro/kuksa/session/{state['sessionId']}/reset",
                json={"revision": state["revision"]},
            )
            assert reset.status_code == 200, reset.text
