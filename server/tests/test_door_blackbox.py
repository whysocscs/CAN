from __future__ import annotations

from server.labs.door_blackbox import DoorBlackboxSession


def valid_open_script(*, interval_ms: int = 100) -> str:
    return "\n".join(
        (
            f"interval_ms={interval_ms}",
            "cansend vcan0 101#000113B7",
            "cansend vcan0 101#000114B0",
            "cansend vcan0 101#000115B1",
        )
    )


def test_known_capture_checksum_is_accepted_before_counter_validation() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 101#010110B5")

    assert result.attempts[0].verdict == "COUNTER_REJECTED"


def test_invalid_checksum_is_blocked_without_changing_vehicle_state() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 101#00011300")

    assert result.attempts[0].verdict == "CHECKSUM_INVALID"
    assert result.state["vehicleState"] == {"leftDoor": "closed", "rightDoor": "closed"}


def test_replayed_counter_is_blocked_after_a_valid_frame() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 101#000113B7\ncansend vcan0 101#000113B7")

    assert [attempt.verdict for attempt in result.attempts] == ["EXECUTED", "COUNTER_REJECTED"]


def test_valid_frame_after_replay_failure_advances_out_of_replay_stage() -> None:
    session = DoorBlackboxSession(session_id="test")

    session.run_script("cansend vcan0 101#000113B7")
    replay = session.run_script("cansend vcan0 101#000113B7")
    recovered = session.run_script("cansend vcan0 101#000114B0")

    assert replay.state["stage"] == "Replay 실패"
    assert recovered.attempts[0].verdict == "EXECUTED"
    assert recovered.state["stage"] == "IDS 검증"


def test_single_valid_frame_updates_toy_vehicle_but_alerts_ids() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 101#000113B7")

    assert result.attempts[0].verdict == "EXECUTED"
    assert result.ids_status == "ALERT"
    assert result.state["vehicleState"]["leftDoor"] == "open"
    assert result.state["completed"] is False


def test_three_valid_100ms_frames_complete_the_toy_ids_sequence() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script(valid_open_script())

    assert [attempt.verdict for attempt in result.attempts] == ["EXECUTED"] * 3
    assert result.ids_status == "NORMAL"
    assert result.state["completed"] is True


def test_virtual_terminal_allows_only_educational_whitelist_commands() -> None:
    session = DoorBlackboxSession(session_id="test")

    results = [
        session.execute_terminal("pwd"),
        session.execute_terminal("whoami"),
        session.execute_terminal("ls"),
        session.execute_terminal("cat baseline.log"),
        session.execute_terminal("ip link show dev vcan0"),
        session.execute_terminal("candump -L vcan0"),
    ]

    assert all(result.ok for result in results)
    assert "101#010110B5" in results[3].output
    assert results[5].frames


def test_virtual_terminal_rejects_unknown_commands_without_execution() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.execute_terminal("echo should-not-run")

    assert result.ok is False
    assert result.code == "COMMAND_REJECTED"


def test_script_rejects_size_line_and_interval_limit_violations() -> None:
    session = DoorBlackboxSession(session_id="test")

    too_large = session.run_script("#" * 4097)
    too_many_lines = session.run_script("\n".join("# comment" for _ in range(21)))
    invalid_interval = session.run_script("interval_ms=9\ncansend vcan0 101#000113B7")

    assert too_large.error == "SCRIPT_TOO_LARGE"
    assert too_many_lines.error == "SCRIPT_TOO_MANY_LINES"
    assert invalid_interval.error == "INTERVAL_INVALID"


def test_public_state_does_not_expose_private_protocol_answers() -> None:
    state = DoorBlackboxSession(session_id="test").public_state()

    assert set(state) == {
        "sessionId",
        "stage",
        "targetLabel",
        "messageContractStatus",
        "vehicleState",
        "evidence",
        "attemptCount",
        "completed",
    }
    serialized = repr(state).lower()
    for private_term in ("checksum", "counter", "0xa5", "0x12", "0x13"):
        assert private_term not in serialized
