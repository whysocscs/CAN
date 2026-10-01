"""Run the publicly reported KUKSA authorization test against a real broker."""

import json
import os
import re
import subprocess
from pathlib import Path


def parse_client_output(output: str) -> dict[str, object]:
    values = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
    required = (
        "provider_token_scope", "original_value", "provider_registration",
        "value_override_observed", "read_scope_provider_hijack_reproduced",
    )
    missing = [key for key in required if key not in values]
    if missing:
        raise ValueError(f"missing client output: {', '.join(missing)}")

    registration = values["provider_registration"]
    if registration not in ("accepted", "denied"):
        raise ValueError("invalid provider registration response")
    overridden = values["value_override_observed"] == "true"
    observed_value = values.get("spoofed_value") if overridden else None
    if overridden and observed_value is None:
        raise ValueError("missing observed value")
    reproduced = (
        values["provider_token_scope"] == "read"
        and registration == "accepted"
        and overridden
        and values["read_scope_provider_hijack_reproduced"] == "true"
    )
    return {
        "providerRole": values["provider_token_scope"],
        "providerRegistration": registration,
        "targetPath": values.get("target_path"),
        "originalValue": values["original_value"],
        "observedValue": observed_value,
        "grpcStatus": values.get("grpc_status"),
        "reproduced": reproduced,
    }


def run_repro_process(*, root: str, distro: str, variant: str, provider_role: str, fake_value: str) -> dict[str, object]:
    if variant not in ("vulnerable", "patched"):
        raise ValueError("invalid KUKSA variant")
    if provider_role not in ("read", "provide"):
        raise ValueError("invalid provider role")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", fake_value):
        raise ValueError("invalid forged value")
    if not root.startswith("/"):
        raise ValueError("KUKSA reproduction root must be an absolute WSL path")
    script = (Path(__file__).resolve().parents[2] / "repro/kuksa_live_run.py")
    if os.name == "nt":
        drive, rest = os.path.splitdrive(str(script))
        script_path = f"/mnt/{drive[0].lower()}/{rest.replace(chr(92), '/').lstrip('/')}"
        command = ["wsl", "-d", distro, "--", "timeout", "-s", "INT", "-k", "5s", "75s", "python3", script_path]
    else:
        command = ["timeout", "-s", "INT", "-k", "5s", "75s", "python3", str(script)]
    command.extend((
        "--root", root,
        "--variant", variant,
        "--provider-role", provider_role,
        "--fake-value", fake_value,
    ))
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=90)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"KUKSA reproduction process could not run: {exc}") from exc
    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or "KUKSA reproduction process failed")
    try:
        result = json.loads(process.stdout)
        if result["evidenceKind"] != "actual_process" or result["variant"] != variant:
            raise ValueError("unexpected reproduction output")
        if result["exitCode"] == 0:
            result["observation"] = parse_client_output(result["clientOutput"])
        else:
            result["observation"] = None
        return result
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise RuntimeError("KUKSA reproduction output was incomplete") from exc
