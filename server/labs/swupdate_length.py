"""Bounded arithmetic and simulated upload states; no parser or memory I/O."""

from copy import deepcopy
from dataclasses import dataclass
from typing import Literal

from server.labs.cve_contracts import ModelResult


@dataclass(frozen=True)
class LengthInput:
    boundary_length: int
    buffer_length: int
    parser_stage_reached: bool
    boundary_found: bool

    def summary(self) -> dict[str, object]:
        return {'boundaryLength': self.boundary_length, 'bufferLength': self.buffer_length,
                'parserStageReached': self.parser_stage_reached, 'boundaryFound': self.boundary_found}


@dataclass(frozen=True)
class LengthResult:
    arithmetic_status: Literal['skipped', 'waiting', 'searching', 'safe', 'wrapped']
    mathematical_difference: int | None
    calculated_length: str | None
    boundary_found: bool


def calculate_length(value: LengthInput, *, patched: bool, bits: Literal[32, 64]) -> LengthResult:
    b, n = value.boundary_length, value.buffer_length
    if type(b) is not int or type(n) is not int or not 1 <= b <= 64 or not 0 <= n <= 256 or bits not in (32, 64):
        raise ValueError('Expected bounded integer lengths and a 32/64-bit width')
    if not value.parser_stage_reached:
        return LengthResult('skipped', None, None, value.boundary_found)
    if n < b + 6:
        return LengthResult('waiting', None, None, value.boundary_found)
    if not value.boundary_found:
        return LengthResult('searching', n - (b + 6), str(n - (b + 6)), False)
    difference = n - (b + (6 if patched else 8))
    return LengthResult('wrapped' if difference < 0 else 'safe', difference, str(difference % (2 ** bits)), True)


class SwupdateModel:
    def __init__(self, *, patched: bool, bits: Literal[32, 64]):
        self.patched = patched
        self.bits = bits
        self.result: LengthResult | None = None
        self.last_input: dict[str, object] | None = None
        self.upload = 'idle'
        self.service = 'ready'

    def snapshot(self) -> dict[str, object]:
        return {
            'arithmeticStatus': self.result.arithmetic_status if self.result else None,
            'mathematicalDifference': self.result.mathematical_difference if self.result else None,
            'calculatedLength': self.result.calculated_length if self.result else None,
            'uploadStatus': self.upload, 'simulatedServiceStatus': self.service,
            'installStatus': 'not_simulated', 'lastInput': deepcopy(self.last_input),
        }

    def _result(self, code: str, reason: str, summary: dict[str, object]) -> ModelResult:
        return ModelResult(code, reason, summary, self.snapshot())

    def _blocked(self, summary: dict[str, object]) -> ModelResult | None:
        if self.service == 'faulted':
            return self._result('SERVICE_UNAVAILABLE', '가상 서비스가 장애 상태입니다. 실습 초기화 후 다시 시도하세요. 교육 서버는 계속 동작합니다.', summary)
        if self.upload == 'completed':
            return self._result('ALREADY_COMPLETED', '이번 모의 업로드는 완료되었습니다. 새 실험은 초기화 후 시작하세요.', summary)
        return None

    def evaluate(self, value: LengthInput) -> ModelResult:
        summary = value.summary()
        blocked = self._blocked(summary)
        if blocked:
            return blocked
        result = calculate_length(value, patched=self.patched, bits=self.bits)
        self.result, self.last_input = result, summary
        self.upload = 'receiving'
        if result.arithmetic_status == 'wrapped':
            self.upload, self.service = 'failed', 'faulted'
        reasons = {
            'skipped': '대상 파서 단계에 도달하지 않아 길이 계산을 수행하지 않았습니다.',
            'waiting': 'N < B + 6 이므로 입력을 더 기다립니다. 뺄셈을 수행하지 않았습니다.',
            'searching': 'boundary 미발견 분기입니다. N - (B + 6)을 계산하고 다음 입력을 기다립니다.',
            'safe': '길이 계산에 unsigned wrap이 없습니다. 업로드 완료와 실제 설치 성공은 별개입니다.',
            'wrapped': '음수 차이가 큰 unsigned 값으로 바뀌었습니다. 교육 모델에서만 업로드 실패·가상 장애로 표시합니다. 실제 크래시를 재현한 것은 아닙니다.',
        }
        return self._result('LENGTH_' + result.arithmetic_status.upper(), reasons[result.arithmetic_status], summary)

    def finish_upload(self) -> ModelResult:
        summary = {'action': 'finish_upload'}
        blocked = self._blocked(summary)
        if blocked:
            return blocked
        if not self.result or self.result.arithmetic_status != 'safe' or not self.result.boundary_found or int(self.result.calculated_length or '0') <= 0:
            return self._result('UPLOAD_NOT_READY', '마지막 평가가 boundary 발견 분기의 안전한 양수 길이여야 모의 업로드를 완료할 수 있습니다.', summary)
        self.upload = 'completed'
        return self._result('UPLOAD_COMPLETED', '교육용 업로드 완료입니다. 패키지 서명 검증과 펌웨어 설치는 시뮬레이션하지 않습니다.', summary)
