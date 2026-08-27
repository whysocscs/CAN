from __future__ import annotations

import asyncio
from collections import deque
import json
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from server.routers import can, labs


class _SnapshotSocket:
    def __init__(self) -> None:
        self.messages: list[str] = []

    async def send_text(self, message: str) -> None:
        self.messages.append(message)


class _OrderedClientRegistry:
    """Set-shaped registry with deterministic iteration for concurrency tests."""

    def __init__(self) -> None:
        self._items: list[object] = []

    def add(self, item: object) -> None:
        if item not in self._items:
            self._items.append(item)

    def discard(self, item: object) -> None:
        if item in self._items:
            self._items.remove(item)

    def clear(self) -> None:
        self._items.clear()

    def __iter__(self):
        return iter(tuple(self._items))

    def __len__(self) -> int:
        return len(self._items)


class _ControlledCanSocket:
    """ASGI WebSocket boundary double with real asynchronous backpressure."""

    def __init__(
        self,
        *,
        block_first_send: bool = False,
        block_all_sends: bool = False,
        send_delay_seconds: float = 0.0,
    ) -> None:
        self.headers: dict[str, str] = {}
        self.messages: list[str] = []
        self.accepted = asyncio.Event()
        self.receive_started = asyncio.Event()
        self.disconnect_requested = asyncio.Event()
        self.send_started = asyncio.Event()
        self.release_send = asyncio.Event()
        self.send_cancelled = asyncio.Event()
        self._block_first_send = block_first_send
        self._block_all_sends = block_all_sends
        self._send_delay_seconds = send_delay_seconds
        self._send_count = 0

    async def accept(self) -> None:
        self.accepted.set()

    async def send_text(self, message: str) -> None:
        self._send_count += 1
        self.send_started.set()
        should_block = self._block_all_sends or (
            self._block_first_send and self._send_count == 1
        )
        if should_block:
            try:
                await self.release_send.wait()
            except asyncio.CancelledError:
                self.send_cancelled.set()
                raise
        if self._send_delay_seconds:
            await asyncio.sleep(self._send_delay_seconds)
        self.messages.append(message)

    async def receive_text(self) -> str:
        self.receive_started.set()
        await self.disconnect_requested.wait()
        raise can.WebSocketDisconnect()


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
    can._pending_echoes[key] = deque(
        [
            can.PendingEcho(
                metadata={
                    "context": {"command": "DOOR_LOCK"},
                    "processing": {"executionResult": "EXECUTED"},
                    "monitoring": {"status": "NORMAL"},
                },
                sent_at_us=1_000_000,
            )
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

    can._pending_echoes.clear()
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    try:
        assert asyncio.run(can.emit("101", ["b7"], monitoring={"status": "NORMAL"})) is True
        observed = can.parse_candump("(1.0) vcan0 101#B7")

        assert observed is not None
        assert can.attach_pending_metadata(observed)["monitoring"] == {"status": "NORMAL"}
    finally:
        can._pending_echoes.clear()


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
                lab={"labId": "door-blackbox-v1", "sessionId": "session-1", "generation": 0},
            )
        ) is True

        event = can._last_frames["0x456"]
        assert event["timestamp"] == 1_700_000_000_123
        assert event["lab"] == {"labId": "door-blackbox-v1", "sessionId": "session-1", "generation": 0}
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

    can._pending_echoes.clear()
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    try:
        assert asyncio.run(
            can.emit(
                "456",
                ["00", "01", "13", "B7"],
                lab={"labId": "door-blackbox-v1", "sessionId": "session-1", "generation": 0},
            )
        ) is True
        observed = can.parse_candump("(1.0) vcan0 456#000113B7")

        assert observed is not None
        assert can.attach_pending_metadata(observed)["lab"] == {
            "labId": "door-blackbox-v1",
            "sessionId": "session-1",
            "generation": 0,
        }
    finally:
        can._pending_echoes.clear()


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
    assert created.json()["generation"] == 0
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
        "lab": {
            "labId": "door-blackbox-v1",
            "sessionId": session_id,
            "generation": 0,
            "attemptId": attempts[0]["attemptId"],
        },
    }

    reset = client.post(f"/labs/door-blackbox/sessions/{session_id}/reset")
    assert reset.status_code == 200
    assert reset.json()["attemptCount"] == 0
    assert reset.json()["generation"] == 1


def test_unknown_session_returns_not_found() -> None:
    app = FastAPI()
    app.include_router(labs.router)
    client = TestClient(app)

    response = client.get("/labs/door-blackbox/sessions/not-a-session")

    assert response.status_code == 404


def test_door_session_storage_evicts_oldest_and_latest_session_stays_active() -> None:
    original_sessions = labs._sessions.copy()
    original_active = labs._active_correlation
    original_frames = dict(can._last_frames)
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)
    labs._sessions.clear()
    labs._active_correlation = None
    try:
        created = [
            client.post("/labs/door-blackbox/sessions").json()["sessionId"]
            for _ in range(129)
        ]

        assert len(labs._sessions) == 128
        assert client.get(f"/labs/door-blackbox/sessions/{created[0]}").status_code == 404
        assert client.get(f"/labs/door-blackbox/sessions/{created[-1]}").status_code == 200

        latest = client.post(
            f"/labs/door-blackbox/sessions/{created[-1]}/terminal",
            json={"command": "cansend vcan0 456#000113B7"},
        )
        assert latest.json()["code"] == "EXECUTED"
        assert len(emitted) == 1
        assert emitted[0]["lab"]["sessionId"] == created[-1]
    finally:
        labs._sessions.clear()
        labs._sessions.update(original_sessions)
        labs._active_correlation = original_active
        can._last_frames.clear()
        can._last_frames.update(original_frames)


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


def test_right_door_frame_is_scope_rejected_without_trace_effect_or_event() -> None:
    emitted: list[dict[str, object]] = []

    async def record_emit(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record_emit
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    rejected = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#010013B7"},
    ).json()

    assert rejected["code"] == "TARGET_SCOPE_REJECTED"
    assert rejected["state"]["vehicleState"] == {
        "leftDoor": "closed",
        "rightDoor": "closed",
    }
    assert rejected["state"]["attemptCount"] == 0
    assert rejected["idsStatus"] == "ALERT"
    assert rejected["flowTraces"][0]["outcome"] == "REJECTED"
    assert rejected["flowTraces"][0]["stoppedAt"] == "body"
    assert rejected["flowTraces"][0]["effectTarget"] is None
    assert rejected["flowTraces"][0]["effectApplied"] is False
    assert emitted == []

    accepted = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#000113B7"},
    ).json()
    assert accepted["code"] == "EXECUTED"
    assert accepted["state"]["vehicleState"] == {
        "leftDoor": "open",
        "rightDoor": "closed",
    }
    assert len(emitted) == 1


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
    payload = response.json()
    assert payload["code"] == "EXECUTED"
    assert payload["idsStatus"] == "ALERT"
    assert payload["state"]["generation"] == 0
    assert payload["state"]["stage"] == "IDS 검증"
    assert payload["state"]["attemptCount"] == 1
    assert payload["state"]["vehicleState"] == {"leftDoor": "open", "rightDoor": "closed"}
    assert payload["state"]["evidence"] == [{"kind": "attempt", "status": "recorded"}]
    assert len(emitted) == 1
    assert emitted[0]["processing"] == {"filterResult": "ACCEPT", "executionResult": "EXECUTED"}
    assert emitted[0]["lab"] == {
        "labId": "door-blackbox-v1",
        "sessionId": session_id,
        "generation": 0,
        "attemptId": payload["frames"][0]["attemptId"],
    }


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
    payload = response.json()
    assert payload["code"] == "CHECKSUM_INVALID"
    assert payload["idsStatus"] == "ALERT"
    assert payload["state"]["generation"] == 0
    assert payload["state"]["stage"] == "프레임 제작"
    assert payload["state"]["attemptCount"] == 1
    assert payload["state"]["vehicleState"] == {"leftDoor": "closed", "rightDoor": "closed"}
    assert payload["state"]["evidence"] == [{"kind": "attempt", "status": "recorded"}]
    assert emitted == []


def test_session_api_generation_starts_at_zero_and_increments_without_changing_session_id() -> None:
    app = FastAPI()
    app.include_router(labs.router)
    client = TestClient(app)

    created = client.post("/labs/door-blackbox/sessions").json()
    first_reset = client.post(f"/labs/door-blackbox/sessions/{created['sessionId']}/reset").json()
    second_reset = client.post(f"/labs/door-blackbox/sessions/{created['sessionId']}/reset").json()

    assert [created["generation"], first_reset["generation"], second_reset["generation"]] == [0, 1, 2]
    assert {created["sessionId"], first_reset["sessionId"], second_reset["sessionId"]} == {created["sessionId"]}


def test_run_emits_attempt_generation_even_when_session_resets_between_frames() -> None:
    emitted: list[dict[str, object]] = []
    session_id = ""

    async def emit_then_reset(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        if len(emitted) == 1:
            labs._sessions[session_id].reset()
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: emit_then_reset
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/run",
        json={
            "script": "interval_ms=100\n"
            "cansend vcan0 456#000113B7\n"
            "cansend vcan0 456#000114B0\n"
            "cansend vcan0 456#000115B1"
        },
    )

    assert response.status_code == 200
    assert [event["lab"] for event in emitted] == [
        {
            "labId": "door-blackbox-v1",
            "sessionId": session_id,
            "generation": 0,
            "attemptId": attempt["attemptId"],
        }
        for attempt in response.json()["attempts"]
    ]
    assert client.get(f"/labs/door-blackbox/sessions/{session_id}").json()["generation"] == 1


def test_terminal_capture_is_observed_but_never_emitted() -> None:
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
        json={"command": "cat baseline.log"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["frames"][0]["verdict"] == "OBSERVED"
    assert payload["idsStatus"] is None
    assert payload["state"]["generation"] == 0
    assert payload["state"]["stage"] == "분석"
    assert payload["state"]["messageContractStatus"] == "OBSERVED"
    assert payload["state"]["attemptCount"] == 0
    assert payload["state"]["evidence"] == [{"kind": "capture", "status": "observed"}]
    assert emitted == []


def test_create_session_clears_only_old_lab_snapshot_before_reconnect() -> None:
    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()
    can._last_frames["0x456"] = can.build_event("0x456", ["00", "01", "13", "B7"], timestamp_ms=1, channel="vcan0")
    can._last_frames["0x101"] = can.build_event("0x101", ["01", "01"], timestamp_ms=2, channel="vcan0")
    can._pending_echoes[("0x456", ("00", "01", "13", "B7"))] = deque(
        [can.PendingEcho(metadata={"lab": {"sessionId": "old"}}, sent_at_us=1_000_000)]
    )
    try:
        app = FastAPI()
        app.include_router(labs.router)
        client = TestClient(app)

        assert client.post("/labs/door-blackbox/sessions").status_code == 201
        assert "0x456" not in can._last_frames
        assert "0x101" in can._last_frames
        assert not can._pending_echoes

        reconnect = _SnapshotSocket()
        asyncio.run(can.send_snapshot(reconnect))
        snapshots = [json.loads(message) for message in reconnect.messages]
        assert [snapshot["frame"]["canId"] for snapshot in snapshots] == ["0x101"]
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


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


def test_reset_waits_for_inflight_emit_then_clears_snapshot_and_rejects_remaining_generation() -> None:
    original_frames = dict(can._last_frames)
    can._last_frames.clear()

    async def scenario() -> None:
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        emit_started = asyncio.Event()
        release_emit = asyncio.Event()
        emitted: list[list[str]] = []

        async def delayed_snapshot_emit(can_id: str, data: list[str], **metadata: object) -> bool:
            emit_started.set()
            await release_emit.wait()
            emitted.append(data)
            can._last_frames[can_id] = can.build_event(
                can_id,
                data,
                timestamp_ms=1,
                channel="vcan0",
                **metadata,
            )
            return True

        run_task = asyncio.create_task(
            labs.run_script(
                session_id,
                labs.ScriptRequest(
                    script="interval_ms=10\n"
                    "cansend vcan0 456#000113B7\n"
                    "cansend vcan0 456#000114B0\n"
                    "cansend vcan0 456#000115B1"
                ),
                delayed_snapshot_emit,
            )
        )
        await emit_started.wait()
        reset_task = asyncio.create_task(labs.reset_session(session_id))
        await asyncio.sleep(0)
        release_emit.set()
        await asyncio.gather(run_task, reset_task)

        assert emitted == [["00", "01", "13", "B7"]]
        assert "0x456" not in can._last_frames

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)


def test_new_session_waits_for_inflight_emit_then_invalidates_the_old_session() -> None:
    original_frames = dict(can._last_frames)
    can._last_frames.clear()

    async def scenario() -> None:
        old = await labs.create_session()
        old_session_id = str(old["sessionId"])
        emit_started = asyncio.Event()
        release_emit = asyncio.Event()

        async def delayed_snapshot_emit(can_id: str, data: list[str], **metadata: object) -> bool:
            emit_started.set()
            await release_emit.wait()
            can._last_frames[can_id] = can.build_event(
                can_id,
                data,
                timestamp_ms=1,
                channel="vcan0",
                **metadata,
            )
            return True

        old_run = asyncio.create_task(
            labs.run_script(
                old_session_id,
                labs.ScriptRequest(
                    script="interval_ms=10\n"
                    "cansend vcan0 456#000113B7\n"
                    "cansend vcan0 456#000114B0"
                ),
                delayed_snapshot_emit,
            )
        )
        await emit_started.wait()
        create_task = asyncio.create_task(labs.create_session())
        await asyncio.sleep(0)
        release_emit.set()
        new = await create_task
        await old_run

        assert new["sessionId"] != old_session_id
        assert "0x456" not in can._last_frames

        stale_emits: list[list[str]] = []

        async def record_stale(_can_id: str, data: list[str], **_metadata: object) -> bool:
            stale_emits.append(data)
            return True

        stale_run = await labs.run_script(
            old_session_id,
            labs.ScriptRequest(script="cansend vcan0 456#000115B1"),
            record_stale,
        )
        stale_terminal = await labs.terminal_command(
            old_session_id,
            labs.TerminalRequest(command="cansend vcan0 456#000116B2"),
            record_stale,
        )
        assert stale_run["attempts"][0]["verdict"] == "EXECUTED"
        assert stale_terminal["code"] == "EXECUTED"
        assert stale_emits == []

        current_emits: list[list[str]] = []

        async def record_current(_can_id: str, data: list[str], **_metadata: object) -> bool:
            current_emits.append(data)
            return True

        current = await labs.run_script(
            str(new["sessionId"]),
            labs.ScriptRequest(script="cansend vcan0 456#000113B7"),
            record_current,
        )
        assert current["attempts"][0]["verdict"] == "EXECUTED"
        assert current_emits == [["00", "01", "13", "B7"]]

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)


def test_socketcan_echo_cleared_during_reset_is_dropped_once_not_forever(monkeypatch) -> None:
    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()
    monkeypatch.setattr(can, "MODE", "socketcan")
    key = ("0x456", ("00", "01", "13", "B7"))
    can._pending_echoes[key] = deque(
        [
            can.PendingEcho(
                metadata={"lab": {"sessionId": "stale", "generation": 0}},
                sent_at_us=1_000_000,
            )
        ]
    )

    async def scenario() -> None:
        can.clear_frame_snapshot("0x456")
        stale_echo = can.parse_candump("(1.0) vcan0 456#000113B7")
        next_identical_frame = can.parse_candump("(2.0) vcan0 456#000113B7")
        assert stale_echo is not None
        assert next_identical_frame is not None

        assert await can.publish_observed_event(stale_echo) is False
        assert "0x456" not in can._last_frames
        assert await can.publish_observed_event(next_identical_frame) is True
        assert can._last_frames["0x456"]["timestamp"] == 2000

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_run_domain_mutation_waits_for_the_lifecycle_lock() -> None:
    """Moving only emission under the lock still lets a reset split domain state."""

    async def scenario() -> None:
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        session = labs._sessions[session_id]
        lock_entered = asyncio.Event()
        release_lock = asyncio.Event()

        async def hold_lifecycle_lock() -> None:
            async with labs._lifecycle_lock:
                lock_entered.set()
                await release_lock.wait()

        async def record_emit(_can_id: str, _data: list[str], **_metadata: object) -> bool:
            return True

        holder = asyncio.create_task(hold_lifecycle_lock())
        await lock_entered.wait()
        run_task = asyncio.create_task(
            labs.run_script(
                session_id,
                labs.ScriptRequest(
                    script="interval_ms=100\n"
                    "cansend vcan0 456#000113B7\n"
                    "cansend vcan0 456#000114B0\n"
                    "cansend vcan0 456#000115B1"
                ),
                record_emit,
            )
        )

        await asyncio.sleep(0)
        state_while_lifecycle_is_blocked = session.public_state()
        release_lock.set()
        await asyncio.gather(holder, run_task)

        assert state_while_lifecycle_is_blocked["generation"] == 0
        assert state_while_lifecycle_is_blocked["attemptCount"] == 0
        assert state_while_lifecycle_is_blocked["vehicleState"] == {
            "leftDoor": "closed",
            "rightDoor": "closed",
        }
        assert state_while_lifecycle_is_blocked["completed"] is False

    asyncio.run(scenario())


def test_door_results_expose_authoritative_flow_traces() -> None:
    emitted: list[dict[str, object]] = []

    async def record(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record
    client = TestClient(app)

    created = client.post("/labs/door-blackbox/sessions").json()
    session_id = created["sessionId"]

    local = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "pwd"},
    ).json()
    assert local["flowTraces"][0] == {
        "traceId": "terminal:pwd",
        "attemptId": None,
        "sequence": 1,
        "kind": "local",
        "commandLabel": "pwd",
        "commandIndex": None,
        "canId": None,
        "data": [],
        "route": ["terminal"],
        "stoppedAt": None,
        "outcome": "LOCAL",
        "ecuVerdict": None,
        "idsVerdict": None,
        "effectTarget": None,
        "effectState": None,
        "effectApplied": False,
    }

    rejected = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#010110B5"},
    ).json()
    trace = rejected["flowTraces"][0]
    assert trace["route"] == ["terminal", "obd", "ids", "gateway", "body"]
    assert trace["stoppedAt"] == "body"
    assert trace["outcome"] == "REJECTED"
    assert trace["effectApplied"] is False

    accepted = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/run",
        json={
            "script": "interval_ms=100\n"
            "cansend vcan0 456#000113B7\n"
            "cansend vcan0 456#000114B0\n"
            "cansend vcan0 456#000115B1"
        },
    ).json()
    assert [item["sequence"] for item in accepted["flowTraces"]] == [1, 2, 3]
    assert all(item["outcome"] == "EXECUTED" for item in accepted["flowTraces"])
    assert accepted["flowTraces"][0]["route"][-2:] == ["body", "leftDoor"]
    assert accepted["flowTraces"][0]["effectState"] == "open"
    assert emitted[-1]["lab"]["attemptId"] == accepted["flowTraces"][-1]["attemptId"]


@pytest.mark.parametrize("command", ["cat missing.log", "candump vcan1"])
def test_failed_observation_like_commands_stop_at_the_door_terminal(command: str) -> None:
    emitted: list[dict[str, object]] = []

    async def record(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]

    result = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": command},
    ).json()

    assert result["ok"] is False
    assert result["code"] == "COMMAND_REJECTED"
    assert result["flowTraces"] == [
        {
            "traceId": f"terminal:{command}",
            "attemptId": None,
            "sequence": 1,
            "kind": "local",
            "commandLabel": command,
            "commandIndex": None,
            "canId": None,
            "data": [],
            "route": ["terminal"],
            "stoppedAt": "terminal",
            "outcome": "REJECTED",
            "ecuVerdict": "COMMAND_REJECTED",
            "idsVerdict": None,
            "effectTarget": None,
            "effectState": None,
            "effectApplied": False,
        }
    ]
    assert result["state"]["vehicleState"] == {
        "leftDoor": "closed",
        "rightDoor": "closed",
    }
    assert emitted == []


def test_terminal_flow_trace_normalizes_leading_whitespace_for_cansend() -> None:
    emitted: list[dict[str, object]] = []

    async def record(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record
    client = TestClient(app)
    session_id = client.post("/labs/door-blackbox/sessions").json()["sessionId"]
    command = "  cansend vcan0 456#000113B7"

    response = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": command},
    )

    assert response.status_code == 200
    payload = response.json()
    frame = payload["frames"][0]
    trace = payload["flowTraces"][0]
    assert payload["code"] == "EXECUTED"
    assert trace["traceId"] == frame["attemptId"]
    assert trace["attemptId"] == frame["attemptId"]
    assert trace["kind"] == "inject"
    assert trace["commandLabel"] == command
    assert trace["route"] == ["terminal", "obd", "ids", "gateway", "body", "leftDoor"]
    assert trace["outcome"] == "EXECUTED"
    assert trace["effectTarget"] == "leftDoor"
    assert trace["effectState"] == "open"
    assert trace["effectApplied"] is True
    assert emitted[0]["lab"]["attemptId"] == trace["attemptId"]


def test_terminal_domain_mutation_waits_for_the_lifecycle_lock() -> None:
    """A terminal cansend must not create a later-generation accepted result."""

    async def scenario() -> None:
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        session = labs._sessions[session_id]
        lock_entered = asyncio.Event()
        release_lock = asyncio.Event()

        async def hold_lifecycle_lock() -> None:
            async with labs._lifecycle_lock:
                lock_entered.set()
                await release_lock.wait()

        async def record_emit(_can_id: str, _data: list[str], **_metadata: object) -> bool:
            return True

        holder = asyncio.create_task(hold_lifecycle_lock())
        await lock_entered.wait()
        terminal_task = asyncio.create_task(
            labs.terminal_command(
                session_id,
                labs.TerminalRequest(command="cansend vcan0 456#000113B7"),
                record_emit,
            )
        )

        await asyncio.sleep(0)
        state_while_lifecycle_is_blocked = session.public_state()
        release_lock.set()
        await asyncio.gather(holder, terminal_task)

        assert state_while_lifecycle_is_blocked["generation"] == 0
        assert state_while_lifecycle_is_blocked["attemptCount"] == 0
        assert state_while_lifecycle_is_blocked["vehicleState"]["leftDoor"] == "closed"

    asyncio.run(scenario())


def test_terminal_response_keeps_the_state_snapshot_from_before_emit_side_effects() -> None:
    async def scenario() -> None:
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        session = labs._sessions[session_id]

        async def reset_during_emit(_can_id: str, _data: list[str], **_metadata: object) -> bool:
            session.reset()
            return True

        response = await labs.terminal_command(
            session_id,
            labs.TerminalRequest(command="cansend vcan0 456#000113B7"),
            reset_during_emit,
        )

        assert response["state"]["sessionId"] == session_id
        assert response["state"]["generation"] == 0
        assert response["state"]["attemptCount"] == 1
        assert response["state"]["vehicleState"] == {"leftDoor": "open", "rightDoor": "closed"}
        assert response["idsStatus"] == "ALERT"
        assert session.public_state()["generation"] == 1
        assert session.public_state()["vehicleState"] == {"leftDoor": "closed", "rightDoor": "closed"}

    asyncio.run(scenario())


def test_lost_stale_echo_does_not_consume_current_identical_echo_or_leak_metadata(monkeypatch) -> None:
    """A key-only reset tombstone drops the new echo and poisons the next frame."""

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    wall_time = 1_700_000_000.0
    monotonic_time = 10.0
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: wall_time)
    monkeypatch.setattr(can.time, "monotonic", lambda: monotonic_time)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        nonlocal wall_time, monotonic_time
        frame = ["00", "01", "13", "B7"]
        assert await can.emit(
            "0x456",
            frame,
            lab={"sessionId": "stale", "generation": 0},
        ) is True
        can.clear_frame_snapshot("0x456")

        # The old echo is lost.  A reset is followed by a byte-identical frame
        # for the current generation.
        wall_time = 1_700_000_001.0
        monotonic_time = 11.0
        assert await can.emit(
            "0x456",
            frame,
            lab={"sessionId": "current", "generation": 1},
        ) is True

        current_echo = can.parse_candump("(1700000001.100000) vcan0 456#000113B7")
        next_identical_traffic = can.parse_candump("(1700000001.200000) vcan0 456#000113B7")
        assert current_echo is not None
        assert next_identical_traffic is not None

        assert await can.publish_observed_event(current_echo) is True
        assert can._last_frames["0x456"]["lab"] == {
            "sessionId": "current",
            "generation": 1,
        }
        assert can._OBSERVED_AT_US_KEY not in can._last_frames["0x456"]
        assert not can._pending_echoes

        assert await can.publish_observed_event(next_identical_traffic) is True
        assert "lab" not in can._last_frames["0x456"]
        assert not can._cleared_echo_tombstones

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_cleared_socketcan_echo_tracking_is_bounded(monkeypatch) -> None:
    """Lost SocketCAN echoes must not grow reset correlation state forever."""

    monkeypatch.setattr(can, "MODE", "socketcan")
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()
    try:
        for index in range(200):
            can_id = f"0x{index:03x}"
            key = (can_id, (f"{index % 256:02X}",))
            can._pending_echoes[key] = deque(
                [
                    can.PendingEcho(
                        metadata={"lab": {"sessionId": str(index)}},
                        sent_at_us=index,
                    )
                ]
            )
            can.clear_frame_snapshot(can_id)

        assert len(can._cleared_echo_tombstones) <= 128
    finally:
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_async_thread_lock_double_cancel_releases_late_acquisition() -> None:
    """A second cancellation must not strand the executor-acquired thread lock."""

    async def scenario() -> None:
        underlying = threading.Lock()
        underlying.acquire()
        acquire_started = threading.Event()
        acquire_finished = threading.Event()

        class ObservableThreadLock:
            def acquire(self, blocking: bool = True) -> bool:
                acquire_started.set()
                acquired = underlying.acquire(blocking)
                if acquired:
                    acquire_finished.set()
                return acquired

            def release(self) -> None:
                underlying.release()

        lock = labs._AsyncThreadLock()
        lock._lock = ObservableThreadLock()
        waiter = asyncio.create_task(lock.__aenter__())
        assert await asyncio.to_thread(acquire_started.wait, 1)

        waiter.cancel()
        # The callback runs after the first CancelledError reaches __aenter__.
        # On the buggy implementation this is the cancellation that interrupts
        # its cleanup await while the executor thread is still blocked.
        asyncio.get_running_loop().call_soon(waiter.cancel)
        with pytest.raises(asyncio.CancelledError):
            await waiter

        underlying.release()
        assert await asyncio.to_thread(acquire_finished.wait, 1)
        await asyncio.sleep(0)

        acquired_after_cancel = underlying.acquire(blocking=False)
        try:
            assert acquired_after_cancel is True
        finally:
            if acquired_after_cancel or underlying.locked():
                underlying.release()

    asyncio.run(scenario())


def test_same_millisecond_stale_echo_cannot_take_current_identical_metadata(monkeypatch) -> None:
    """candump's six decimal places must remain available for echo correlation."""

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    wall_time = 1_000.0
    monotonic_time = 10.0
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: wall_time)
    monkeypatch.setattr(can.time, "monotonic", lambda: monotonic_time)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        nonlocal wall_time, monotonic_time
        frame = ["00", "01", "13", "B7"]
        assert await can.emit(
            "0x456",
            frame,
            lab={"sessionId": "stale", "generation": 0},
        ) is True
        can.clear_frame_snapshot("0x456")

        # Both sends and the stale observation fall in timestamp millisecond
        # 1000000.  Their microsecond ordering is nevertheless unambiguous.
        wall_time = 1_000.000900
        monotonic_time = 11.0
        assert await can.emit(
            "0x456",
            frame,
            lab={"sessionId": "current", "generation": 1},
        ) is True

        stale_echo = can.parse_candump("(1000.000100) vcan0 456#000113B7")
        current_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
        next_identical = can.parse_candump("(1000.002000) vcan0 456#000113B7")
        assert stale_echo is not None
        assert current_echo is not None
        assert next_identical is not None

        assert await can.publish_observed_event(stale_echo) is False
        assert can._pending_echoes
        assert await can.publish_observed_event(current_echo) is True
        assert can._last_frames["0x456"]["lab"] == {
            "sessionId": "current",
            "generation": 1,
        }
        assert not can._pending_echoes

        assert await can.publish_observed_event(next_identical) is True
        assert "lab" not in can._last_frames["0x456"]
        assert not can._cleared_echo_tombstones

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_global_snapshot_clear_preserves_and_creates_socketcan_echo_tombstones(monkeypatch) -> None:
    """A global clear must keep both old and newly invalidated echoes out."""

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        assert await can.emit(
            "0x456",
            ["00", "01", "13", "B7"],
            lab={"sessionId": "already-cleared"},
        ) is True
        can.clear_frame_snapshot("0x456")
        assert len(can._cleared_echo_tombstones) == 1

        assert await can.emit(
            "0x457",
            ["AA"],
            lab={"sessionId": "pending-at-global-clear"},
        ) is True
        await can.clear_snapshot()

        old_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
        pending_echo = can.parse_candump("(1000.002000) vcan0 457#AA")
        assert old_echo is not None
        assert pending_echo is not None
        assert await can.publish_observed_event(old_echo) is False
        assert await can.publish_observed_event(pending_echo) is False
        assert not can._last_frames
        assert not can._pending_echoes

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_socketcan_emit_create_failure_removes_queued_metadata(monkeypatch) -> None:
    """A failed process creation did not put a frame on the bus."""

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> object:
        raise OSError("cansend unavailable")

    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        with pytest.raises(OSError, match="cansend unavailable"):
            await can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"sessionId": "failed"},
            )
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones

        unrelated = can.parse_candump("(1001.0) vcan0 456#000113B7")
        assert unrelated is not None
        resolved = can.attach_pending_metadata(unrelated)
        assert resolved is not None
        assert "lab" not in resolved

    try:
        asyncio.run(scenario())
    finally:
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_socketcan_emit_wait_cancellation_tombstones_uncertain_echo(monkeypatch) -> None:
    """After cansend starts, cancellation must not leak or misattach metadata."""

    wait_started = asyncio.Event()

    class WaitingProcess:
        returncode = None

        async def wait(self) -> None:
            wait_started.set()
            await asyncio.Event().wait()

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> WaitingProcess:
        return WaitingProcess()

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        task = asyncio.create_task(
            can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"sessionId": "cancelled"},
            )
        )
        await wait_started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        assert not can._pending_echoes
        assert len(can._cleared_echo_tombstones) == 1

        uncertain_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
        assert uncertain_echo is not None
        assert await can.publish_observed_event(uncertain_echo) is False
        assert not can._last_frames

    try:
        asyncio.run(scenario())
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_socketcan_emit_cancellation_keeps_known_successful_echo_metadata(monkeypatch) -> None:
    """Cancellation delivery must not turn a known-successful send into stale traffic."""

    class SuccessfulButCancelledProcess:
        returncode: int | None = None

        async def wait(self) -> None:
            self.returncode = 0
            current = asyncio.current_task()
            assert current is not None
            current.cancel()
            await asyncio.sleep(0)

    async def fake_subprocess_exec(
        *_args: object,
        **_kwargs: object,
    ) -> SuccessfulButCancelledProcess:
        return SuccessfulButCancelledProcess()

    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        with pytest.raises(asyncio.CancelledError):
            await can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"sessionId": "known-success"},
            )

        assert can._pending_echoes
        assert not can._cleared_echo_tombstones

        successful_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
        next_identical = can.parse_candump("(1000.002000) vcan0 456#000113B7")
        assert successful_echo is not None
        assert next_identical is not None
        resolved = can.attach_pending_metadata(successful_echo)
        assert resolved is not None
        assert resolved["lab"] == {"sessionId": "known-success"}
        assert can.attach_pending_metadata(next_identical) is not None
        assert "lab" not in next_identical
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones

    try:
        asyncio.run(scenario())
    finally:
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_socketcan_emit_cancelled_during_creation_recovers_started_process(monkeypatch) -> None:
    """Cancelling process creation must not discard a child that later succeeds."""

    creation_started = asyncio.Event()
    release_creation = asyncio.Event()
    process_reaped = asyncio.Event()

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            process_reaped.set()

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        creation_started.set()
        await release_creation.wait()
        return SuccessfulProcess()

    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    async def scenario() -> None:
        emit_task = asyncio.create_task(
            can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"sessionId": "creation-cancelled"},
            )
        )
        await creation_started.wait()
        emit_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await emit_task

        # Until the shielded creation resolves, a possible child echo must
        # retain this request's metadata instead of becoming unrelated traffic.
        assert can._pending_echoes
        possible_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
        assert possible_echo is not None
        resolved = can.attach_pending_metadata(possible_echo)
        assert resolved is not None
        assert resolved["lab"] == {"sessionId": "creation-cancelled"}

        release_creation.set()
        await process_reaped.wait()
        await asyncio.sleep(0)
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones
        assert not can._background_emit_tasks

    try:
        asyncio.run(scenario())
    finally:
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_global_clear_is_atomic_with_pending_echo_registration_across_event_loops(
    monkeypatch,
) -> None:
    """A reset cannot split one pending echo's metadata from its send time."""

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    registration_paused = threading.Event()
    clear_attempted = threading.Event()
    clear_finished = threading.Event()
    resume_registration = threading.Event()

    class PausingDeque(deque):
        def append(self, value: object) -> None:
            super().append(value)
            registration_paused.set()
            if not clear_attempted.wait(2):
                raise RuntimeError("global clear never started")
            # The old implementation can finish clear while registration is
            # split.  A state lock makes clear wait until this append returns.
            clear_finished.wait(1)
            resume_registration.set()

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    wall_time = 1_000.0
    monotonic_time = 10.0
    key = ("0x456", ("00", "01", "13", "B7"))
    worker_errors: list[BaseException] = []
    old_result: list[bool] = []
    clear_result: list[dict[str, object]] = []
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: wall_time)
    monkeypatch.setattr(can.time, "monotonic", lambda: monotonic_time)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()
    can._pending_echoes[key] = PausingDeque()

    def emit_old_generation() -> None:
        try:
            old_result.append(
                asyncio.run(
                    can.emit(
                        "0x456",
                        ["00", "01", "13", "B7"],
                        lab={"sessionId": "stale", "generation": 0},
                    )
                )
            )
        except BaseException as error:
            worker_errors.append(error)

    def clear_in_another_event_loop() -> None:
        try:
            clear_attempted.set()
            clear_result.append(asyncio.run(can.clear_snapshot()))
        except BaseException as error:
            worker_errors.append(error)
        finally:
            clear_finished.set()

    old_thread = threading.Thread(target=emit_old_generation)
    clear_thread = threading.Thread(target=clear_in_another_event_loop)
    try:
        old_thread.start()
        assert registration_paused.wait(2)
        clear_thread.start()
        assert resume_registration.wait(3)
        old_thread.join(2)
        clear_thread.join(2)
        assert not old_thread.is_alive()
        assert not clear_thread.is_alive()
        assert worker_errors == []
        assert old_result == [True]
        assert clear_result == [{"cleared": 0}]

        wall_time = 1_001.0
        assert asyncio.run(
            can.emit(
                "0x456",
                ["00", "01", "13", "B7"],
                lab={"sessionId": "current", "generation": 1},
            )
        ) is True

        async def observe_echoes() -> None:
            stale_echo = can.parse_candump("(1000.100000) vcan0 456#000113B7")
            current_echo = can.parse_candump("(1001.100000) vcan0 456#000113B7")
            assert stale_echo is not None
            assert current_echo is not None

            assert await can.publish_observed_event(stale_echo) is False
            assert await can.publish_observed_event(current_echo) is True
            assert can._last_frames["0x456"]["lab"] == {
                "sessionId": "current",
                "generation": 1,
            }
            assert not can._pending_echoes
            assert not can._cleared_echo_tombstones

        asyncio.run(observe_echoes())
    finally:
        clear_attempted.set()
        clear_finished.set()
        old_thread.join(2)
        if clear_thread.ident is not None:
            clear_thread.join(2)
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_global_clear_cannot_be_undone_between_echo_attach_and_snapshot_store(
    monkeypatch,
) -> None:
    """Echo resolution and replay snapshot registration share one linearization point."""

    class SuccessfulProcess:
        returncode = 0

        async def wait(self) -> None:
            return None

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> SuccessfulProcess:
        return SuccessfulProcess()

    delivery_paused = threading.Event()
    resume_delivery = threading.Event()
    original_delivery = can._deliver_to_clients
    publish_results: list[bool] = []
    worker_errors: list[BaseException] = []

    async def pausing_delivery(
        clients: tuple[object, ...],
        payload: str,
    ) -> None:
        delivery_paused.set()
        await asyncio.to_thread(resume_delivery.wait)
        await original_delivery(clients, payload)

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    monkeypatch.setattr(can, "_deliver_to_clients", pausing_delivery)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    assert asyncio.run(
        can.emit(
            "0x456",
            ["00", "01", "13", "B7"],
            lab={"sessionId": "before-clear", "generation": 0},
        )
    ) is True
    observed = can.parse_candump("(1000.001000) vcan0 456#000113B7")
    assert observed is not None

    def publish_in_another_event_loop() -> None:
        try:
            publish_results.append(asyncio.run(can.publish_observed_event(observed)))
        except BaseException as error:
            worker_errors.append(error)

    publish_thread = threading.Thread(target=publish_in_another_event_loop)
    try:
        publish_thread.start()
        assert delivery_paused.wait(2)
        assert asyncio.run(can.clear_snapshot()) == {"cleared": 1}
        resume_delivery.set()
        publish_thread.join(2)
        assert not publish_thread.is_alive()
        assert worker_errors == []
        assert publish_results == [True]
        assert not can._last_frames
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones
    finally:
        resume_delivery.set()
        publish_thread.join(2)
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_uncertain_cancel_removal_and_tombstone_are_atomic_across_event_loops(
    monkeypatch,
) -> None:
    """No echo can enter between pending removal and its uncertainty tombstone."""

    class CancellingProcess:
        returncode = None

        async def wait(self) -> None:
            current = asyncio.current_task()
            assert current is not None
            current.cancel()
            await asyncio.sleep(0)

    async def fake_subprocess_exec(*_args: object, **_kwargs: object) -> CancellingProcess:
        return CancellingProcess()

    remember_entered = threading.Event()
    observation_started = threading.Event()
    observation_finished = threading.Event()
    original_remember = can._remember_cleared_echo
    worker_errors: list[BaseException] = []
    cancellation_seen: list[bool] = []
    first_observation: list[bool] = []

    def pausing_remember(key: can.EchoKey, sent_at_us: int) -> None:
        remember_entered.set()
        if not observation_started.wait(2):
            raise RuntimeError("observation never started")
        # Without one outer state lock the first echo finishes here.  With the
        # atomic transition it waits until the tombstone is installed.
        observation_finished.wait(1)
        original_remember(key, sent_at_us)

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    monkeypatch.setattr(can, "_remember_cleared_echo", pausing_remember)
    can._last_frames.clear()
    can._pending_echoes.clear()
    can._cleared_echo_tombstones.clear()

    def cancel_emit_in_another_event_loop() -> None:
        try:
            asyncio.run(
                can.emit(
                    "0x456",
                    ["00", "01", "13", "B7"],
                    lab={"sessionId": "uncertain", "generation": 0},
                )
            )
        except asyncio.CancelledError:
            cancellation_seen.append(True)
        except BaseException as error:
            worker_errors.append(error)

    uncertain_echo = can.parse_candump("(1000.001000) vcan0 456#000113B7")
    next_identical = can.parse_candump("(1000.002000) vcan0 456#000113B7")
    assert uncertain_echo is not None
    assert next_identical is not None

    def observe_in_another_event_loop() -> None:
        try:
            observation_started.set()
            first_observation.append(
                asyncio.run(can.publish_observed_event(uncertain_echo))
            )
        except BaseException as error:
            worker_errors.append(error)
        finally:
            observation_finished.set()

    emit_thread = threading.Thread(target=cancel_emit_in_another_event_loop)
    observation_thread = threading.Thread(target=observe_in_another_event_loop)
    try:
        emit_thread.start()
        assert remember_entered.wait(2)
        observation_thread.start()
        emit_thread.join(3)
        observation_thread.join(3)
        assert not emit_thread.is_alive()
        assert not observation_thread.is_alive()
        assert worker_errors == []
        assert cancellation_seen == [True]
        assert first_observation == [False]

        assert asyncio.run(can.publish_observed_event(next_identical)) is True
        assert "lab" not in can._last_frames["0x456"]
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones
    finally:
        observation_started.set()
        observation_finished.set()
        emit_thread.join(2)
        if observation_thread.ident is not None:
            observation_thread.join(2)
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        can._cleared_echo_tombstones.clear()
        can._cleared_echo_tombstones.extend(original_tombstones)


def test_websocket_snapshot_handoff_delivers_one_ordered_live_event(
    monkeypatch,
) -> None:
    """A frame accepted during replay must follow that replay exactly once."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        can._last_frames["0x101"] = can.build_event(
            "0x101",
            ["01", "01"],
            timestamp_ms=1,
            channel="vcan0",
        )
        websocket = _ControlledCanSocket(block_first_send=True)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        try:
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            live = can.build_event(
                "0x101",
                ["00", "01"],
                timestamp_ms=2,
                channel="vcan0",
            )

            await asyncio.wait_for(can.broadcast(live), 1)
            websocket.release_send.set()
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            websocket.disconnect_requested.set()
            await asyncio.wait_for(socket_task, 1)

            delivered = [json.loads(message) for message in websocket.messages]
            assert [event["timestamp"] for event in delivered] == [1, 2]
            assert [event.get("replay", False) for event in delivered] == [True, False]
            assert [event["frame"]["data"] for event in delivered] == [
                ["01", "01"],
                ["00", "01"],
            ]
            assert len(registry) == 0
        finally:
            websocket.release_send.set()
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_stalled_websocket_is_bounded_and_cannot_block_terminal_reset(
    monkeypatch,
) -> None:
    """A stalled CAN listener must not hold the lab lifecycle lock forever."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "MODE", "loopback")
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 0.05, raising=False)
        original_frames = dict(can._last_frames)
        original_sessions = dict(labs._sessions)
        original_active = labs._active_correlation
        can._last_frames.clear()
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        websocket = _ControlledCanSocket(block_all_sends=True)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        terminal_task: asyncio.Task[dict[str, object]] | None = None
        reset_task: asyncio.Task[dict[str, object]] | None = None
        try:
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            terminal_task = asyncio.create_task(
                labs.terminal_command(
                    session_id,
                    labs.TerminalRequest(command="cansend vcan0 456#000113B7"),
                    can.emit,
                )
            )
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            reset_task = asyncio.create_task(labs.reset_session(session_id))

            done, pending = await asyncio.wait(
                {terminal_task, reset_task},
                timeout=0.5,
            )
            assert pending == set()
            assert done == {terminal_task, reset_task}
            assert terminal_task.result()["code"] == "EXECUTED"
            assert reset_task.result()["generation"] == 1
            assert websocket.release_send.is_set() is False
            await asyncio.wait_for(socket_task, 0.5)
            assert websocket.send_cancelled.is_set() is True
            assert len(registry) == 0
        finally:
            websocket.release_send.set()
            websocket.disconnect_requested.set()
            tasks = [
                task
                for task in (terminal_task, reset_task, socket_task)
                if task is not None
            ]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)
            labs._sessions.clear()
            labs._sessions.update(original_sessions)
            labs._active_correlation = original_active

    asyncio.run(scenario())


def test_websocket_clients_send_in_parallel_and_disconnect_without_leaks(
    monkeypatch,
) -> None:
    """One blocked client cannot delay a healthy client or leave handler tasks."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 0.05, raising=False)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        slow = _ControlledCanSocket(block_all_sends=True)
        fast = _ControlledCanSocket()
        slow_task = asyncio.create_task(can.can_socket(slow))
        fast_task = asyncio.create_task(can.can_socket(fast))
        broadcast_task: asyncio.Task[None] | None = None
        try:
            await asyncio.wait_for(slow.receive_started.wait(), 1)
            await asyncio.wait_for(fast.receive_started.wait(), 1)
            event = can.build_event(
                "0x200",
                ["01"],
                timestamp_ms=3,
                channel="vcan0",
            )
            broadcast_task = asyncio.create_task(can.broadcast(event))
            await asyncio.wait_for(slow.send_started.wait(), 1)

            await asyncio.wait_for(fast.send_started.wait(), 0.2)
            assert [json.loads(message)["timestamp"] for message in fast.messages] == [3]
            assert slow.release_send.is_set() is False
            await asyncio.wait_for(broadcast_task, 0.5)
            await asyncio.wait_for(slow_task, 0.5)
            assert slow.send_cancelled.is_set() is True
            assert len(registry) == 1

            fast.disconnect_requested.set()
            await asyncio.wait_for(fast_task, 0.5)
            assert len(registry) == 0
            assert slow_task.done() and fast_task.done() and broadcast_task.done()
        finally:
            slow.release_send.set()
            slow.disconnect_requested.set()
            fast.disconnect_requested.set()
            tasks = [task for task in (broadcast_task, slow_task, fast_task) if task]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_concurrent_broadcasts_preserve_route_order_for_each_websocket(
    monkeypatch,
) -> None:
    """Scheduling after routing must not reverse two live CAN events."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        original_frames = dict(can._last_frames)
        original_delivery = can._deliver_to_clients
        can._last_frames.clear()
        first_routed = asyncio.Event()
        release_first_delivery = asyncio.Event()
        websocket = _ControlledCanSocket()
        socket_task = asyncio.create_task(can.can_socket(websocket))
        first_task: asyncio.Task[None] | None = None
        second_task: asyncio.Task[None] | None = None

        async def pause_first_after_routing(
            clients: tuple[object, ...],
            payload: str,
        ) -> None:
            if json.loads(payload)["timestamp"] == 10:
                first_routed.set()
                await release_first_delivery.wait()
            await original_delivery(clients, payload)

        monkeypatch.setattr(can, "_deliver_to_clients", pause_first_after_routing)
        try:
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            first_task = asyncio.create_task(
                can.broadcast(
                    can.build_event(
                        "0x200",
                        ["01"],
                        timestamp_ms=10,
                        channel="vcan0",
                    )
                )
            )
            await asyncio.wait_for(first_routed.wait(), 1)
            second_task = asyncio.create_task(
                can.broadcast(
                    can.build_event(
                        "0x200",
                        ["00"],
                        timestamp_ms=11,
                        channel="vcan0",
                    )
                )
            )
            await asyncio.wait_for(second_task, 1)
            release_first_delivery.set()
            await asyncio.wait_for(first_task, 1)

            delivered = [json.loads(message) for message in websocket.messages]
            assert [event["timestamp"] for event in delivered] == [10, 11]
            assert [event["frame"]["data"] for event in delivered] == [["01"], ["00"]]
        finally:
            release_first_delivery.set()
            websocket.disconnect_requested.set()
            tasks = [task for task in (first_task, second_task, socket_task) if task]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_broadcast_returns_while_client_send_is_stalled_without_stranding(
    monkeypatch,
) -> None:
    """A caller only enqueues; the owner-loop writer retains ordered delivery."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 1.0)
        monkeypatch.setattr(can, "_CLIENT_DRAIN_TIMEOUT_SECONDS", 1.0)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        websocket = _ControlledCanSocket(block_first_send=True)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        first_task: asyncio.Task[None] | None = None
        second_task: asyncio.Task[None] | None = None

        async def wait_for_two_messages() -> None:
            while len(websocket.messages) < 2:
                await asyncio.sleep(0)

        try:
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            first_task = asyncio.create_task(
                can.broadcast(
                    can.build_event(
                        "0x200",
                        ["01"],
                        timestamp_ms=20,
                        channel="vcan0",
                    )
                )
            )
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            second_task = asyncio.create_task(
                can.broadcast(
                    can.build_event(
                        "0x200",
                        ["00"],
                        timestamp_ms=21,
                        channel="vcan0",
                    )
                    )
                )
            await asyncio.wait_for(second_task, 0.2)
            assert can._last_frames["0x200"]["timestamp"] == 21
            websocket.release_send.set()
            await asyncio.wait_for(first_task, 1)
            await asyncio.wait_for(wait_for_two_messages(), 1)

            assert [json.loads(message)["timestamp"] for message in websocket.messages] == [20, 21]
            assert len(registry) == 1
            websocket.disconnect_requested.set()
            await asyncio.wait_for(socket_task, 0.5)
            assert len(registry) == 0
            assert socket_task.done() and first_task.done() and second_task.done()
        finally:
            websocket.release_send.set()
            websocket.disconnect_requested.set()
            tasks = [task for task in (first_task, second_task, socket_task) if task]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_replaying_websocket_backlog_cap_evicts_and_clears_client(
    monkeypatch,
) -> None:
    """Live traffic cannot grow an in-progress replay queue without bound."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "_CLIENT_BACKLOG_MAX_MESSAGES", 3, raising=False)
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 1.0)
        monkeypatch.setattr(can, "_CLIENT_HANDOFF_TIMEOUT_SECONDS", 1.0, raising=False)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        can._last_frames["0x101"] = can.build_event(
            "0x101",
            ["01", "01"],
            timestamp_ms=30,
            channel="vcan0",
        )
        websocket = _ControlledCanSocket(block_first_send=True)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        connection: object | None = None
        try:
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            assert len(registry) == 1
            connection = next(iter(registry))
            assert connection.replaying is True

            for timestamp in range(31, 35):
                await can.broadcast(
                    can.build_event(
                        "0x200",
                        [f"{timestamp:02X}"],
                        timestamp_ms=timestamp,
                        channel="vcan0",
                    )
                )

            assert len(registry) == 0
            assert connection.evicted is True
            assert list(connection.backlog) == []
            assert websocket.release_send.is_set() is False
        finally:
            websocket.release_send.set()
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_snapshot_and_handoff_share_one_whole_operation_deadline(
    monkeypatch,
) -> None:
    """Many individually-fast replay sends cannot retain a client for N timeouts."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 0.2)
        monkeypatch.setattr(can, "_CLIENT_HANDOFF_TIMEOUT_SECONDS", 0.1, raising=False)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        for index in range(5):
            can_id = f"0x{0x300 + index:03x}"
            can._last_frames[can_id] = can.build_event(
                can_id,
                [f"{index:02X}"],
                timestamp_ms=40 + index,
                channel="vcan0",
            )
        websocket = _ControlledCanSocket(send_delay_seconds=0.04)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        connection: object | None = None
        started_at = asyncio.get_running_loop().time()
        try:
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            connection = next(iter(registry))
            await can.broadcast(
                can.build_event(
                    "0x200",
                    ["01"],
                    timestamp_ms=50,
                    channel="vcan0",
                )
            )
            done, pending = await asyncio.wait({socket_task}, timeout=0.25)
            elapsed = asyncio.get_running_loop().time() - started_at

            assert pending == set()
            assert done == {socket_task}
            assert elapsed < 0.25
            assert len(websocket.messages) < 6
            assert len(registry) == 0
            assert connection.evicted is True
            assert list(connection.backlog) == []
        finally:
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_ready_websocket_drain_deadline_bounds_terminal_and_reset_delay(
    monkeypatch,
) -> None:
    """A batch of sub-timeout sends gets one bounded drain budget."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "MODE", "loopback")
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 0.2)
        monkeypatch.setattr(can, "_CLIENT_DRAIN_TIMEOUT_SECONDS", 0.1, raising=False)
        original_frames = dict(can._last_frames)
        original_sessions = dict(labs._sessions)
        original_active = labs._active_correlation
        original_delivery = can._deliver_to_clients
        can._last_frames.clear()
        created = await labs.create_session()
        session_id = str(created["sessionId"])
        websocket = _ControlledCanSocket(send_delay_seconds=0.04)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        terminal_task: asyncio.Task[dict[str, object]] | None = None
        reset_task: asyncio.Task[dict[str, object]] | None = None

        async def queue_without_draining(
            _clients: tuple[object, ...],
            _payload: str,
        ) -> None:
            return None

        try:
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            monkeypatch.setattr(can, "_deliver_to_clients", queue_without_draining)
            for timestamp in range(60, 69):
                await can.broadcast(
                    can.build_event(
                        "0x200",
                        [f"{timestamp:02X}"],
                        timestamp_ms=timestamp,
                        channel="vcan0",
                    )
                )
            monkeypatch.setattr(can, "_deliver_to_clients", original_delivery)

            started_at = asyncio.get_running_loop().time()
            terminal_task = asyncio.create_task(
                labs.terminal_command(
                    session_id,
                    labs.TerminalRequest(command="cansend vcan0 456#000113B7"),
                    can.emit,
                )
            )
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            reset_task = asyncio.create_task(labs.reset_session(session_id))
            done, pending = await asyncio.wait(
                {terminal_task, reset_task},
                timeout=0.25,
            )
            elapsed = asyncio.get_running_loop().time() - started_at

            assert pending == set()
            assert done == {terminal_task, reset_task}
            assert elapsed < 0.25
            assert terminal_task.result()["code"] == "EXECUTED"
            assert reset_task.result()["generation"] == 1
            await asyncio.wait_for(socket_task, 0.5)
            assert len(websocket.messages) < 10
            assert len(registry) == 0
        finally:
            monkeypatch.setattr(can, "_deliver_to_clients", original_delivery)
            websocket.disconnect_requested.set()
            tasks = [task for task in (terminal_task, reset_task, socket_task) if task]
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)
            labs._sessions.clear()
            labs._sessions.update(original_sessions)
            labs._active_correlation = original_active

    asyncio.run(scenario())


def test_cross_loop_broadcast_enqueues_on_the_client_owner_loop(
    monkeypatch,
) -> None:
    """A broadcaster loop never waits on a foreign-loop writer or network send."""

    class CrossLoopSocket:
        def __init__(self) -> None:
            self.headers: dict[str, str] = {}
            self.messages: list[str] = []
            self.receive_started = threading.Event()
            self.first_send_started = threading.Event()
            self.release_first_send = threading.Event()
            self.disconnect_requested = threading.Event()
            self.all_sent = threading.Event()
            self._send_count = 0
            self._count_lock = threading.Lock()

        async def accept(self) -> None:
            return None

        async def send_text(self, message: str) -> None:
            with self._count_lock:
                self._send_count += 1
                send_count = self._send_count
            if send_count == 1:
                self.first_send_started.set()
                await asyncio.to_thread(self.release_first_send.wait)
            self.messages.append(message)
            if len(self.messages) == 2:
                self.all_sent.set()

        async def receive_text(self) -> str:
            self.receive_started.set()
            await asyncio.to_thread(self.disconnect_requested.wait)
            raise can.WebSocketDisconnect()

    registry = _OrderedClientRegistry()
    monkeypatch.setattr(can, "_clients", registry)
    monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 1.0)
    monkeypatch.setattr(can, "_CLIENT_DRAIN_TIMEOUT_SECONDS", 1.0, raising=False)
    original_frames = dict(can._last_frames)
    can._last_frames.clear()
    websocket = CrossLoopSocket()
    owner_errors: list[BaseException] = []
    owner_connections: list[object] = []
    broadcaster_errors: list[BaseException] = []
    broadcaster_done = threading.Event()
    broadcaster_loop_ready = threading.Event()
    broadcaster_loops: list[asyncio.AbstractEventLoop] = []

    def owner_worker() -> None:
        async def scenario() -> None:
            socket_task = asyncio.create_task(can.can_socket(websocket))
            await asyncio.to_thread(websocket.receive_started.wait)
            owner_connections.append(next(iter(registry)))
            await can.broadcast(
                can.build_event(
                    "0x200",
                    ["01"],
                    timestamp_ms=70,
                    channel="vcan0",
                )
            )
            await socket_task

        try:
            asyncio.run(scenario())
        except BaseException as error:
            owner_errors.append(error)

    def broadcaster_worker() -> None:
        loop = asyncio.new_event_loop()
        broadcaster_loops.append(loop)
        broadcaster_loop_ready.set()
        try:
            loop.run_until_complete(
                can.broadcast(
                    can.build_event(
                        "0x200",
                        ["00"],
                        timestamp_ms=71,
                        channel="vcan0",
                    )
                )
            )
        except BaseException as error:
            broadcaster_errors.append(error)
        finally:
            broadcaster_done.set()
            loop.close()

    owner_thread = threading.Thread(target=owner_worker)
    broadcaster_thread = threading.Thread(target=broadcaster_worker)
    completed_while_owner_send_stalled = False
    try:
        owner_thread.start()
        assert websocket.receive_started.wait(2)
        assert websocket.first_send_started.wait(2)
        broadcaster_thread.start()
        assert broadcaster_loop_ready.wait(2)

        completed_while_owner_send_stalled = broadcaster_done.wait(0.2)
    finally:
        websocket.release_first_send.set()
        for loop in broadcaster_loops:
            if not loop.is_closed():
                loop.call_soon_threadsafe(lambda: None)
        broadcaster_thread.join(2)
        websocket.disconnect_requested.set()
        owner_thread.join(2)
        can._last_frames.clear()
        can._last_frames.update(original_frames)

    assert completed_while_owner_send_stalled is True
    assert not owner_thread.is_alive()
    assert not broadcaster_thread.is_alive()
    assert owner_errors == []
    assert broadcaster_errors == []
    delivered = [json.loads(message) for message in websocket.messages]
    assert [event["timestamp"] for event in delivered] == [70, 71]
    assert len(registry) == 0
    assert len(owner_connections) == 1
    connection = owner_connections[0]
    assert connection.evicted is True
    assert list(connection.backlog) == []
    assert connection.writer_task is None


def test_foreign_thread_only_schedules_asyncio_access_on_client_owner_loop(
    monkeypatch,
) -> None:
    """Foreign publishers may call only the loop's thread-safe scheduling API."""

    registry = _OrderedClientRegistry()
    monkeypatch.setattr(can, "_clients", registry)
    owner_ready = threading.Event()
    signal_seen = threading.Event()
    cancel_seen = threading.Event()
    send_seen = threading.Event()
    owner_errors: list[BaseException] = []
    state: dict[str, object] = {}

    class OwnerOnlyEvent:
        def __init__(self, event: asyncio.Event, owner_ident: int) -> None:
            self._event = event
            self._owner_ident = owner_ident

        def _assert_owner(self) -> None:
            assert threading.get_ident() == self._owner_ident

        def is_set(self) -> bool:
            self._assert_owner()
            return self._event.is_set()

        def set(self) -> None:
            self._assert_owner()
            self._event.set()
            signal_seen.set()

        async def wait(self) -> bool:
            self._assert_owner()
            return await self._event.wait()

    class OwnerOnlyTask:
        def __init__(self, task: asyncio.Task[None], owner_ident: int) -> None:
            self._task = task
            self._owner_ident = owner_ident

        def _assert_owner(self) -> None:
            assert threading.get_ident() == self._owner_ident

        def done(self) -> bool:
            self._assert_owner()
            return self._task.done()

        def cancel(self) -> bool:
            self._assert_owner()
            cancel_seen.set()
            return self._task.cancel()

    class OwnerOnlyLoop:
        def __init__(
            self,
            loop: asyncio.AbstractEventLoop,
            owner_ident: int,
        ) -> None:
            self._loop = loop
            self._owner_ident = owner_ident

        def _assert_owner(self) -> None:
            assert threading.get_ident() == self._owner_ident

        def is_closed(self) -> bool:
            self._assert_owner()
            return self._loop.is_closed()

        def create_task(self, coroutine: object) -> asyncio.Task[None]:
            self._assert_owner()
            return self._loop.create_task(coroutine)

        def call_soon_threadsafe(self, callback: object, *args: object) -> object:
            return self._loop.call_soon_threadsafe(callback, *args)

    class FastSocket:
        async def send_text(self, _message: str) -> None:
            send_seen.set()

    def owner_worker() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        owner_ident = threading.get_ident()
        guarded_loop = OwnerOnlyLoop(loop, owner_ident)
        try:
            signal_client = can._ClientConnection(
                websocket=FastSocket(),
                loop=guarded_loop,
                evicted_event=OwnerOnlyEvent(asyncio.Event(), owner_ident),
                replaying=False,
            )
            never_set = asyncio.Event()
            actual_task = loop.create_task(never_set.wait())
            cancel_client = can._ClientConnection(
                websocket=FastSocket(),
                loop=guarded_loop,
                evicted_event=OwnerOnlyEvent(asyncio.Event(), owner_ident),
                writer_task=OwnerOnlyTask(actual_task, owner_ident),
                replaying=False,
            )
            schedule_client = can._ClientConnection(
                websocket=FastSocket(),
                loop=guarded_loop,
                evicted_event=OwnerOnlyEvent(asyncio.Event(), owner_ident),
                replaying=False,
            )
            with can._echo_state_lock:
                registry.add(schedule_client)
                schedule_client.backlog.append("{}")
            state.update(
                loop=loop,
                signal_client=signal_client,
                cancel_client=cancel_client,
                cancel_task=cancel_client.writer_task,
                schedule_client=schedule_client,
            )
            owner_ready.set()
            loop.run_forever()
        except BaseException as error:
            owner_errors.append(error)
            owner_ready.set()
        finally:
            with can._echo_state_lock:
                registry.clear()
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()

    owner_thread = threading.Thread(target=owner_worker)
    foreign_errors: list[BaseException] = []
    owner_thread.start()
    try:
        assert owner_ready.wait(2)
        assert owner_errors == []
        for operation in (
            lambda: can._signal_client_evicted(state["signal_client"]),
            lambda: can._cancel_client_writer(
                state["cancel_client"],
                state["cancel_task"],
            ),
            lambda: can._schedule_client_drain(state["schedule_client"]),
        ):
            try:
                operation()
            except BaseException as error:
                foreign_errors.append(error)

        assert foreign_errors == []
        assert signal_seen.wait(1)
        assert cancel_seen.wait(1)
        assert send_seen.wait(1)
    finally:
        loop = state.get("loop")
        if loop is not None:
            loop.call_soon_threadsafe(loop.stop)
        owner_thread.join(2)

    assert not owner_thread.is_alive()
    assert owner_errors == []


def test_replay_overflow_stops_already_captured_backlog_after_eviction(
    monkeypatch,
) -> None:
    """Eviction prevents a replay handoff from sending its remaining local batch."""

    class ReplayOverflowSocket:
        def __init__(self) -> None:
            self.headers: dict[str, str] = {}
            self.messages: list[str] = []
            self.snapshot_send_started = asyncio.Event()
            self.release_snapshot = asyncio.Event()
            self.pending_send_started = asyncio.Event()
            self.release_pending = asyncio.Event()
            self.disconnect_requested = asyncio.Event()
            self._send_count = 0

        async def accept(self) -> None:
            return None

        async def send_text(self, message: str) -> None:
            self._send_count += 1
            if self._send_count == 1:
                self.snapshot_send_started.set()
                await self.release_snapshot.wait()
            elif self._send_count == 2:
                self.pending_send_started.set()
                await self.release_pending.wait()
            self.messages.append(message)

        async def receive_text(self) -> str:
            await self.disconnect_requested.wait()
            raise can.WebSocketDisconnect()

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        monkeypatch.setattr(can, "_CLIENT_BACKLOG_MAX_MESSAGES", 2)
        monkeypatch.setattr(can, "_CLIENT_SEND_TIMEOUT_SECONDS", 1.0)
        monkeypatch.setattr(can, "_CLIENT_HANDOFF_TIMEOUT_SECONDS", 1.0)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        can._last_frames["0x200"] = can.build_event(
            "0x200",
            ["00"],
            timestamp_ms=0,
            channel="vcan0",
        )
        websocket = ReplayOverflowSocket()
        socket_task = asyncio.create_task(can.can_socket(websocket))
        connection: object | None = None
        try:
            await asyncio.wait_for(websocket.snapshot_send_started.wait(), 1)
            connection = next(iter(registry))
            for timestamp in (1, 2):
                await can.broadcast(
                    can.build_event(
                        "0x200",
                        [f"{timestamp:02X}"],
                        timestamp_ms=timestamp,
                        channel="vcan0",
                    )
                )

            websocket.release_snapshot.set()
            await asyncio.wait_for(websocket.pending_send_started.wait(), 1)
            for timestamp in (3, 4, 5):
                await can.broadcast(
                    can.build_event(
                        "0x200",
                        [f"{timestamp:02X}"],
                        timestamp_ms=timestamp,
                        channel="vcan0",
                    )
                )

            assert connection.evicted is True
            assert len(registry) == 0
            assert list(connection.backlog) == []
            websocket.release_pending.set()
            done, pending = await asyncio.wait({socket_task}, timeout=0.5)
            assert pending == set()
            assert done == {socket_task}

            delivered = [json.loads(message)["timestamp"] for message in websocket.messages]
            assert delivered == [0, 1]
        finally:
            websocket.release_snapshot.set()
            websocket.release_pending.set()
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


def test_ready_instant_websocket_survives_sequential_burst_over_backlog_cap(
    monkeypatch,
) -> None:
    """Sequential awaited publishers must let an instantaneous writer make progress."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        websocket = _ControlledCanSocket()
        socket_task = asyncio.create_task(can.can_socket(websocket))
        connection: object | None = None
        event_count = can._CLIENT_BACKLOG_MAX_MESSAGES + 1

        async def wait_for_all_messages() -> None:
            while len(websocket.messages) < event_count:
                await asyncio.sleep(0)

        try:
            await asyncio.wait_for(websocket.receive_started.wait(), 1)
            connection = next(iter(registry))

            for index in range(event_count):
                await can.broadcast(
                    can.build_event(
                        "0x200",
                        [f"{index % 256:02X}"],
                        timestamp_ms=1_000 + index,
                        channel="vcan0",
                    )
                )

            assert connection.evicted is False
            assert len(registry) == 1
            await asyncio.wait_for(wait_for_all_messages(), 1)
            delivered = [json.loads(message)["timestamp"] for message in websocket.messages]
            assert delivered == list(range(1_000, 1_000 + event_count))

            websocket.disconnect_requested.set()
            await asyncio.wait_for(socket_task, 0.5)
            assert len(registry) == 0
            assert connection.writer_task is None
        finally:
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())


@pytest.mark.parametrize("publisher", ["broadcast", "observed"])
def test_fast_replaying_websocket_survives_same_loop_burst_over_backlog_cap(
    monkeypatch,
    publisher: str,
) -> None:
    """A runnable replay handoff gets CPU while same-loop live frames are queued."""

    async def scenario() -> None:
        registry = _OrderedClientRegistry()
        monkeypatch.setattr(can, "_clients", registry)
        original_frames = dict(can._last_frames)
        can._last_frames.clear()
        can._last_frames["0x101"] = can.build_event(
            "0x101",
            ["AA"],
            timestamp_ms=999,
            channel="vcan0",
        )
        websocket = _ControlledCanSocket(block_first_send=True)
        socket_task = asyncio.create_task(can.can_socket(websocket))
        connection: object | None = None
        event_count = can._CLIENT_BACKLOG_MAX_MESSAGES * 4

        async def wait_for_all_messages() -> None:
            while len(websocket.messages) < event_count + 1:
                await asyncio.sleep(0)

        try:
            await asyncio.wait_for(websocket.send_started.wait(), 1)
            connection = next(iter(registry))
            assert connection.replaying is True

            # Waking the snapshot sender only makes it runnable.  The producer
            # below must yield explicitly or it will fill the replay backlog
            # before the handoff task gets another event-loop turn.
            websocket.release_send.set()
            for index in range(event_count):
                if publisher == "broadcast":
                    await can.broadcast(
                        can.build_event(
                            "0x200",
                            [f"{index % 256:02X}"],
                            timestamp_ms=1_000 + index,
                            channel="vcan0",
                        )
                    )
                else:
                    observed = can.parse_candump(
                        f"(2000.{index:06d}) vcan0 200#{index % 256:02X}"
                    )
                    assert observed is not None
                    assert await can.publish_observed_event(observed) is True

            assert connection.evicted is False
            assert len(registry) == 1
            await asyncio.wait_for(wait_for_all_messages(), 2)
            delivered = [json.loads(message) for message in websocket.messages]
            assert delivered[0]["replay"] is True
            assert delivered[0]["frame"] == {
                "canId": "0x101",
                "dlc": 1,
                "data": ["AA"],
            }
            live = delivered[1:]
            assert all(event.get("replay", False) is False for event in live)
            assert [event["frame"]["data"] for event in live] == [
                [f"{index % 256:02X}"] for index in range(event_count)
            ]

            websocket.disconnect_requested.set()
            await asyncio.wait_for(socket_task, 0.5)
            assert len(registry) == 0
            assert connection.writer_task is None
        finally:
            websocket.release_send.set()
            websocket.disconnect_requested.set()
            if not socket_task.done():
                socket_task.cancel()
            await asyncio.gather(socket_task, return_exceptions=True)
            can._last_frames.clear()
            can._last_frames.update(original_frames)

    asyncio.run(scenario())
