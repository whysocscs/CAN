"""Bounded presentation of process logs with an explicit truncation marker."""


def excerpt_log(log: str, *, limit: int) -> dict[str, object]:
    if limit < 1:
        raise ValueError("log excerpt limit must be positive")
    return {
        "text": log[-limit:],
        "totalCharacters": len(log),
        "truncated": len(log) > limit,
    }
