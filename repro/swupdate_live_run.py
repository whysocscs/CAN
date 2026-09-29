"""Compare real SWUpdate HTTP parser behavior before and after the fix.

Run inside WSL with upstream binaries built from pinned commits. The image is
invalid and SWUpdate runs with -n (dry-run); this is not a firmware install.
"""

import argparse
import json
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

if __package__:
    from .log_evidence import excerpt_log
    from .source_integrity import require_clean_source
    from .swupdate_http_probe import build_request, probe, probe_custom
else:
    from log_evidence import excerpt_log
    from source_integrity import require_clean_source
    from swupdate_http_probe import build_request, probe, probe_custom


VARIANTS = {
    "vulnerable": ("swupdate", "e3b3c977e200283c4eaacb7aa70b28f0cfbde704", 18085),
    "patched": ("swupdate-patched", "beee2dc0feef1cfe84f1aa6fc980e104b2e47a74", 18086),
}


def _run_with_probe(root: Path, variant: str, send_request) -> dict[str, object]:
    directory, expected_commit, port = VARIANTS[variant]
    source = root / directory
    require_clean_source(source)
    binary = source / "swupdate"
    if not binary.is_file():
        raise FileNotFoundError(f"SWUpdate binary missing: {binary}")
    commit = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True, timeout=5,
    ).stdout.strip()
    if commit != expected_commit:
        raise ValueError(f"Unexpected {variant} SWUpdate source commit: {commit}")
    version = subprocess.run(
        [str(binary), "--version"], capture_output=True, text=True, check=True, timeout=5,
    ).stdout.strip()
    if expected_commit[:7] not in version:
        raise ValueError(f"SWUpdate binary was not built from {expected_commit}")
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            raise RuntimeError(f"Port {port} is occupied; no SWUpdate process was started")
    except ConnectionRefusedError:
        pass
    command = [str(binary), "-n", "-w", f"-p http://127.0.0.1:{port}", "-v"]
    process = subprocess.Popen(
        command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True,
    )
    log = ""
    request = None
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"SWUpdate exited before opening port {port}")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                    break
            except (ConnectionRefusedError, TimeoutError):
                time.sleep(0.1)
        else:
            raise TimeoutError(f"SWUpdate web server did not listen on {port}")
        request = send_request(port)
        time.sleep(0.25)
    finally:
        process.terminate()
        try:
            log, _ = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            log, _ = process.communicate(timeout=5)
    assert request is not None
    bad_address = "Writing to IPC fails due to Bad address" in log
    reported = re.search(r"Ok, probe\.swu - (-?\d+) bytes\.", request["httpResponse"])
    reported_bytes = int(reported.group(1)) if reported else None
    server_evidence = excerpt_log(log, limit=20000)
    return {
        "evidenceKind": "actual_process",
        "variant": variant,
        "sourceCommit": commit,
        "version": version,
        "serverCommand": " ".join(command),
        "request": request,
        "serverLog": server_evidence["text"],
        "serverLogTruncated": server_evidence["truncated"],
        "serverLogTotalCharacters": server_evidence["totalCharacters"],
        "observation": {
            "ipcBadAddress": bad_address,
            "reportedBytes": reported_bytes,
            "negativeReportedLength": reported_bytes is not None and reported_bytes < 0,
            "serverAliveAfterRequest": request["serverAcceptsNewConnections"],
            "invalidImageNotInstalled": "Image invalid or corrupted. Not installing" in log,
        },
    }


def run(root: Path, variant: str, boundary: str, mode: str) -> dict[str, object]:
    """Preserve the fixed two-mode reproduction for existing clients."""
    if variant not in VARIANTS or mode not in ("truncated", "complete"):
        raise ValueError("invalid SWUpdate variant or multipart mode")
    return _run_with_probe(root, variant, lambda port: probe(port, boundary, mode))


def run_custom(
    root: Path, variant: str, boundary: str,
    terminal_chunk_escaped: str, declared_content_length: int,
) -> dict[str, object]:
    """Validate the exact learner bytes before starting SWUpdate."""
    if variant not in VARIANTS:
        raise ValueError("invalid SWUpdate variant")
    request = build_request(
        boundary=boundary, terminal_chunk_escaped=terminal_chunk_escaped,
        declared_content_length=declared_content_length,
    )
    return _run_with_probe(root, variant, lambda port: probe_custom(port=port, request=request))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--boundary", required=True)
    parser.add_argument("--mode", choices=("truncated", "complete"))
    parser.add_argument("--terminal-chunk-escaped")
    parser.add_argument("--terminal-chunk-hex")
    parser.add_argument("--declared-content-length", type=int)
    args = parser.parse_args()
    try:
        if args.mode is not None:
            if (args.terminal_chunk_escaped is not None or args.terminal_chunk_hex is not None
                    or args.declared_content_length is not None):
                parser.error("--mode cannot be combined with a custom final chunk")
            result = run(args.root, args.variant, args.boundary, args.mode)
        else:
            if ((args.terminal_chunk_escaped is None) == (args.terminal_chunk_hex is None)
                    or args.declared_content_length is None):
                parser.error("custom requests require a final chunk and Content-Length")
            terminal_escaped = args.terminal_chunk_escaped
            if args.terminal_chunk_hex is not None:
                final_bytes = bytes.fromhex(args.terminal_chunk_hex)
                short = f"\r\n--{args.boundary}--".encode("ascii")
                if final_bytes == short:
                    terminal_escaped = r"\r\n--" + args.boundary + "--"
                elif final_bytes == short + b"\r\n":
                    terminal_escaped = r"\r\n--" + args.boundary + "--" + r"\r\n"
                else:
                    raise ValueError("final chunk hex does not match the selected boundary")
            result = run_custom(
                args.root, args.variant, args.boundary,
                terminal_escaped, args.declared_content_length,
            )
    except (OSError, ValueError, RuntimeError, TimeoutError, subprocess.SubprocessError) as exc:
        print(f"SWUpdate reproduction setup/run failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
