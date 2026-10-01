"""Launch exact upstream KUKSA builds and run the public authorization PoC.

This script runs inside WSL. It only binds a loopback broker, uses the
repository's demonstration JWTs, and always stops the broker it starts.
"""

import argparse
import base64
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

if __package__:
    from .log_evidence import excerpt_log
    from .source_integrity import require_clean_source
else:
    from log_evidence import excerpt_log
    from source_integrity import require_clean_source


VARIANTS = {
    "vulnerable": ("kuksa-databroker", "2936b2511bfadc519694e25d12f92402bdd763f6", 55565),
    "patched": ("kuksa-patched", "c2d1a3d931a9343d8d98f9727b3007786ac0028b", 55566),
}


def broker_launch(*, broker: str, port: int, public_key: str,
                  base_environment: dict[str, str]) -> tuple[list[str], dict[str, str]]:
    environment = {
        key: value for key, value in base_environment.items()
        if not key.startswith("KUKSA_DATABROKER_")
    }
    environment["RUST_LOG"] = "info"
    command = [broker, "--address", "127.0.0.1", "--port", str(port),
               "--jwt-public-key", public_key]
    return command, environment


def require_token_scope(path: Path, expected_scope: str) -> None:
    try:
        encoded = path.read_text().strip().split(".")[1]
        padded = encoded + "=" * (-len(encoded) % 4)
        claims = json.loads(base64.urlsafe_b64decode(padded))
    except (OSError, IndexError, ValueError, UnicodeDecodeError) as exc:
        raise ValueError(f"Cannot inspect JWT claims in {path}") from exc
    # This is only a claim precheck. The broker verifies the JWT signature.
    if (claims.get("scope") != expected_scope
            or "kuksa.val" not in claims.get("aud", [])
            or not isinstance(claims.get("exp"), int)
            or claims["exp"] <= time.time()):
        raise ValueError(f"Unexpected JWT scope/audience/expiry in {path}")


def require_client_source(example: Path) -> None:
    expected = Path(__file__).with_name("kuksa_read_scope_provider_hijack.rs")
    if not example.is_file() or example.read_bytes() != expected.read_bytes():
        raise ValueError(f"KUKSA reproduction client source differs from {expected}")


def run(root: Path, variant: str, provider_role: str, fake_value: str) -> dict[str, object]:
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", fake_value):
        raise ValueError("fake value must be 1 to 64 ASCII letters, numbers, '.', '_' or '-'")
    if provider_role not in ("read", "provide"):
        raise ValueError("provider role must be read or provide")
    directory, commit, port = VARIANTS[variant]
    source = root / directory
    require_clean_source(source)
    broker = source / "target/debug/databroker"
    public_key = source / "certificates/jwt/jwt.key.pub"
    client = root / "kuksa-databroker/lib/target/debug/examples/read_scope_provider_hijack"
    examples = root / "kuksa-databroker/lib/databroker-examples/examples"
    require_client_source(examples / "read_scope_provider_hijack.rs")
    for role in ("read", "provide"):
        require_token_scope(root / f"kuksa-databroker/jwt/{role}-all.token", role)
    cargo = Path.home() / ".cargo/bin/cargo"
    cargo_command = str(cargo) if cargo.is_file() else shutil.which("cargo")
    if not cargo_command:
        raise FileNotFoundError("Rust cargo is required to rebuild the KUKSA PoC client")
    subprocess.run(
        [cargo_command, "build", "--locked", "--offline", "--manifest-path",
         str(root / "kuksa-databroker/lib/Cargo.toml"), "-p", "databroker-examples",
         "--example", "read_scope_provider_hijack", "-q"],
        cwd=root / "kuksa-databroker", capture_output=True, text=True,
        check=True, timeout=20,
    )
    for path in (broker, public_key, client):
        if not path.is_file():
            raise FileNotFoundError(f"KUKSA build missing: {path}")
    source_commit = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True, timeout=5,
    ).stdout.strip()
    if source_commit != commit:
        raise ValueError(f"Unexpected {variant} source commit: {source_commit}")
    binary_version = subprocess.run(
        [str(broker), "--help"], capture_output=True, text=True, check=True, timeout=5,
    )
    if commit not in binary_version.stdout + binary_version.stderr:
        raise ValueError(f"Broker binary was not built from {commit}")

    address = ("127.0.0.1", port)
    try:
        with socket.create_connection(address, timeout=0.3):
            raise RuntimeError(f"Port {port} is already occupied; no new broker was started")
    except ConnectionRefusedError:
        pass
    command, broker_environment = broker_launch(
        broker=str(broker), port=port, public_key=str(public_key),
        base_environment=dict(os.environ),
    )
    process = subprocess.Popen(
        command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, env=broker_environment,
    )
    broker_log = ""
    client_result = None
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"Broker exited before opening loopback port {port}")
            try:
                with socket.create_connection(address, timeout=0.2):
                    break
            except (ConnectionRefusedError, TimeoutError):
                time.sleep(0.1)
        else:
            raise TimeoutError(f"Broker did not listen on port {port}")
        client_env = {
            **os.environ,
            "KUKSA_REPRO_PORT": str(port),
            "KUKSA_REPRO_PROVIDER_TOKEN": provider_role,
            "KUKSA_REPRO_FAKE_VALUE": fake_value,
        }
        client_result = subprocess.run(
            [str(client)], cwd=root / "kuksa-databroker", env=client_env,
            capture_output=True, text=True, timeout=12,
        )
    finally:
        process.terminate()
        try:
            broker_log, _ = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            broker_log, _ = process.communicate(timeout=5)

    assert client_result is not None
    broker_evidence = excerpt_log(broker_log, limit=20000)
    return {
        "evidenceKind": "actual_process",
        "variant": variant,
        "sourceCommit": source_commit,
        "brokerCommand": " ".join(command),
        "clientCommand": (
            f"KUKSA_REPRO_PORT={port} KUKSA_REPRO_PROVIDER_TOKEN={provider_role} "
            f"KUKSA_REPRO_FAKE_VALUE={fake_value} {client}"
        ),
        "exitCode": client_result.returncode,
        "clientOutput": client_result.stdout,
        "clientError": client_result.stderr,
        "brokerLog": broker_evidence["text"],
        "brokerLogTruncated": broker_evidence["truncated"],
        "brokerLogTotalCharacters": broker_evidence["totalCharacters"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--provider-role", choices=("read", "provide"), required=True)
    parser.add_argument("--fake-value", required=True)
    args = parser.parse_args()
    try:
        result = run(args.root, args.variant, args.provider_role, args.fake_value)
    except (OSError, ValueError, RuntimeError, TimeoutError, subprocess.SubprocessError) as exc:
        print(f"KUKSA reproduction setup/run failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
