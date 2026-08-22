from __future__ import annotations

import asyncio
from collections import deque
import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from server.routers import can


def _router_module():
    try:
        return importlib.import_module("server.routers.can_attack_labs")
    except (ImportError, AttributeError) as exc:
        pytest.fail(f"beginner CAN attack API is missing: {exc}")


@pytest.fixture(autouse=True)
def isolate_sessions_and_can_snapshots():
    original_frames = dict(can._last_frames)
    original_pending = {key: deque(value) for key, value in can._pending_echoes.items()}
    module = None
    try:
        try:
            module = importlib.import_module("server.routers.can_attack_labs")
        except ImportError:
            pass
        if module is not None:
            module._sessions["spoofing"].clear()
            module._sessions["replay"].clear()
            module._active_correlations.clear()
        can._last_frames.clear()
        can._pending_echoes.clear()
        yield
    finally:
        can._last_frames.clear()
        can._last_frames.update(original_frames)
        can._pending_echoes.clear()
        can._pending_echoes.update(original_pending)
        if module is not None:
            module._sessions["spoofing"].clear()
            module._sessions["replay"].clear()
            module._active_correlations.clear()


def _client(*, emitted: list[dict[str, object]] | None = None) -> TestClient:
    module = _router_module()

    async def record(can_id: str, data: list[str], **metadata: object) -> bool:
        assert emitted is not None
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(module.router)
    if emitted is not None:
        app.dependency_overrides[module.get_virtual_event_publisher] = lambda: record
    return TestClient(app)


def test_create_get_reset_terminal_run_and_wrong_scenario_pair_contract() -> None:
    client = _client(emitted=[])

    spoofing = client.post("/labs/can-attacks/spoofing/sessions")
    assert spoofing.status_code == 201
    session_id = spoofing.json()["sessionId"]
    assert client.get(f"/labs/can-attacks/spoofing/sessions/{session_id}").status_code == 200
    assert client.get(f"/labs/can-attacks/replay/sessions/{session_id}").status_code == 404
    assert client.post("/labs/can-attacks/not-real/sessions").status_code == 404

    observed = client.post(
        f"/labs/can-attacks/spoofing/sessions/{session_id}/terminal",
        json={"command": "candump -L vcan0"},
    )
    executed = client.post(
        f"/labs/can-attacks/spoofing/sessions/{session_id}/run",
        json={"script": "# final action\ncansend vcan0 5A1#01"},
    )
    reset = client.post(f"/labs/can-attacks/spoofing/sessions/{session_id}/reset")

    assert observed.status_code == 200
    assert "5A1#00" in observed.json()["output"]
    assert executed.json()["code"] == "EXECUTED"
    assert reset.json()["generation"] == 1
    assert reset.json()["completed"] is False


def test_storage_is_bounded_to_128_sessions_per_scenario() -> None:
    module = _router_module()
    client = _client(emitted=[])

    created = [client.post("/labs/can-attacks/spoofing/sessions").json()["sessionId"] for _ in range(129)]

    assert len(module._sessions["spoofing"]) == 128
    assert created[0] not in module._sessions["spoofing"]
    assert created[-1] in module._sessions["spoofing"]


def test_capture_and_rejected_attempt_emit_zero_but_each_accepted_attack_emits_once() -> None:
    module = _router_module()
    emitted: list[dict[str, object]] = []
    client = _client(emitted=emitted)

    spoofing = client.post("/labs/can-attacks/spoofing/sessions").json()
    spoof_id = spoofing["sessionId"]
    client.post(
        f"/labs/can-attacks/spoofing/sessions/{spoof_id}/terminal",
        json={"command": "cansend vcan0 5A1#00"},
    )
    assert emitted == []
    client.post(
        f"/labs/can-attacks/spoofing/sessions/{spoof_id}/terminal",
        json={"command": "cansend vcan0 5A1#01"},
    )

    assert emitted == [
        {
            "can_id": "0x5A1",
            "data": ["01"],
            "context": {
                "command": "TRUNK_OPEN",
                "source": "obd",
                "target": "rear",
                "route": ["obd", "ids", "gateway", "rear"],
                "action": "TAILGATE_OPEN",
            },
            "processing": {"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
            "monitoring": {"idsObserved": True, "status": "NORMAL"},
            "lab": {
                "labId": "can-spoofing-basic-v1",
                "scenario": "spoofing",
                "sessionId": spoof_id,
                "generation": 0,
                "attemptId": emitted[0]["lab"]["attemptId"],
                "stage": "impact",
            },
        }
    ]

    replay = client.post("/labs/can-attacks/replay/sessions").json()
    replay_id = replay["sessionId"]
    capture = client.post(
        f"/labs/can-attacks/replay/sessions/{replay_id}/terminal",
        json={"command": "candump -L vcan0 > capture.log"},
    )
    rejected = client.post(
        f"/labs/can-attacks/replay/sessions/{replay_id}/terminal",
        json={"command": "canplayer -I capture.log -l 2"},
    )
    assert capture.json()["captures"][0]["verdict"] == "CAPTURED"
    assert rejected.json()["attempts"][0]["verdict"] == "REPEAT_COUNT_INVALID"
    assert len(emitted) == 1

    accepted = client.post(
        f"/labs/can-attacks/replay/sessions/{replay_id}/terminal",
        json={"command": "canplayer -I capture.log -l 1"},
    )
    assert accepted.json()["code"] == "EXECUTED"
    assert len(emitted) == 2
    replay_event = emitted[1]
    assert replay_event["context"] == {
        "command": "DOOR_LOCK",
        "source": "obd",
        "target": "body",
        "route": ["obd", "ids", "gateway", "body"],
        "action": "LEFT_DOOR_OPEN",
    }
    assert replay_event["lab"] == {
        "labId": "can-replay-basic-v1",
        "scenario": "replay",
        "sessionId": replay_id,
        "generation": 0,
        "attemptId": replay_event["lab"]["attemptId"],
        "stage": "impact",
    }
    assert "replay" not in {key for key in replay_event if key != "lab"}
    assert module._active_correlations == {
        "spoofing": (spoof_id, 0),
        "replay": (replay_id, 0),
    }


def test_real_virtual_replay_event_has_no_top_level_replay_marker() -> None:
    client = _client()
    session_id = client.post("/labs/can-attacks/replay/sessions").json()["sessionId"]
    client.post(
        f"/labs/can-attacks/replay/sessions/{session_id}/terminal",
        json={"command": "candump -L vcan0 > capture.log"},
    )
    response = client.post(
        f"/labs/can-attacks/replay/sessions/{session_id}/terminal",
        json={"command": "canplayer -I capture.log -l 1"},
    )

    assert response.json()["code"] == "EXECUTED"
    event = can._last_frames["0x5a2"]
    assert "replay" not in event
    assert event["lab"]["scenario"] == "replay"


def test_new_sessions_and_reset_clear_only_their_target_snapshots() -> None:
    for can_id in ("0x456", "0x101", "0x200", "0x5a1", "0x5a2"):
        can._last_frames[can_id] = can.build_event(can_id, ["01"], timestamp_ms=1, channel="vcan0")
    client = _client(emitted=[])

    spoofing = client.post("/labs/can-attacks/spoofing/sessions").json()
    assert set(can._last_frames) == {"0x456", "0x101", "0x200", "0x5a2"}
    replay = client.post("/labs/can-attacks/replay/sessions").json()
    assert set(can._last_frames) == {"0x456", "0x101", "0x200"}

    can._last_frames["0x5a1"] = can.build_event("0x5a1", ["01"], timestamp_ms=2, channel="vcan0")
    can._last_frames["0x5a2"] = can.build_event("0x5a2", ["00", "01"], timestamp_ms=2, channel="vcan0")
    client.post(f"/labs/can-attacks/spoofing/sessions/{spoofing['sessionId']}/reset")
    assert "0x5a1" not in can._last_frames
    assert set(can._last_frames) == {"0x456", "0x101", "0x200", "0x5a2"}
    assert replay["sessionId"]


def test_stale_session_and_generation_attempts_are_suppressed() -> None:
    module = _router_module()

    async def scenario() -> None:
        emitted: list[dict[str, object]] = []

        async def record(can_id: str, data: list[str], **metadata: object) -> bool:
            emitted.append({"can_id": can_id, "data": data, **metadata})
            return True

        old = await module.create_session("spoofing")
        old_id = str(old["sessionId"])
        old_session = module._sessions["spoofing"][old_id]
        accepted = old_session.execute_terminal("cansend vcan0 5A1#01").attempts[0]
        old_correlation = (old_id, 0)

        await module.reset_session("spoofing", old_id)
        assert await module._emit_if_active("spoofing", old_correlation, accepted, record) is False

        current = await module.create_session("spoofing")
        current_id = str(current["sessionId"])
        current_session = module._sessions["spoofing"][current_id]
        current_attempt = current_session.execute_terminal("cansend vcan0 5A1#01").attempts[0]
        await module.create_session("spoofing")
        assert await module._emit_if_active(
            "spoofing", (current_id, 0), current_attempt, record
        ) is False
        assert emitted == []

    asyncio.run(scenario())


def test_virtual_publisher_never_uses_socketcan_subprocess_even_when_mode_is_socketcan(monkeypatch) -> None:
    calls: list[tuple[object, ...]] = []

    async def forbidden(*args: object, **_kwargs: object):
        calls.append(args)
        raise AssertionError("virtual publisher must not call SocketCAN subprocess path")

    monkeypatch.setattr(can, "MODE", "socketcan")
    monkeypatch.setattr(can.asyncio, "create_subprocess_exec", forbidden)

    published = asyncio.run(
        can.publish_virtual_event(
            "0x5a1",
            ["01"],
            context={"command": "TRUNK_OPEN"},
            processing={"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
            monitoring={"idsObserved": True, "status": "NORMAL"},
            lab={"labId": "can-spoofing-basic-v1"},
        )
    )

    assert published is True
    assert calls == []
    assert can._pending_echoes == {}
    assert can._last_frames["0x5a1"]["frame"] == {
        "canId": "0x5a1",
        "dlc": 1,
        "data": ["01"],
    }
