"""The editable upload path stays local, bounded, and shares the old IPC lock."""

import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from repro.swupdate_http_probe import build_request


BOUNDARY = "ABC"
FINAL = r"\r\n--ABC--"
LENGTH = 125


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CANLITE_SWUPDATE_REPRO_ROOT", "/tmp/swupdate-test-builds")
    from server.routers import swupdate_repro

    app = FastAPI()
    app.include_router(swupdate_repro.router)
    return TestClient(app)


def _body(**overrides):
    body = {
        "variant": "vulnerable",
        "boundary": BOUNDARY,
        "terminalChunkEscaped": FINAL,
        "declaredContentLength": LENGTH,
    }
    body.update(overrides)
    return body


def _fake_result(variant="vulnerable"):
    request = build_request(
        boundary=BOUNDARY, terminal_chunk_escaped=FINAL,
        declared_content_length=LENGTH,
    )
    return {
        "evidenceKind": "actual_process", "variant": variant,
        "serverLog": "Image invalid or corrupted. Not installing",
        "request": {
            "firstChunkHex": (request.header + request.prefix).hex(),
            "finalChunkHex": request.final_chunk.hex(),
            "declaredContentLength": LENGTH, "actualBodyLength": LENGTH,
            "httpResponse": "HTTP/1.1 200 OK\r\n\r\nOk, probe.swu - -2 bytes.",
            "serverAcceptsNewConnections": True,
            "transmissionComplete": True,
        },
        "observation": {
            "ipcBadAddress": True, "reportedBytes": -2,
            "negativeReportedLength": True,
            "serverAliveAfterRequest": True,
            "invalidImageNotInstalled": True,
        },
    }


def test_accepts_valid_custom_request(client, monkeypatch):
    from server.routers import swupdate_repro

    seen = []
    def fake_run(**kwargs):
        seen.append(kwargs)
        return _fake_result(kwargs["variant"])
    monkeypatch.setattr(swupdate_repro, "run_custom_repro_process", fake_run, raising=False)
    response = client.post("/labs/repro/swupdate/send", json=_body())
    assert response.status_code == 200
    assert response.json()["request"]["actualBodyLength"] == LENGTH
    assert seen[0]["declared_content_length"] == LENGTH
    assert seen[0]["terminal_chunk_escaped"] == FINAL


@pytest.mark.parametrize("overrides", [
    {"boundary": "ABC;exit"},
    {"boundary": "한글"},
    {"terminalChunkEscaped": r"\r\n--ABD--"},
    {"terminalChunkEscaped": "\r\n--ABC--"},
    {"declaredContentLength": LENGTH - 1},
    {"declaredContentLength": "125"},
    {"variant": "remote"},
    {"url": "https://other-host/upload"},
])
def test_rejects_malformed_input_before_runner(client, monkeypatch, overrides):
    from server.routers import swupdate_repro

    called = []
    monkeypatch.setattr(swupdate_repro, "run_custom_repro_process", lambda **_: called.append(True), raising=False)
    response = client.post("/labs/repro/swupdate/send", json=_body(**overrides))
    assert response.status_code == 422
    assert called == []


def test_rejects_nonlocal_client(monkeypatch):
    from server.routers import swupdate_repro

    monkeypatch.setenv("CANLITE_SWUPDATE_REPRO_ROOT", "/tmp/swupdate-test-builds")
    app = FastAPI()
    app.include_router(swupdate_repro.router)
    client = TestClient(app, client=("203.0.113.5", 12345))
    assert client.post("/labs/repro/swupdate/send", json=_body()).status_code == 403


def test_missing_build_is_503(client, monkeypatch):
    monkeypatch.delenv("CANLITE_SWUPDATE_REPRO_ROOT")
    response = client.post("/labs/repro/swupdate/send", json=_body())
    assert response.status_code == 503


def test_old_and_new_routes_share_lock(monkeypatch):
    from server.labs import swupdate_repro

    active = 0
    highest = 0
    guard = threading.Lock()

    def fake_subprocess(*args, **kwargs):
        nonlocal active, highest
        with guard:
            active += 1
            highest = max(highest, active)
        time.sleep(0.03)
        with guard:
            active -= 1
        variant = args[0][args[0].index("--variant") + 1]
        return subprocess.CompletedProcess(args[0], 0, json.dumps(_fake_result(variant)), "")

    monkeypatch.setattr(swupdate_repro.subprocess, "run", fake_subprocess)
    with ThreadPoolExecutor(max_workers=2) as pool:
        old = pool.submit(swupdate_repro.run_repro_process, root="/tmp/builds", distro="Ubuntu-22.04",
                          variant="vulnerable", boundary=BOUNDARY, mode="truncated")
        new = pool.submit(swupdate_repro.run_custom_repro_process, root="/tmp/builds", distro="Ubuntu-22.04",
                          variant="patched", boundary=BOUNDARY, terminal_chunk_escaped=FINAL,
                          declared_content_length=LENGTH)
        assert old.result()["variant"] == "vulnerable"
        assert new.result()["variant"] == "patched"
    assert highest == 1


def test_timeout_releases_lock(monkeypatch):
    from server.labs import swupdate_repro

    calls = 0
    def fake_subprocess(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise subprocess.TimeoutExpired(args[0], 90)
        return subprocess.CompletedProcess(args[0], 0, json.dumps(_fake_result()), "")

    monkeypatch.setattr(swupdate_repro.subprocess, "run", fake_subprocess)
    params = dict(root="/tmp/builds", distro="Ubuntu-22.04", variant="vulnerable",
                  boundary=BOUNDARY, terminal_chunk_escaped=FINAL, declared_content_length=LENGTH)
    with pytest.raises(RuntimeError, match="could not run"):
        swupdate_repro.run_custom_repro_process(**params)
    assert swupdate_repro.run_custom_repro_process(**params)["evidenceKind"] == "actual_process"


def test_rejects_incomplete_transmission_even_with_expected_hex(monkeypatch):
    from server.labs import swupdate_repro

    incomplete = _fake_result()
    incomplete["request"]["transmissionComplete"] = False
    monkeypatch.setattr(swupdate_repro.subprocess, "run", lambda command, **kwargs:
                        subprocess.CompletedProcess(command, 0, json.dumps(incomplete), ""))
    with pytest.raises(RuntimeError, match="incomplete"):
        swupdate_repro.run_custom_repro_process(
            root="/tmp/builds", distro="Ubuntu-22.04", variant="vulnerable",
            boundary=BOUNDARY, terminal_chunk_escaped=FINAL, declared_content_length=LENGTH,
        )
