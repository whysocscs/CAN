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
        "lab": {"labId": "door-blackbox-v1", "sessionId": session_id, "generation": 0},
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
    assert emitted[0]["lab"] == {"labId": "door-blackbox-v1", "sessionId": session_id, "generation": 0}


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
        {"labId": "door-blackbox-v1", "sessionId": session_id, "generation": 0},
    ] * 3
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

    broadcast_paused = threading.Event()
    resume_broadcast = threading.Event()
    original_broadcast = can.broadcast
    publish_results: list[bool] = []
    worker_errors: list[BaseException] = []

    async def pausing_broadcast(
        event: dict[str, object],
        **kwargs: object,
    ) -> None:
        broadcast_paused.set()
        await asyncio.to_thread(resume_broadcast.wait)
        await original_broadcast(event, **kwargs)

    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    original_tombstones = deque(can._cleared_echo_tombstones)
    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", fake_subprocess_exec)
    monkeypatch.setattr(can.time, "time", lambda: 1_000.0)
    monkeypatch.setattr(can, "broadcast", pausing_broadcast)
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
        assert broadcast_paused.wait(2)
        assert asyncio.run(can.clear_snapshot()) == {"cleared": 1}
        resume_broadcast.set()
        publish_thread.join(2)
        assert not publish_thread.is_alive()
        assert worker_errors == []
        assert publish_results == [True]
        assert not can._last_frames
        assert not can._pending_echoes
        assert not can._cleared_echo_tombstones
    finally:
        resume_broadcast.set()
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
