"""Hold one pinned KUKSA broker and a restricted door-signal gRPC client.

JSON lines on stdin/stdout are for the local FastAPI process only. The Rust
example uses a smaller fixed-field protocol so pinned upstream dependencies
do not have to be changed. No vehicle, CAN interface, or physical door exists.
"""

import argparse
import json
import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

if __package__:
    from .kuksa_live_run import VARIANTS, broker_launch, require_token_scope
    from .source_integrity import require_clean_source
else:
    from kuksa_live_run import VARIANTS, broker_launch, require_token_scope
    from source_integrity import require_clean_source


TARGET_PATH = "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen"
VSS_PARTS = ("Vehicle", "Cabin", "Door", "Row1", "DriverSide", "IsOpen")
MAX_PROTOCOL_LINE = 8192
MAX_BROKER_LOG = 20000


def require_door_metadata(vss_file: Path) -> dict[str, str]:
    """Reject a VSS file that cannot describe the exact boolean door path."""
    try:
        node = json.loads(vss_file.read_text(encoding="utf-8"))
        for index, part in enumerate(VSS_PARTS):
            node = node[part] if index == 0 else node["children"][part]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ValueError("door signal missing from pinned VSS file") from exc
    if node.get("datatype") != "boolean":
        raise ValueError("door signal must have boolean datatype")
    if node.get("type") != "actuator":
        raise ValueError("door signal must be the expected actuator metadata")
    return {"path": TARGET_PATH, "datatype": "boolean", "type": "actuator"}


def require_door_client_source(example: Path) -> None:
    expected = Path(__file__).with_suffix(".rs")
    if not example.is_file() or example.read_bytes() != expected.read_bytes():
        raise ValueError(f"KUKSA door client source differs from {expected}")


def parse_client_result(
    line: str, *, expected_seq: int, expected_action: str
) -> dict[str, object]:
    """Translate the Rust client's fixed-field line into one verified event."""
    parts = line.rstrip("\r\n").split("\t")
    if len(parts) != 9 or parts[0] != "RESULT":
        raise ValueError("invalid KUKSA client protocol line")
    _, seq_text, action, outcome, value, registration, code, signal_type, signal_id = parts
    if not seq_text.isdecimal() or int(seq_text) != expected_seq:
        raise ValueError("KUKSA client sequence mismatch")
    if action != expected_action or action not in ("metadata", "read", "register"):
        raise ValueError("invalid KUKSA client protocol action")
    if outcome not in ("ok", "denied", "error"):
        raise ValueError("invalid KUKSA client protocol outcome")
    if not code.replace("_", "").isalnum():
        raise ValueError("invalid KUKSA client protocol gRPC code")
    event: dict[str, object] = {
        "seq": expected_seq,
        "action": action,
        "outcome": outcome,
        "grpcStatus": code,
        "signalPath": TARGET_PATH,
    }
    if action == "metadata":
        if value != "-" or registration != "-" or signal_type != "boolean" or not signal_id.isdecimal():
            raise ValueError("invalid KUKSA client protocol metadata")
        event["signalType"] = signal_type
        event["signalId"] = int(signal_id)
    elif action == "read":
        if registration != "-" or signal_type != "-" or signal_id != "-":
            raise ValueError("invalid KUKSA client protocol read")
        if value not in ("true", "false", "null"):
            raise ValueError("invalid KUKSA client protocol boolean")
        event["readValue"] = None if value == "null" else value == "true"
    else:
        if value != "-" or signal_type != "-" or signal_id != "-" or registration not in ("true", "false"):
            raise ValueError("invalid KUKSA client protocol registration")
        event["registrationAccepted"] = registration == "true"
    return event


def command_to_wire(value: object) -> tuple[int, str, str]:
    if not isinstance(value, dict) or type(value.get("seq")) is not int or value["seq"] < 1:
        raise ValueError("invalid KUKSA command sequence")
    seq = value["seq"]
    action = value.get("action")
    if action in ("metadata", "read") and set(value) == {"seq", "action"}:
        return seq, action, f"{action.upper()}\t{seq}\n"
    if action == "register" and set(value) == {"seq", "action", "providerRole", "providedOpen"}:
        role, provided_open = value["providerRole"], value["providedOpen"]
        if role in ("read", "provide") and type(provided_open) is bool:
            return seq, action, f"REGISTER\t{seq}\t{role}\t{str(provided_open).lower()}\n"
    raise ValueError("invalid KUKSA command fields")


class _Tail:
    def __init__(self, limit: int):
        self.limit = limit
        self.text = ""
        self.lock = threading.Lock()

    def add(self, line: str) -> None:
        with self.lock:
            self.text = (self.text + line)[-self.limit:]

    def get(self) -> str:
        with self.lock:
            return self.text


def _drain_lines(stream, destination) -> None:
    try:
        for line in stream:
            destination(line)
    finally:
        stream.close()


def _relay_client_stdout(stream, output: queue.Queue[str | None]) -> None:
    """Do not let an untrusted client line grow without a limit in the host."""
    try:
        while True:
            line = stream.readline(MAX_PROTOCOL_LINE + 1)
            if not line:
                break
            try:
                output.put(line, timeout=1)
            except queue.Full:
                break
            if len(line) > MAX_PROTOCOL_LINE or not line.endswith("\n"):
                break
    finally:
        stream.close()
        try:
            output.put(None, timeout=1)
        except queue.Full:
            pass


def _stop_owned(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _preflight(root: Path, variant: str) -> tuple[Path, Path, Path, str, int]:
    if variant not in VARIANTS or not root.is_absolute():
        raise ValueError("invalid pinned KUKSA root or variant")
    directory, expected_commit, port = VARIANTS[variant]
    source = root / directory
    require_clean_source(source)
    broker = source / "target/debug/databroker"
    public_key = source / "certificates/jwt/jwt.key.pub"
    vss = root / "kuksa-databroker/data/vss-core/vss_release_4.0.json"
    example = root / "kuksa-databroker/lib/databroker-examples/examples/kuksa_door_session.rs"
    client = root / "kuksa-databroker/lib/target/debug/examples/kuksa_door_session"
    require_door_metadata(vss)
    require_door_client_source(example)
    for role in ("read", "provide"):
        require_token_scope(root / f"kuksa-databroker/jwt/{role}-all.token", role)
    for path in (broker, public_key):
        if not path.is_file():
            raise FileNotFoundError(f"KUKSA build missing: {path}")
    source_commit = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True, timeout=5,
    ).stdout.strip()
    if source_commit != expected_commit:
        raise ValueError(f"Unexpected {variant} source commit: {source_commit}")
    version = subprocess.run(
        [str(broker), "--help"], capture_output=True, text=True, check=True, timeout=5,
    )
    if expected_commit not in version.stdout + version.stderr:
        raise ValueError(f"Broker binary was not built from {expected_commit}")
    cargo = Path.home() / ".cargo/bin/cargo"
    cargo_command = str(cargo) if cargo.is_file() else shutil.which("cargo")
    if not cargo_command:
        raise FileNotFoundError("Rust cargo is required for the KUKSA door client")
    subprocess.run(
        [cargo_command, "build", "--locked", "--offline", "--manifest-path",
         str(root / "kuksa-databroker/lib/Cargo.toml"), "-p", "databroker-examples",
         "--example", "kuksa_door_session", "-q"],
        cwd=root / "kuksa-databroker", capture_output=True, text=True,
        check=True, timeout=45,
    )
    if not client.is_file():
        raise FileNotFoundError(f"KUKSA door client build missing: {client}")
    return broker, public_key, client, source_commit, port


def _wait_loopback(process: subprocess.Popen, port: int) -> None:
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("KUKSA broker exited before opening loopback port")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return
        except (ConnectionRefusedError, TimeoutError):
            time.sleep(0.1)
    raise TimeoutError("KUKSA broker did not open its loopback port")


def serve(root: Path, variant: str) -> None:
    broker_path, public_key, client_path, commit, port = _preflight(root, variant)
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            raise RuntimeError(f"Port {port} is already occupied; no broker was started")
    except ConnectionRefusedError:
        pass
    command, environment = broker_launch(
        broker=str(broker_path), port=port, public_key=str(public_key),
        base_environment=dict(os.environ),
    )
    command.extend(("--vss", str(root / "kuksa-databroker/data/vss-core/vss_release_4.0.json")))
    broker: subprocess.Popen | None = None
    client: subprocess.Popen | None = None
    broker_tail = _Tail(MAX_BROKER_LOG)
    client_error = _Tail(4000)
    output: queue.Queue[str | None] = queue.Queue(maxsize=16)
    try:
        broker = subprocess.Popen(
            command, cwd=root / VARIANTS[variant][0], env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        assert broker.stdout is not None
        threading.Thread(target=_drain_lines, args=(broker.stdout, broker_tail.add), daemon=True).start()
        _wait_loopback(broker, port)
        client = subprocess.Popen(
            [str(client_path)], cwd=root / "kuksa-databroker",
            env={**os.environ, "KUKSA_REPRO_PORT": str(port)},
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )
        assert client.stdout is not None and client.stderr is not None

        threading.Thread(target=_relay_client_stdout, args=(client.stdout, output), daemon=True).start()
        threading.Thread(target=_drain_lines, args=(client.stderr, client_error.add), daemon=True).start()
        ready = output.get(timeout=10)
        if ready != "READY\n":
            raise RuntimeError("KUKSA door client did not become ready")
        print(json.dumps({
            "kind": "ready", "evidenceKind": "actual_process", "variant": variant,
            "sourceCommit": commit, "targetPath": TARGET_PATH,
        }), flush=True)
        while True:
            line = sys.stdin.readline(1025)
            if not line:
                break
            if len(line) > 1024 or not line.endswith("\n"):
                raise ValueError("KUKSA command line exceeds the allowed size")
            seq, action, wire = command_to_wire(json.loads(line))
            assert client.stdin is not None
            client.stdin.write(wire)
            client.stdin.flush()
            response_line = output.get(timeout=10)
            if response_line is None or len(response_line) > MAX_PROTOCOL_LINE:
                raise RuntimeError("KUKSA door client output ended or exceeded the limit")
            event = parse_client_result(response_line, expected_seq=seq, expected_action=action)
            print(json.dumps({
                "kind": "event", "evidenceKind": "actual_process", "variant": variant,
                "sourceCommit": commit, "event": event,
                "brokerLog": broker_tail.get(), "clientError": client_error.get(),
            }), flush=True)
    finally:
        if client is not None and client.stdin is not None:
            client.stdin.close()
        _stop_owned(client)
        _stop_owned(broker)


def run_scripted_session(
    *, root: Path, variant: str, commands: list[dict[str, object]], distro: str = "Ubuntu-22.04"
) -> list[dict[str, object]]:
    """Exercise the same persistent host that the local API will own."""
    script = Path(__file__).resolve()
    if os.name == "nt":
        drive, rest = os.path.splitdrive(str(script))
        script_path = f"/mnt/{drive[0].lower()}/{rest.replace(chr(92), '/').lstrip('/')}"
        command = ["wsl", "-d", distro, "--", "python3", "-u", script_path]
    else:
        command = [sys.executable, "-u", str(script)]
    command.extend(("--root", root.as_posix(), "--variant", variant))
    input_text = "".join(json.dumps(item, ensure_ascii=True) + "\n" for item in commands)
    result = subprocess.run(command, input=input_text, capture_output=True, text=True, timeout=100)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "KUKSA door host failed")
    lines = [json.loads(line) for line in result.stdout.splitlines()]
    if not lines or lines[0].get("kind") != "ready" or lines[0].get("evidenceKind") != "actual_process":
        raise RuntimeError("KUKSA door host did not return an actual ready event")
    events = [line["event"] for line in lines[1:] if line.get("kind") == "event"]
    if len(events) != len(commands):
        raise RuntimeError("KUKSA door host omitted a command event")
    return events


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    args = parser.parse_args()
    try:
        serve(args.root, args.variant)
    except (OSError, ValueError, RuntimeError, TimeoutError, subprocess.SubprocessError, queue.Empty) as exc:
        print(f"KUKSA door session failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
