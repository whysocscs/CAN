"""Tests for the isolated lab terminal's CAN event bridge."""

from server.lab_terminal_app import parse_candump_frame


def test_parse_candump_frame_reports_observed_classic_can_frame() -> None:
    assert parse_candump_frame("(1770000000.123456) vcan0 101#00\n") == {
        "type": "can-frame",
        "channel": "vcan0",
        "canId": "101",
        "data": ["00"],
    }


def test_parse_candump_frame_splits_payload_bytes() -> None:
    assert parse_candump_frame("(1770000000.123456) vcan0 200#DEADBEEF") == {
        "type": "can-frame",
        "channel": "vcan0",
        "canId": "200",
        "data": ["DE", "AD", "BE", "EF"],
    }


def test_parse_candump_frame_rejects_unrelated_output() -> None:
    assert parse_candump_frame("vcan0 is not available") is None
