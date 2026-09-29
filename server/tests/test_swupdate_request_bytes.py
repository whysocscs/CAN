"""Learner-edited multipart bytes must be exact, bounded, and not auto-corrected."""

import pytest


PREFIX = (
    b"--ABC\r\n"
    b'Content-Disposition: form-data; name="file"; filename="probe.swu"\r\n'
    b"Content-Type: application/octet-stream\r\n\r\n"
)


def test_decodes_escaped_final_chunk():
    from repro.swupdate_http_probe import decode_terminal_chunk

    assert decode_terminal_chunk(boundary="ABC", terminal_chunk_escaped=r"\r\n--ABC--") == b"\r\n--ABC--"
    assert decode_terminal_chunk(boundary="ABC", terminal_chunk_escaped=r"\r\n--ABC--\r\n") == b"\r\n--ABC--\r\n"


def test_declared_length_matches_sent_body():
    from repro.swupdate_http_probe import build_request

    final = b"\r\n--ABC--"
    request = build_request(
        boundary="ABC", terminal_chunk_escaped=r"\r\n--ABC--",
        declared_content_length=len(PREFIX) + len(final),
    )
    assert request.prefix == PREFIX
    assert request.final_chunk == final
    assert request.actual_body_length == len(PREFIX) + len(final)
    assert f"Content-Length: {request.actual_body_length}\r\n".encode() in request.header
    assert request.header.startswith(b"POST /upload HTTP/1.1\r\n")


@pytest.mark.parametrize("boundary,final", [
    ("ABC;echo", r"\r\n--ABC;echo--"),
    ("한글", r"\r\n--한글--"),
    ("A" * 25, r"\r\n--" + "A" * 25 + "--"),
    ("ABC", "\r\n--ABC--"),
    ("ABC", r"\n--ABC--"),
    ("ABC", r"\r\n--ABD--"),
    ("ABC", r"\r\n--ABC--\x00"),
])
def test_rejects_bad_boundary_or_escape(boundary, final):
    from repro.swupdate_http_probe import decode_terminal_chunk

    with pytest.raises(ValueError):
        decode_terminal_chunk(boundary=boundary, terminal_chunk_escaped=final)


def test_rejects_wrong_content_length():
    from repro.swupdate_http_probe import build_request

    expected = len(PREFIX) + len(b"\r\n--ABC--")
    for declared in (expected - 1, expected + 1, 0, 513):
        with pytest.raises(ValueError, match="Content-Length"):
            build_request(boundary="ABC", terminal_chunk_escaped=r"\r\n--ABC--",
                          declared_content_length=declared)


def test_probe_custom_sends_exact_bytes_and_reports_hex(monkeypatch):
    from repro import swupdate_http_probe as probe_module

    sent = []

    class FakeConnection:
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def settimeout(self, *_): pass
        def sendall(self, data): sent.append(data)
        def recv(self, size): return b""

    monkeypatch.setattr(probe_module.socket, "create_connection", lambda *_args, **_kwargs: FakeConnection())
    monkeypatch.setattr(probe_module.time, "sleep", lambda *_args: None)
    monkeypatch.setattr(probe_module, "read_http_response", lambda *_args: b"HTTP/1.1 200 OK\r\n\r\n")
    request = probe_module.build_request(
        boundary="ABC", terminal_chunk_escaped=r"\r\n--ABC--",
        declared_content_length=len(PREFIX) + len(b"\r\n--ABC--"),
    )
    trace = probe_module.probe_custom(port=18085, request=request)
    assert sent == [request.header + request.prefix, request.final_chunk]
    assert trace["firstChunkHex"] == sent[0].hex()
    assert trace["finalChunkHex"] == sent[1].hex()
    assert trace["declaredContentLength"] == trace["actualBodyLength"] == request.actual_body_length
