from __future__ import annotations

from dataclasses import FrozenInstanceError, replace
import importlib

import pytest


PUBLIC_STATE_FIELDS = {
    "labId",
    "scenario",
    "sessionId",
    "generation",
    "stage",
    "targetLabel",
    "targetNode",
    "effectTarget",
    "vehicleState",
    "evidence",
    "attemptCount",
    "lastVerdict",
    "completed",
}


def _domain():
    try:
        return importlib.import_module("server.labs.can_attack_basics")
    except (ImportError, AttributeError) as exc:
        pytest.fail(f"beginner CAN attack domain is missing: {exc}")


def _session(scenario: str, session_id: str = "session-a"):
    module = _domain()
    return module.BeginnerCanAttackSession(scenario=scenario, session_id=session_id)


def test_scenario_specs_are_immutable_and_keep_distinct_private_contracts() -> None:
    module = _domain()
    spoofing = module.SCENARIO_SPECS["spoofing"]
    replay = module.SCENARIO_SPECS["replay"]

    assert (spoofing.lab_id, spoofing.target_can_id, spoofing.success_payload) == (
        "can-spoofing-basic-v1",
        "0x5A1",
        ("01",),
    )
    assert (replay.lab_id, replay.target_can_id, replay.captured_payload) == (
        "can-replay-basic-v1",
        "0x5A2",
        ("00", "01"),
    )
    with pytest.raises(FrozenInstanceError):
        spoofing.lab_id = "changed"


@pytest.mark.parametrize("scenario", ["spoofing", "replay"])
def test_initial_public_state_has_only_safe_fields_and_no_answer_material(scenario: str) -> None:
    state = _session(scenario).public_state()

    assert set(state) == PUBLIC_STATE_FIELDS
    assert state["vehicleState"] == {
        "leftDoor": "closed",
        "rightDoor": "closed",
        "tailgate": "closed",
    }
    assert state["generation"] == 0
    assert state["stage"] == "RECON"
    assert state["completed"] is False
    serialized = repr(state).lower()
    for private_answer in ("5a1", "5a2", "capture.log", "cansend", "canplayer", "#01", "#0001"):
        assert private_answer not in serialized


def test_spoofing_observation_reveals_only_normal_frame_then_altered_payload_completes() -> None:
    session = _session("spoofing")

    observed = session.execute_terminal("candump -L vcan0")
    message_map = session.execute_terminal("cat message-map.txt")
    executed = session.execute_terminal("cansend vcan0 5A1#01")

    assert observed.ok is True
    assert "5A1#00" in observed.output
    assert "5A1#01" not in observed.output
    assert "00=tailgate closed" in message_map.output
    assert "01=tailgate open" in message_map.output
    assert executed.code == "EXECUTED"
    assert executed.ids_status == "NORMAL"
    assert "limited Toy allowlist/freshness gap" in executed.output
    assert "not a real IDS bypass" in executed.output
    assert executed.attempts[0].accepted is True
    assert executed.state["vehicleState"]["tailgate"] == "open"
    assert executed.state["stage"] == "EVIDENCE"
    assert executed.state["completed"] is True


@pytest.mark.parametrize(
    ("command", "code"),
    [
        ("cansend vcan0 5A2#01", "TARGET_ID_MISMATCH"),
        ("cansend vcan0 5A1#0100", "LENGTH_INVALID"),
        ("cansend vcan0 5A1#00", "STATE_NOT_ALTERED"),
        ("cansend vcan0 5A1#02", "STATE_INVALID"),
        ("canplayer -I capture.log -l 1", "SCENARIO_COMMAND_UNSUPPORTED"),
    ],
)
def test_spoofing_rejects_wrong_id_dlc_state_and_method(command: str, code: str) -> None:
    result = _session("spoofing").execute_terminal(command)

    assert result.ok is False
    assert result.code == code
    assert result.state["completed"] is False


def test_replay_requires_current_same_session_unmodified_capture_and_exact_repeat_count() -> None:
    module = _domain()
    session = _session("replay", "session-a")

    before_capture = session.execute_terminal("canplayer -I capture.log -l 1")
    captured = session.execute_terminal("candump -L vcan0 > capture.log")
    inspected = session.execute_terminal("cat capture.log")

    assert before_capture.code == "CAPTURE_REQUIRED"
    assert captured.code == "CAPTURED"
    assert len(captured.captures) == 1
    assert "5A2#0001" in inspected.output

    original = session._capture_files["capture.log"]
    variants = (
        (replace(original, session_id="foreign"), "CAPTURE_SESSION_MISMATCH"),
        (replace(original, generation=99), "CAPTURE_GENERATION_MISMATCH"),
        (replace(original, data=("01", "01")), "CAPTURE_CONTENT_MISMATCH"),
    )
    for capture, expected_code in variants:
        session._capture_files["capture.log"] = capture
        rejected = session.execute_terminal("canplayer -I capture.log -l 1")
        assert rejected.code == expected_code
        assert rejected.state["completed"] is False

    session._capture_files["capture.log"] = original
    wrong_file = session.execute_terminal("canplayer -I unknown.log -l 1")
    wrong_repeat = session.execute_terminal("canplayer -I capture.log -l 2")
    noncanonical_repeat = session.execute_terminal("canplayer -I capture.log -l 01")
    assert wrong_file.code == "CAPTURE_FILE_UNKNOWN"
    assert wrong_repeat.code == "REPEAT_COUNT_INVALID"
    assert noncanonical_repeat.code == "REPEAT_COUNT_INVALID"

    executed = session.execute_terminal("canplayer -I capture.log -l 1")
    assert executed.code == "EXECUTED"
    assert executed.ids_status == "NORMAL"
    assert executed.attempts[0].data == ("00", "01")
    assert executed.state["vehicleState"] == {
        "leftDoor": "open",
        "rightDoor": "closed",
        "tailgate": "closed",
    }
    assert executed.state["completed"] is True


@pytest.mark.parametrize(
    "command",
    [
        "pwd; whoami",
        "pwd && whoami",
        "pwd | whoami",
        "echo $(whoami)",
        "echo `whoami`",
        "cat /etc/passwd",
        "cat ../capture.log",
        "candump -L can0",
        "cansend can0 5A1#01",
        "cansend vcan0 5A1#01 > out",
    ],
)
def test_virtual_terminal_rejects_injection_host_paths_and_unknown_forms(command: str) -> None:
    result = _session("spoofing").execute_terminal(command)

    assert result.ok is False
    assert result.code in {"UNSAFE_SYNTAX", "HOST_PATH_REJECTED", "COMMAND_REJECTED"}
    assert result.attempts == ()


def test_terminal_and_script_bounds_and_final_action_grammar_are_enforced() -> None:
    spoofing = _session("spoofing")

    assert spoofing.execute_terminal("x" * 513).code == "COMMAND_TOO_LARGE"
    assert spoofing.run_script("x" * 4097).code == "SCRIPT_TOO_LARGE"
    assert spoofing.run_script("\n".join("# comment" for _ in range(21))).code == "SCRIPT_TOO_MANY_LINES"
    assert spoofing.run_script("pwd\ncansend vcan0 5A1#01").code == "SCRIPT_COMMAND_INVALID"
    assert spoofing.run_script(
        "cansend vcan0 5A1#01\ncansend vcan0 5A1#01"
    ).code == "SCRIPT_ACTION_COUNT_INVALID"

    clean = _session("spoofing")
    executed = clean.run_script("# one safe final action\ncansend vcan0 5A1#01")
    assert executed.code == "EXECUTED"
    assert executed.state["completed"] is True


def test_reset_increments_generation_clears_capture_and_never_reuses_opaque_ids() -> None:
    replay = _session("replay", "session-a")
    first_capture = replay.execute_terminal("candump -L vcan0 > capture.log").captures[0]
    first_attempt = replay.execute_terminal("canplayer -I capture.log -l 2").attempts[0]

    reset_state = replay.reset()
    after_reset = replay.execute_terminal("canplayer -I capture.log -l 1")
    second_capture = replay.execute_terminal("candump -L vcan0 > capture.log").captures[0]
    second_attempt = replay.execute_terminal("canplayer -I capture.log -l 2").attempts[0]

    assert reset_state["generation"] == 1
    assert reset_state["attemptCount"] == 0
    assert reset_state["evidence"] == []
    assert after_reset.code == "CAPTURE_REQUIRED"
    assert first_capture.capture_id != second_capture.capture_id
    assert first_attempt.attempt_id != second_attempt.attempt_id
