"""Compare one editable request against pinned real SWUpdate processes."""

import os

import pytest

from server.labs.swupdate_repro import run_custom_repro_process


@pytest.fixture(scope="module")
def real_results():
    root = os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT")
    if not root:
        pytest.skip("local pinned SWUpdate builds not configured")
    common = dict(
        root=root, distro="Ubuntu-22.04", boundary="ABC",
        terminal_chunk_escaped=r"\r\n--ABC--", declared_content_length=125,
    )
    return {
        variant: run_custom_repro_process(variant=variant, **common)
        for variant in ("vulnerable", "patched")
    }


def test_live_same_bytes_vulnerable_and_patched(real_results):
    vulnerable = real_results["vulnerable"]
    patched = real_results["patched"]
    for part in ("firstChunkHex", "finalChunkHex", "declaredContentLength", "actualBodyLength"):
        assert vulnerable["request"][part] == patched["request"][part]
    assert vulnerable["request"]["transmissionComplete"] is True
    assert patched["request"]["transmissionComplete"] is True
    assert vulnerable["request"]["declaredContentLength"] == 125
    assert vulnerable["request"]["finalChunkHex"] == b"\r\n--ABC--".hex()
    assert vulnerable["sourceCommit"] == "e3b3c977e200283c4eaacb7aa70b28f0cfbde704"
    assert patched["sourceCommit"] == "beee2dc0feef1cfe84f1aa6fc980e104b2e47a74"
    assert vulnerable["observation"]["reportedBytes"] == -2
    assert patched["observation"]["reportedBytes"] == 0
    assert "-2 bytes." in vulnerable["request"]["httpResponse"]
    assert "0 bytes." in patched["request"]["httpResponse"]


def test_live_server_stays_available_and_invalid_image_not_installed(real_results):
    for result in real_results.values():
        assert result["evidenceKind"] == "actual_process"
        assert result["request"]["serverAcceptsNewConnections"] is True
        assert result["observation"]["serverAliveAfterRequest"] is True
        assert result["observation"]["invalidImageNotInstalled"] is True
        assert "Image invalid or corrupted. Not installing" in result["serverLog"]


def test_live_complete_final_chunk_reports_zero():
    root = os.environ.get("CANLITE_SWUPDATE_REPRO_ROOT")
    if not root:
        pytest.skip("local pinned SWUpdate builds not configured")
    result = run_custom_repro_process(
        root=root, distro="Ubuntu-22.04", variant="vulnerable", boundary="ABC",
        terminal_chunk_escaped=r"\r\n--ABC--\r\n", declared_content_length=127,
    )
    assert result["observation"]["reportedBytes"] == 0
    assert result["request"]["finalChunkHex"] == b"\r\n--ABC--\r\n".hex()
    assert result["request"]["serverAcceptsNewConnections"] is True
