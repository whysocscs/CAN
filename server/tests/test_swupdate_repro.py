"""A real SWUpdate process and its log determine the observed effect."""

import json
import os
import re
import subprocess

import pytest

from server.labs.swupdate_repro import run_repro_process


def test_http_response_reader_reassembles_split_headers_and_body():
    from repro.swupdate_http_probe import read_http_response

    body = b"Ok, probe.swu - -2 bytes.\r\n"
    header = (f"HTTP/1.1 200 OK\r\nContent-Length: {len(body)}\r\n"
              "Connection: close\r\n\r\n").encode("ascii")

    class SegmentedSocket:
        def __init__(self):
            self.chunks = [header[:18], header[18:], body[:8], body[8:]]

        def settimeout(self, timeout):
            assert timeout > 0

        def recv(self, size):
            chunk = self.chunks.pop(0) if self.chunks else b""
            assert len(chunk) <= size
            return chunk

    assert read_http_response(SegmentedSocket()) == header + body


def test_http_response_reader_has_a_byte_limit():
    from repro.swupdate_http_probe import read_http_response

    class LargeSocket:
        def settimeout(self, timeout):
            assert timeout > 0

        def recv(self, size):
            return b"X" * size

    assert len(read_http_response(LargeSocket(), max_bytes=64)) == 64


@pytest.mark.skipif(not os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT"), reason="local SWUpdate builds not configured")
@pytest.mark.parametrize(
    ("variant", "mode", "expected_reported_bytes"),
    (("vulnerable", "truncated", -2), ("patched", "truncated", 0),
     ("vulnerable", "complete", 0)),
)
def test_real_multipart_parser_before_and_after_fix(variant, mode, expected_reported_bytes):
    result = run_repro_process(
        root=os.environ["CANLITE_SWUPDATE_REPRO_ROOT"],
        distro="Ubuntu-22.04",
        variant=variant,
        boundary="ABC",
        mode=mode,
    )

    assert result["evidenceKind"] == "actual_process"
    assert result["request"]["transmissionComplete"] is True
    assert result["observation"]["reportedBytes"] == expected_reported_bytes
    assert result["observation"]["negativeReportedLength"] is (expected_reported_bytes < 0)
    assert result["observation"]["ipcBadAddress"] is False
    assert result["observation"]["serverAliveAfterRequest"] is True
    assert result["observation"]["invalidImageNotInstalled"] is True
    assert f"{expected_reported_bytes} bytes." in result["request"]["httpResponse"]
    assert result["serverLogTruncated"] is False
    assert result["serverLogTotalCharacters"] == len(result["serverLog"])


def test_swupdate_rejects_unbounded_boundary_before_starting_process():
    with pytest.raises(ValueError, match="boundary"):
        run_repro_process(root="/tmp/swupdate", distro="Ubuntu-22.04", variant="vulnerable", boundary="ABC; exit", mode="truncated")


@pytest.mark.parametrize("transmission_complete", (False, None))
def test_fixed_mode_rejects_incomplete_or_unverified_send(monkeypatch, transmission_complete):
    from server.labs import swupdate_repro

    request = {} if transmission_complete is None else {"transmissionComplete": False}
    result = {
        "evidenceKind": "actual_process", "variant": "patched", "request": request,
        "serverLog": "local test log",
        "observation": {
            "reportedBytes": None, "ipcBadAddress": False,
            "negativeReportedLength": False,
        },
    }
    monkeypatch.setattr(swupdate_repro.subprocess, "run", lambda command, **kwargs:
                        subprocess.CompletedProcess(command, 0, json.dumps(result), ""))
    with pytest.raises(RuntimeError, match="incomplete"):
        run_repro_process(root="/tmp/swupdate", distro="Ubuntu-22.04",
                          variant="patched", boundary="ABC", mode="complete")


def test_swupdate_does_not_claim_a_modified_tracked_upstream_as_pinned(tmp_path):
    from repro.swupdate_live_run import run

    source = tmp_path / "swupdate"
    source.mkdir()
    tracked = source / "mongoose_multipart.c"
    tracked.write_text("original")
    subprocess.run(["git", "init", "-q", str(source)], check=True)
    subprocess.run(["git", "-C", str(source), "add", tracked.name], check=True)
    subprocess.run([
        "git", "-C", str(source), "-c", "user.name=Test",
        "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
    ], check=True)
    tracked.write_text("modified")

    with pytest.raises(ValueError, match="tracked source differs"):
        run(tmp_path, "vulnerable", "ABC", "complete")


@pytest.mark.skipif(os.name != "nt", reason="WSL invocation is Windows-specific")
def test_swupdate_wsl_runner_has_an_inner_deadline_before_outer_kill(monkeypatch):
    from server.labs import swupdate_repro

    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["timeout"] = kwargs["timeout"]
        return subprocess.CompletedProcess(command, 1, "", "test-only failure")

    monkeypatch.setattr(swupdate_repro.subprocess, "run", fake_run)
    with pytest.raises(RuntimeError, match="test-only failure"):
        run_repro_process(root="/tmp/swupdate", distro="Ubuntu-22.04",
                          variant="patched", boundary="ABC", mode="complete")

    assert captured["command"][4:11] == ["timeout", "-s", "INT", "-k", "5s", "75s", "python3"]
    assert captured["timeout"] > 80


@pytest.mark.skipif(not os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT"), reason="local SWUpdate builds not configured")
def test_swupdate_web_server_is_bound_to_loopback_only():
    result = run_repro_process(
        root=os.environ["CANLITE_SWUPDATE_REPRO_ROOT"],
        distro="Ubuntu-22.04",
        variant="patched",
        boundary="ABC",
        mode="complete",
    )

    assert "listening on http://127.0.0.1:18086" in result["serverLog"]


@pytest.mark.skipif(not os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT"), reason="local SWUpdate builds not configured")
@pytest.mark.parametrize("mode", ("truncated", "complete"))
def test_declared_http_body_length_matches_actual_sent_bytes(mode):
    result = run_repro_process(
        root=os.environ["CANLITE_SWUPDATE_REPRO_ROOT"],
        distro="Ubuntu-22.04", variant="patched", boundary="ABC", mode=mode,
    )
    first = result["request"]["firstChunk"]
    final = result["request"]["finalChunk"]
    declared = int(re.search(r"Content-Length: (\d+)", first).group(1))
    actual = len(first.partition("\r\n\r\n")[2].encode("ascii")) + len(final.encode("ascii"))

    assert declared == actual
