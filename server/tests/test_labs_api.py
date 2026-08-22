from __future__ import annotations

import asyncio
from collections import deque
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.routers import can, labs


class _SnapshotSocket:
    def __init__(self) -> None:
        self.messages: list[str] = []

    async def send_text(self, message: str) -> None:
        self.messages.append(message)


def test_can_event_keeps_optional_accepted_frame_metadata() -> None:
    event = can.build_event(
        "0x101",
        ["00", "01", "13", "B7"],
        timestamp_ms=1,
        channel="vcan0",
        context={"command": "DOOR_LOCK"},
        processing={"executionResult": "EXECUTED"},
        monitoring={"status": "NORMAL"},
    )

    assert event["context"] == {"command": "DOOR_LOCK"}
    assert event["processing"] == {"executionResult": "EXECUTED"}
    assert event["monitoring"] == {"status": "NORMAL"}


def test_socketcan_observation_uses_pending_accepted_frame_metadata() -> None:
    key = ("0x101", ("00", "01", "13", "B7"))
    can._pending_metadata[key] = deque(
        [
            {
                "context": {"command": "DOOR_LOCK"},
                "processing": {"executionResult": "EXECUTED"},
                "monitoring": {"status": "NORMAL"},
            }
        ]
    )
    observed = can.parse_candump("(1.0) vcan0 101#000113B7")

    assert observed is not None
    assert can.attach_pending_metadata(observed)["monitoring"] == {"status": "NORMAL"}


def test_socketcan_emit_normalizes_pending_metadata_key(monkeypatch) -> None:
    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    can._pending_metadata.clear()
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    try:
        assert asyncio.run(can.emit("101", ["b7"], monitoring={"status": "NORMAL"})) is True
        observed = can.parse_candump("(1.0) vcan0 101#B7")

        assert observed is not None
        assert can.attach_pending_metadata(observed)["monitoring"] == {"status": "NORMAL"}
    finally:
        can._pending_metadata.clear()


def test_loopback_lab_event_uses_epoch_timestamp_and_session_metadata(monkeypatch) -> None:
    class FixedTime:
        @staticmethod
        def time() -> float:
            return 1_700_000_000.123

    original_frames = dict(can._last_frames)
    can._last_frames.clear()
    monkeypatch.setattr(can, "MODE", "loopback")
    monkeypatch.setattr(can, "time", FixedTime)
    try:
        assert asyncio.run(
            can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"labId": "door-blackbox-v1", "sessionId": "session-1"},
            )
        ) is True

        event = can._last_frames["0x456"]
        assert event["timestamp"] == 1_700_000_000_123
        assert event["lab"] == {"labId": "door-blackbox-v1", "sessionId": "session-1"}
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)


def test_socketcan_bridge_keeps_lab_session_metadata(monkeypatch) -> None:
    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    can._pending_metadata.clear()
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    try:
        assert asyncio.run(
            can.emit(
                "456",
                ["00", "01", "13", "B7"],
                lab={"labId": "door-blackbox-v1", "sessionId": "session-1"},
            )
        ) is True
        observed = can.parse_candump("(1.0) vcan0 456#000113B7")

        assert observed is not None
        assert can.attach_pending_metadata(observed)["lab"] == {
            "labId": "door-blackbox-v1",
            "sessionId": "session-1",
        }
    finally:
        can._pending_metadata.clear()


def test_session_routes_emit_only_accepted_frames_with_toy_metadata() -> None:
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)

    created = client.post("/labs/door-blackbox/sessions")
    assert created.status_code == 201
    session_id = created.json()["sessionId"]
    assert "checksum" not in repr(created.json()).lower()

    current = client.get(f"/labs/door-blackbox/sessions/{session_id}")
    assert current.status_code == 200

    terminal = client.post(f"/labs/door-blackbox/sessions/{session_id}/terminal", json={"command": "pwd"})
    assert terminal.status_code == 200
    assert terminal.json()["ok"] is True

    run = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/run",
        json={
            "script": "interval_ms=100\n"
            "cansend vcan0 456#000113B7\n"
            "cansend vcan0 456#000114B0\n"
            "cansend vcan0 456#000115B1"
        },
    )
    assert run.status_code == 200
    assert run.json()["idsStatus"] == "NORMAL"
    attempts = run.json()["attempts"]
    assert all(set(attempt) == {"attemptId", "timestamp", "canId", "data", "verdict"} for attempt in attempts)
    assert len({attempt["attemptId"] for attempt in attempts}) == 3
    assert [attempt["timestamp"] for attempt in attempts][1:] == [
        attempts[0]["timestamp"] + 100,
        attempts[0]["timestamp"] + 200,
    ]
    assert len(emitted) == 3
    assert emitted[0] == {
        "can_id": "0x456",
        "data": ["00", "01", "13", "B7"],
        "context": {
            "command": "DOOR_LOCK",
            "source": "obd",
            "target": "body",
            "route": ["obd", "ids", "gateway", "body"],
            "meaning": "Toy Body ECU accepted state frame",
            "action": "LEFT_DOOR_OPEN",
        },
        "processing": {"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
        "monitoring": {"idsObserved": True, "status": "NORMAL"},
        "lab": {"labId": "door-blackbox-v1", "sessionId": session_id},
    }

    reset = client.post(f"/labs/door-blackbox/sessions/{session_id}/reset")
    assert reset.status_code == 200
    assert reset.json()["attemptCount"] == 0


def test_unknown_session_returns_not_found() -> None:
    app = FastAPI()
    app.include_router(labs.router)
    client = TestClient(app)

    response = client.get("/labs/door-blackbox/sessions/not-a-session")

    assert response.status_code == 404


def test_rejected_attempts_are_returned_but_never_emitted_as_vehicle_events() -> None:
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/run",
        json={"script": "cansend vcan0 456#00011300"},
    )

    assert response.status_code == 200
    assert response.json()["attempts"][0]["verdict"] == "CHECKSUM_INVALID"
    assert emitted == []


def test_reset_clears_accepted_door_snapshot_before_a_browser_reconnects() -> None:
    original_frames = dict(can._last_frames)
    can._last_frames.clear()

    async def snapshot_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        can._last_frames[can_id] = can.build_event(
            can_id,
            data,
            timestamp_ms=1,
            channel="vcan0",
            **metadata,
        )
        return True

    try:
        app = FastAPI()
        app.include_router(labs.router)
        app.dependency_overrides[labs.get_frame_emitter] = lambda: snapshot_emit
        client = TestClient(app)
        session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

        run = client.post(
            f"/labs/door-blackbox/sessions/{session_id}/run",
            json={"script": "cansend vcan0 456#000113B7"},
        )
        assert run.json()["state"]["vehicleState"]["leftDoor"] == "open"
        assert can._last_frames["0x456"]["frame"]["data"] == ["00", "01", "13", "B7"]

        reset = client.post(f"/labs/door-blackbox/sessions/{session_id}/reset")
        assert reset.json()["vehicleState"]["leftDoor"] == "closed"

        reconnect = _SnapshotSocket()
        asyncio.run(can.send_snapshot(reconnect))
        assert reconnect.messages == []
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)


def test_terminal_cansend_emits_an_accepted_toy_frame() -> None:
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#000113B7"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == "EXECUTED"
    assert emitted[0]["processing"] == {"filterResult": "ACCEPT", "executionResult": "EXECUTED"}
    assert emitted[0]["lab"] == {"labId": "door-blackbox-v1", "sessionId": session_id}


def test_terminal_cansend_does_not_emit_a_blocked_toy_frame() -> None:
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#00011300"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == "CHECKSUM_INVALID"
    assert emitted == []


def test_create_session_clears_only_old_lab_snapshot_before_reconnect() -> None:
    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_metadata.items()}
    can._last_frames.clear()
    can._pending_metadata.clear()
    can._last_frames["0x456"] = can.build_event("0x456", ["00", "01", "13", "B7"], timestamp_ms=1, channel="vcan0")
    can._last_frames["0x101"] = can.build_event("0x101", ["01", "01"], timestamp_ms=2, channel="vcan0")
    can._pending_metadata[("0x456", ("00", "01", "13", "B7"))] = deque([{"lab": {"sessionId": "old"}}])
    try:
        app = FastAPI()
        app.include_router(labs.router)
        client = TestClient(app)

        assert client.post("/labs/door-blackbox/sessions").status_code == 201
        assert "0x456" not in can._last_frames
        assert "0x101" in can._last_frames
        assert not can._pending_metadata

        reconnect = _SnapshotSocket()
        asyncio.run(can.send_snapshot(reconnect))
        snapshots = [json.loads(message) for message in reconnect.messages]
        assert [snapshot["frame"]["canId"] for snapshot in snapshots] == ["0x101"]
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_metadata.clear()
        can._pending_metadata.update(original_pending)


def test_terminal_capture_response_has_stable_id_and_candump_timestamp() -> None:
    app = FastAPI()
    app.include_router(labs.router)
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cat baseline.log"},
    )

    first = response.json()["frames"][0]
    assert set(first) == {"attemptId", "timestamp", "canId", "data", "verdict"}
    assert first["attemptId"] == f"{session_id}-capture-000001"
    assert first["timestamp"] == 1_720_000_000_100
