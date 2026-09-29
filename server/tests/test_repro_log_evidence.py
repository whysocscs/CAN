from repro.log_evidence import excerpt_log


def test_long_process_log_explicitly_reports_truncation_and_original_size():
    result = excerpt_log("A" * 20000 + "TAIL", limit=20000)

    assert result["text"] == "A" * 19996 + "TAIL"
    assert result["totalCharacters"] == 20004
    assert result["truncated"] is True


def test_short_process_log_is_not_marked_truncated():
    result = excerpt_log("actual process output", limit=20000)

    assert result == {
        "text": "actual process output",
        "totalCharacters": 21,
        "truncated": False,
    }
