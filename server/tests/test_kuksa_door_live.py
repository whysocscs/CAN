"""The door signal is a separate live experiment, not the public CargoVersion PoC."""

import base64
import json
import os
import subprocess
from pathlib import Path

import pytest


TARGET = "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"


def _vss_file(tmp_path: Path, *, datatype: str = "boolean", include: bool = True) -> Path:
    leaf = {"datatype": datatype, "type": "actuator"} if include else None
    children = {"IsOpen": leaf} if leaf is not None else {}
    tree = {"Vehicle": {"children": {"Cabin": {"children": {
        "Door": {"children": {"Row1": {"children": {
            "DriverSide": {"children": children},
        }}}},
    }}}}}
    path = tmp_path / "vss.json"
    path.write_text(json.dumps(tree), encoding="utf-8")
    return path


def test_rejects_missing_or_non_boolean_door_metadata(tmp_path):
    from repro.kuksa_door_session import require_door_metadata

    assert require_door_metadata(_vss_file(tmp_path)) == {
        "path": TARGET, "datatype": "boolean", "type": "actuator",
    }
    with pytest.raises(ValueError, match="door signal"):
        require_door_metadata(_vss_file(tmp_path, include=False))
    with pytest.raises(ValueError, match="boolean"):
        require_door_metadata(_vss_file(tmp_path, datatype="string"))


def test_rejects_unpinned_source_or_bad_scope(tmp_path):
    from repro.kuksa_door_session import require_door_client_source
    from repro.kuksa_live_run import require_token_scope

    example = tmp_path / "kuksa_door_session.rs"
    example.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="source"):
        require_door_client_source(example)

    claims = base64.urlsafe_b64encode(json.dumps({
        "scope": "provide", "aud": ["kuksa.val"], "exp": 1861919999,
    }).encode()).decode().rstrip("=")
    token = tmp_path / "read-all.token"
    token.write_text(f"eyJhbGciOiJSUzI1NiJ9.{claims}.signature", encoding="utf-8")
    with pytest.raises(ValueError, match="scope"):
        require_token_scope(token, "read")


def test_stdout_is_one_event_per_command():
    from repro.kuksa_door_session import parse_client_result

    event = parse_client_result(
        "RESULT\t2\tread\tok\ttrue\t-\tOK\t-\t-",
        expected_seq=2, expected_action="read",
    )
    assert event["readValue"] is True
    assert event["signalPath"] == TARGET
    assert event["outcome"] == "ok"
    with pytest.raises(ValueError, match="protocol"):
        parse_client_result("debug: some unrelated line", expected_seq=2, expected_action="read")
    with pytest.raises(ValueError, match="sequence"):
        parse_client_result(
            "RESULT\t1\tread\tok\ttrue\t-\tOK\t-\t-",
            expected_seq=2, expected_action="read",
        )


@pytest.mark.skipif(os.name != "nt", reason="Windows Path conversion is the subject")
def test_wsl_root_remains_posix_at_process_boundary(monkeypatch):
    from repro import kuksa_door_session

    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        return subprocess.CompletedProcess(
            command, 0,
            json.dumps({"kind": "ready", "evidenceKind": "actual_process"}) + "\n",
            "",
        )

    monkeypatch.setattr(kuksa_door_session.subprocess, "run", fake_run)
    assert kuksa_door_session.run_scripted_session(
        root=Path("/home/dddd/.cache/cangraph-kuksa-repro"),
        variant="vulnerable", commands=[],
    ) == []
    index = captured["command"].index("--root")
    assert captured["command"][index + 1] == "/home/dddd/.cache/cangraph-kuksa-repro"


@pytest.mark.skipif(
    not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"),
    reason="local pinned KUKSA builds not configured",
)
@pytest.mark.parametrize("variant,role,accepted", [
    ("vulnerable", "read", True),
    ("patched", "read", False),
    ("vulnerable", "provide", True),
])
def test_live_door_provider_registration_and_repeated_read(variant, role, accepted):
    from repro.kuksa_door_session import run_scripted_session

    events = run_scripted_session(
        root=Path(os.environ["CANLITE_KUKSA_REPRO_ROOT"]),
        variant=variant,
        commands=[
            {"seq": 1, "action": "metadata"},
            {"seq": 2, "action": "read"},
            {"seq": 3, "action": "register", "providerRole": role, "providedOpen": True},
            {"seq": 4, "action": "read"},
            {"seq": 5, "action": "read"},
        ],
    )
    assert events[0]["signalPath"] == TARGET
    assert events[0]["signalType"] == "boolean"
    assert events[2]["registrationAccepted"] is accepted
    if accepted:
        assert events[3]["readValue"] is True
        assert events[4]["readValue"] is True
    else:
        assert events[2]["grpcStatus"] == "PermissionDenied"
        assert events[3].get("readValue") is not True
        assert events[4].get("readValue") is not True
