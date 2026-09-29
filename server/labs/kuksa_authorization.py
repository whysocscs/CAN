"""CVE-inspired authorization simulation. No JWT, gRPC or vehicle I/O."""

from copy import deepcopy
from dataclasses import dataclass
from typing import Literal

from server.labs.cve_contracts import ModelResult

PRIMARY = 'demo.door.front_left.is_open'
SECONDARY = 'demo.door.front_right.is_open'
CredentialRole = Literal['invalid', 'read', 'provide_primary', 'provide_all']
KuksaAction = Literal['read', 'register_provider', 'extend_provider']


@dataclass(frozen=True)
class KuksaConfig:
    patched: bool
    credential_role: CredentialRole
    response_open: bool
    existing_provider: bool


class KuksaModel:
    def __init__(self, config: KuksaConfig):
        self.config = config
        self.providers: dict[str, dict[str, object]] = {}
        if config.existing_provider:
            self.providers[PRIMARY] = {'providerId': 'legitimate', 'responseOpen': False}
        self.observed: bool | None = None
        self.source: str | None = None

    def snapshot(self) -> dict[str, object]:
        return {
            'groundTruthDoorOpen': False,
            'cachedDoorOpen': False,
            'readerObservedDoorOpen': self.observed,
            'responseSource': self.source,
            'providerRegistrations': deepcopy(self.providers),
            'credentialRole': self.config.credential_role,
            'authorizationPatched': self.config.patched,
        }

    def apply(self, action: KuksaAction) -> ModelResult:
        if action not in ('read', 'register_provider', 'extend_provider'):
            raise ValueError('Unsupported KUKSA model action')
        target = SECONDARY if action == 'extend_provider' else PRIMARY
        summary = {'action': action, 'signal': target, 'credentialRole': self.config.credential_role}

        def result(code: str, reason: str) -> ModelResult:
            return ModelResult(code, reason, summary, self.snapshot())

        if self.config.credential_role == 'invalid':
            return result('AUTHENTICATION_FAILED', '유효하지 않은 토큰 역할입니다. 조회와 제공자 작업을 시작할 수 없습니다.')
        if action == 'read':
            provider = self.providers.get(PRIMARY)
            self.observed = bool(provider['responseOpen']) if provider else False
            self.source = ('legitimate_provider' if provider['providerId'] == 'legitimate' else 'session_provider') if provider else 'cache'
            return result('VALUE_READ', '등록된 제공자의 응답을 조회했습니다.' if provider else '제공자가 없어 정상 캐시값을 조회했습니다.')

        if self.config.patched and not (
            self.config.credential_role == 'provide_all'
            or (target == PRIMARY and self.config.credential_role == 'provide_primary')
        ):
            return result('PERMISSION_DENIED', '읽기 권한과 제공 권한은 다릅니다. 이 신호를 제공할 권한이 없어 등록·확장을 거절했습니다.')
        if action == 'extend_provider' and self.providers.get(PRIMARY, {}).get('providerId') != 'session':
            return result('PROVIDER_REQUIRED', '먼저 이 세션의 제공자를 첫 번째 신호에 등록해야 합니다.')
        if target in self.providers:
            return result('ALREADY_REGISTERED', '이미 제공자가 등록된 신호입니다. 기존 제공자를 덮어쓸 수 없습니다.')

        self.providers[target] = {'providerId': 'session', 'responseOpen': self.config.response_open}
        code = 'PROVIDER_EXTENDED' if action == 'extend_provider' else 'PROVIDER_REGISTERED'
        reason = '제공 권한 확인 후 등록했습니다.' if self.config.patched else '취약 모델은 제공 권한을 확인하지 않고 등록했습니다.'
        return result(code, reason + ' 계기판 값은 다시 조회할 때 바뀝니다.')
