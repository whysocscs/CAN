"""Exercise real process pipes and session lifecycle with a tiny local fake host."""

import json
import os
import subprocess
import sys
import time

import pytest


FAKE_HOST = r'''
import json
import sys

variant, mode = sys.argv[1:3]
commit = {
    "vulnerable": "2936b2511bfadc519694e25d12f92402bdd763f6",
    "patched": "c2d1a3d931a9343d8d98f9727b3007786ac0028b",
}[variant]
target = "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"
print(json.dumps({"kind":"ready", "evidenceKind":"actual_process",
    "variant":variant, "sourceCommit":commit, "targetPath":target}), flush=True)
registered = False
for line in sys.stdin:
    if mode == "broken":
        sys.exit(3)
    command = json.loads(line)
    action = command["action"]
    event = {"seq":command["seq"], "action":action,
        "outcome":"ok", "grpcStatus":"OK", "signalPath":target}
    if action == "metadata":
        event.update(signalType="boolean", signalId=100)
    elif action == "register":
        registered = variant == "vulnerable" or command["providerRole"] == "provide"
        event.update(registrationAccepted=registered)
        if not registered:
            event.update(outcome="denied", grpcStatus="PermissionDenied")
    elif action == "read":
        event["readValue"] = True if registered else None
    response = {"kind":"event", "evidenceKind":"actual_process",
        "variant":variant, "sourceCommit":commit, "event":event,
        "brokerLog":"fake broker evidence", "clientError":""}
    if mode == "oversize":
        print("X" * 9000, flush=True)
    else:
        print(json.dumps(response), flush=True)
'''


@pytest.fixture
def manager_factory(tmp_path, monkeypatch):
    script = tmp_path / "fake_host.py"
    script.write_text(FAKE_HOST, encoding="utf-8")
    processes = []
    real_popen = subprocess.Popen

    def make(mode="normal", idle_seconds=300):
        from server.labs import kuksa_hands_on

        monkeypatch.setattr(
            kuksa_hands_on,
            "_host_command",
            lambda *, root, distro, variant: [sys.executable, "-u", str(script), variant, mode],
        )

        def spawn(*args, **kwargs):
            process = real_popen(*args, **kwargs)
            processes.append(process)
            return process

        monkeypatch.setattr(kuksa_hands_on.subprocess, "Popen", spawn)
        return kuksa_hands_on.KuksaSessionManager(idle_seconds=idle_seconds), processes

    return make


def test_single_active_session(manager_factory):
    from server.labs.kuksa_hands_on import KuksaSessionConflict

    manager, processes = manager_factory()
    first = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="vulnerable")
    try:
        assert len(first["sessionId"]) >= 32
        with pytest.raises(KuksaSessionConflict):
            manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="patched")
        assert len(processes) == 1
        manager.close(session_id=first["sessionId"], revision=0)
        second = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="patched")
        assert second["sessionId"] != first["sessionId"]
        assert processes[0].poll() is not None
    finally:
        manager.shutdown()
    assert all(process.poll() is not None for process in processes)


def test_stale_revision(manager_factory):
    from server.labs.kuksa_hands_on import KuksaSessionConflict

    manager, _ = manager_factory()
    try:
        state = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="vulnerable")
        next_state, event = manager.execute(
            session_id=state["sessionId"], revision=0, command={"action": "metadata"},
        )
        assert next_state["revision"] == 1
        assert event["seq"] == 1
        with pytest.raises(KuksaSessionConflict):
            manager.execute(session_id=state["sessionId"], revision=0, command={"action": "read"})
        with pytest.raises(KuksaSessionConflict):
            manager.close(session_id=state["sessionId"], revision=0)
        manager.close(session_id=state["sessionId"], revision=1)
    finally:
        manager.shutdown()


def test_stream_survives_two_reads(manager_factory):
    manager, processes = manager_factory()
    try:
        state = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="vulnerable")
        for command in (
            {"action": "metadata"},
            {"action": "register", "providerRole": "read", "providedOpen": True},
            {"action": "read"},
            {"action": "read"},
        ):
            state, event = manager.execute(
                session_id=state["sessionId"], revision=state["revision"], command=command,
            )
            if command["action"] == "read":
                assert event["readValue"] is True
        assert state["revision"] == 4
        assert len(processes) == 1
        assert processes[0].poll() is None
    finally:
        manager.shutdown()


def test_idle_expiry_and_shutdown(manager_factory):
    manager, processes = manager_factory(idle_seconds=0.05)
    first = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="vulnerable")
    deadline = time.monotonic() + 2
    while processes[0].poll() is None and time.monotonic() < deadline:
        time.sleep(0.02)
    assert processes[0].poll() is not None
    second = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="patched")
    assert second["sessionId"] != first["sessionId"]
    manager.shutdown()
    manager.shutdown()
    assert processes[1].poll() is not None


@pytest.mark.parametrize("mode", ["broken", "oversize"])
def test_broken_pipe_and_oversize_output_close_child(manager_factory, mode):
    from server.labs.kuksa_hands_on import KuksaSessionUnavailable

    manager, processes = manager_factory(mode=mode)
    state = manager.start(root="/tmp/test-only", distro="Ubuntu-22.04", variant="vulnerable")
    with pytest.raises(KuksaSessionUnavailable):
        manager.execute(session_id=state["sessionId"], revision=0, command={"action": "read"})
    assert processes[0].poll() is not None
    manager.shutdown()


@pytest.mark.skipif(
    not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"),
    reason="local pinned KUKSA builds not configured",
)
def test_live_manager_releases_both_broker_ports():
    from server.labs.kuksa_hands_on import KuksaSessionManager

    manager = KuksaSessionManager()
    root = os.environ["CANLITE_KUKSA_REPRO_ROOT"]
    try:
        for variant in ("vulnerable", "patched", "vulnerable"):
            state = manager.start(root=root, distro="Ubuntu-22.04", variant=variant)
            state, event = manager.execute(
                session_id=state["sessionId"], revision=state["revision"],
                command={"action": "metadata"},
            )
            assert event["signalType"] == "boolean"
            assert event["signalPath"] == "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"
            manager.close(session_id=state["sessionId"], revision=state["revision"])
    finally:
        manager.shutdown()
