from __future__ import annotations

from server.labs.door_blackbox import DoorBlackboxSession


def valid_open_script(*, interval_ms: int = 100) -> str:
    return "\n".join(
        (
            f"interval_ms={interval_ms}",
            "cansend vcan0 456#000113B7",
            "cansend vcan0 456#000114B0",
            "cansend vcan0 456#000115B1",
        )
    )


def test_known_capture_checksum_is_accepted_before_counter_validation() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 456#010110B5")

    assert result.attempts[0].verdict == "COUNTER_REJECTED"


def test_invalid_checksum_is_blocked_without_changing_vehicle_state() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 456#00011300")

    assert result.attempts[0].verdict == "CHECKSUM_INVALID"
    assert result.state["vehicleState"] == {"leftDoor": "closed", "rightDoor": "closed"}


def test_replayed_counter_is_blocked_after_a_valid_frame() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 456#000113B7\ncansend vcan0 456#000113B7")

    assert [attempt.verdict for attempt in result.attempts] == ["EXECUTED", "COUNTER_REJECTED"]


def test_valid_frame_after_replay_failure_advances_out_of_replay_stage() -> None:
    session = DoorBlackboxSession(session_id="test")

    session.run_script("cansend vcan0 456#000113B7")
    replay = session.run_script("cansend vcan0 456#000113B7")
    recovered = session.run_script("cansend vcan0 456#000114B0")

    assert replay.state["stage"] == "Replay 실패"
    assert recovered.attempts[0].verdict == "EXECUTED"
    assert recovered.state["stage"] == "IDS 검증"


def test_single_valid_frame_updates_toy_vehicle_but_alerts_ids() -> None:
    session = DoorBlackboxSession(session_id="test")

    result = session.run_script("cansend vcan0 456#000113B7")

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
    assert "456#010110B5" in results[3].output
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
    invalid_interval = session.run_script("interval_ms=9\ncansend vcan0 456#000113B7")

    assert too_large.error == "SCRIPT_TOO_LARGE"
    assert too_many_lines.error == "SCRIPT_TOO_MANY_LINES"
    assert invalid_interval.error == "INTERVAL_INVALID"


def test_public_state_does_not_expose_private_protocol_answers() -> None:
    state = DoorBlackboxSession(session_id="test").public_state()

    assert set(state) == {
        "sessionId",
        "generation",
        "stage",
        "targetLabel",
        "messageContractStatus",
        "vehicleState",
        "evidence",
        "attemptCount",
        "completed",
    }
    serialized = repr(state).lower()
    for private_term in ("checksum", "counter", "0xa5", "0x12", "0x13", "0x456"):
        assert private_term not in serialized


def test_session_generation_starts_at_zero_and_increments_on_each_reset() -> None:
    session = DoorBlackboxSession(session_id="test")

    initial = session.public_state()
    session.reset()
    first_reset = session.public_state()
    session.reset()
    second_reset = session.public_state()

    assert [initial["generation"], first_reset["generation"], second_reset["generation"]] == [0, 1, 2]
    assert initial["sessionId"] == first_reset["sessionId"] == second_reset["sessionId"] == "test"


def test_attempt_generation_is_captured_before_a_later_reset() -> None:
    session = DoorBlackboxSession(session_id="test", clock_ms=lambda: 1)

    old_attempt = session.run_script("cansend vcan0 456#000113B7").attempts[0]
    session.reset()
    new_attempt = session.run_script("cansend vcan0 456#000113B7").attempts[0]

    assert (old_attempt.generation, new_attempt.generation) == (0, 1)


def test_capture_and_terminal_frames_keep_the_generation_at_processing_time() -> None:
    session = DoorBlackboxSession(session_id="test", clock_ms=lambda: 1)

    capture = session.execute_terminal("cat baseline.log")
    session.reset()
    terminal = session.execute_terminal("cansend vcan0 456#000113B7")

    assert capture.frames[0].generation == 0
    assert terminal.frames[0].generation == 1


def test_lab_target_isolated_from_public_tutorial_door_id() -> None:
    session = DoorBlackboxSession(session_id="test")

    public_tutorial_frame = session.run_script("cansend vcan0 101#000113B7")
    lab_frame = session.run_script("cansend vcan0 456#000113B7")

    assert public_tutorial_frame.attempts[0].verdict == "TARGET_ID_MISMATCH"
    assert lab_frame.attempts[0].verdict == "EXECUTED"


def test_script_attempt_metadata_is_unique_and_tracks_declared_interval() -> None:
    session = DoorBlackboxSession(session_id="test", clock_ms=lambda: 1_700_000_000_000)

    result = session.run_script(valid_open_script(interval_ms=100))

    assert [attempt.attempt_id for attempt in result.attempts] == [
        "test-attempt-000001",
        "test-attempt-000002",
        "test-attempt-000003",
    ]
    assert [attempt.timestamp for attempt in result.attempts] == [
        1_700_000_000_000,
        1_700_000_000_100,
        1_700_000_000_200,
    ]


def test_attempt_id_is_not_reused_after_reset_in_the_same_session() -> None:
    session = DoorBlackboxSession(session_id="test", clock_ms=lambda: 1)

    first = session.run_script("cansend vcan0 456#000113B7").attempts[0]
    session.reset()
    second = session.run_script("cansend vcan0 456#000113B7").attempts[0]

    assert (first.attempt_id, second.attempt_id) == ("test-attempt-000001", "test-attempt-000002")


def test_capture_frames_keep_candump_epoch_timestamps_and_stable_capture_ids() -> None:
    session = DoorBlackboxSession(session_id="test", clock_ms=lambda: 1)

    capture = session.execute_terminal("cat baseline.log")

    assert [frame.attempt_id for frame in capture.frames[:2]] == [
        "test-capture-000001",
        "test-capture-000002",
    ]
    assert [frame.timestamp for frame in capture.frames[:2]] == [
        1_720_000_000_100,
        1_720_000_000_200,
    ]
