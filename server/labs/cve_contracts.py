"""Results from bounded educational models, never real product evidence."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelResult:
    code: str
    reason: str
    input_summary: dict[str, object]
    state: dict[str, object]
