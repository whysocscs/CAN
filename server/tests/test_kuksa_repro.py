"""A real broker response, not the educational model, determines the result."""

import base64
import json
import os
import subprocess

import pytest

from server.labs.kuksa_repro import parse_client_output, run_repro_process


def test_broker_launch_cannot_inherit_a_wildcard_bind_or_extra_socket():
    from repro.kuksa_live_run import broker_launch

    command, environment = broker_launch(
        broker="/tmp/databroker", port=55565, public_key="/tmp/jwt.key.pub",
        base_environment={
            "KUKSA_DATABROKER_ADDR": "0.0.0.0",
            "KUKSA_DATABROKER_ENABLE_UNIX_SOCKET": "true",
            "PATH": "/usr/bin",
        },
    )

    assert command == [
        "/tmp/databroker", "--address", "127.0.0.1", "--port", "55565",
        "--jwt-public-key", "/tmp/jwt.key.pub",
    ]
    assert environment == {"PATH": "/usr/bin", "RUST_LOG": "info"}


def test_read_named_token_with_provide_scope_is_rejected(tmp_path):
    from repro.kuksa_live_run import require_token_scope

    claims = base64.urlsafe_b64encode(json.dumps({
        "scope": "provide", "aud": ["kuksa.val"], "exp": 1861919999,
    }).encode()).decode().rstrip("=")
    token = tmp_path / "read-all.token"
    token.write_text(f"eyJhbGciOiJSUzI1NiJ9.{claims}.signature")

    with pytest.raises(ValueError, match="scope"):
        require_token_scope(token, "read")


def test_repro_client_source_must_match_repository_example(tmp_path):
    from repro.kuksa_live_run import require_client_source

    example = tmp_path / "read_scope_provider_hijack.rs"
    example.write_text("different example source")

    with pytest.raises(ValueError, match="source"):
        require_client_source(example)


def test_modified_tracked_upstream_source_cannot_be_claimed_as_pinned(tmp_path):
    from repro.source_integrity import require_clean_source

    source = tmp_path / "upstream"
    source.mkdir()
    tracked = source / "src.rs"
    tracked.write_text("original")
    subprocess.run(["git", "init", "-q", str(source)], check=True)
    subprocess.run(["git", "-C", str(source), "add", "src.rs"], check=True)
    subprocess.run([
        "git", "-C", str(source), "-c", "user.name=Test",
        "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline",
    ], check=True)
    require_clean_source(source)
    tracked.write_text("modified")

    with pytest.raises(ValueError, match="tracked source differs"):
        require_clean_source(source)


@pytest.mark.skipif(os.name != "nt", reason="WSL invocation is Windows-specific")
def test_kuksa_wsl_runner_has_an_inner_deadline_before_outer_kill(monkeypatch):
    from server.labs import kuksa_repro

    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["timeout"] = kwargs["timeout"]
        return subprocess.CompletedProcess(command, 1, "", "test-only failure")

    monkeypatch.setattr(kuksa_repro.subprocess, "run", fake_run)
    with pytest.raises(RuntimeError, match="test-only failure"):
        run_repro_process(root="/tmp/kuksa", distro="Ubuntu-22.04",
                          variant="patched", provider_role="read", fake_value="TEST")

    assert captured["command"][4:11] == ["timeout", "-s", "INT", "-k", "5s", "75s", "python3"]
    assert captured["timeout"] > 80


def test_read_scope_takeover_requires_observed_forged_read():
    output = "\n".join((
        "provider_token_scope=read",
        "target_path=Kuksa.Databroker.CargoVersion",
        "signal_id=1",
        "original_value=0.6.1-dev.0",
        "provider_registration=accepted",
        "spoofed_value=ATTACK_DEMO",
        "value_override_observed=true",
        "read_scope_provider_hijack_reproduced=true",
    ))

    result = parse_client_output(output)

    assert result["providerRegistration"] == "accepted"
    assert result["originalValue"] == "0.6.1-dev.0"
    assert result["observedValue"] == "ATTACK_DEMO"
    assert result["reproduced"] is True


def test_patch_denial_is_reported_from_real_grpc_status():
    output = "\n".join((
        "provider_token_scope=read",
        "original_value=0.6.1-dev.0",
        "provider_registration=denied",
        'grpc_status=status: PermissionDenied, message: "Permission denied for vss_path Kuksa.Databroker.CargoVersion"',
        "value_override_observed=false",
        "read_scope_provider_hijack_reproduced=false",
    ))

    result = parse_client_output(output)

    assert result["providerRegistration"] == "denied"
    assert "PermissionDenied" in result["grpcStatus"]
    assert result["observedValue"] is None
    assert result["reproduced"] is False


def test_provide_scope_can_override_value_without_authorization_bypass():
    output = "\n".join((
        "provider_token_scope=provide",
        "original_value=0.6.1-dev.0",
        "provider_registration=accepted",
        "spoofed_value=AUTHORIZED_DEMO",
        "value_override_observed=true",
        "read_scope_provider_hijack_reproduced=false",
    ))

    result = parse_client_output(output)

    assert result["observedValue"] == "AUTHORIZED_DEMO"
    assert result["reproduced"] is False


def test_incomplete_client_output_does_not_count_as_reproduction():
    with pytest.raises(ValueError, match="missing"):
        parse_client_output("provider_registration=accepted\n")


@pytest.mark.skipif(not os.environ.get("CANLITE_KUKSA_REPRO_ROOT"), reason="local KUKSA build not configured")
@pytest.mark.parametrize(
    ("variant", "expected_registration", "expected_reproduced"),
    (("vulnerable", "accepted", True), ("patched", "denied", False)),
)
def test_live_broker_read_scope_comparison(variant, expected_registration, expected_reproduced):
    result = run_repro_process(
        root=os.environ["CANLITE_KUKSA_REPRO_ROOT"],
        distro="Ubuntu-22.04",
        variant=variant,
        provider_role="read",
        fake_value="TEST_REPRO",
    )

    assert result["evidenceKind"] == "actual_process"
    assert result["exitCode"] == 0
    assert result["observation"]["providerRegistration"] == expected_registration
    assert result["observation"]["reproduced"] is expected_reproduced
    assert "Listening on 127.0.0.1" in result["brokerLog"]
    assert result["brokerLogTruncated"] is False
    assert result["brokerLogTotalCharacters"] == len(result["brokerLog"])
