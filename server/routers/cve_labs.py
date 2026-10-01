"""Local-only, bounded simulation API, isolated from CAN/terminal services."""

from collections import OrderedDict, deque
from copy import deepcopy
from dataclasses import dataclass, field
from threading import RLock
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from server.labs.kuksa_authorization import KuksaConfig, KuksaModel
from server.labs.swupdate_length import LengthInput, SwupdateModel
from server.routers.cve_lab_schemas import (
    KuksaSettings, SwupdateSettings, SessionCreate, SessionReset,
    SessionAction, SessionResponse,
)

router = APIRouter(prefix='/labs/cve', tags=['educational-cve-labs'])


def _settings(lab: str, body: SessionCreate) -> KuksaSettings | SwupdateSettings:
    if lab not in ('kuksa', 'swupdate'):
        raise HTTPException(404, '알 수 없는 실습입니다.')
    expected = KuksaSettings if lab == 'kuksa' else SwupdateSettings
    if body.settings is not None:
        if not isinstance(body.settings, expected):
            raise HTTPException(422, '실습 종류와 설정이 일치하지 않습니다.')
        return body.settings
    if lab == 'kuksa':
        return KuksaSettings(patched=body.preset != 'vulnerable',
                             credentialRole='provide_primary' if body.preset == 'normal' else 'read',
                             responseOpen=body.preset != 'normal', existingProvider=False)
    return SwupdateSettings(patched=body.preset != 'vulnerable', sizeTBits=64)


def _model(settings: KuksaSettings | SwupdateSettings) -> KuksaModel | SwupdateModel:
    if isinstance(settings, KuksaSettings):
        return KuksaModel(KuksaConfig(settings.patched, settings.credentialRole, settings.responseOpen, settings.existingProvider))
    return SwupdateModel(patched=settings.patched, bits=settings.sizeTBits)


@dataclass
class Session:
    lab: str
    preset: str
    settings: KuksaSettings | SwupdateSettings
    model: KuksaModel | SwupdateModel
    id: str = field(default_factory=lambda: str(uuid4()))
    generation: int = 0
    revision: int = 0
    last_result: dict[str, object] | None = None
    events: deque[dict[str, object]] = field(default_factory=lambda: deque(maxlen=100))

    def response(self) -> SessionResponse:
        return SessionResponse(lab=self.lab, sessionId=self.id, generation=self.generation,
                               revision=self.revision, preset=self.preset, settings=self.settings.model_dump(),
                               state=self.model.snapshot(), lastResult=deepcopy(self.last_result),
                               events=deepcopy(list(self.events)))


class CveSessionStore:
    def __init__(self):
        self.lock = RLock()
        self.sessions: dict[str, OrderedDict[str, Session]] = {'kuksa': OrderedDict(), 'swupdate': OrderedDict()}

    def require(self, lab: str, session_id: str) -> Session:
        session = self.sessions.get(lab, {}).get(session_id)
        if session is None:
            raise HTTPException(404, '실습 세션이 없습니다. 새로 시작하세요.')
        return session


_store = CveSessionStore()


def get_store() -> CveSessionStore:
    return _store


Store = Annotated[CveSessionStore, Depends(get_store)]


def _generation(session: Session, expected: int) -> None:
    if session.generation != expected:
        raise HTTPException(409, '이미 초기화된 이전 실행입니다. 현재 상태를 다시 조회하세요.')


@router.post('/{lab}/sessions', response_model=SessionResponse, status_code=201)
def create_session(lab: str, body: SessionCreate, store: Store) -> SessionResponse:
    settings = _settings(lab, body)
    with store.lock:
        sessions = store.sessions[lab]
        if len(sessions) >= 128:
            sessions.popitem(last=False)
        session = Session(lab, body.preset, settings, _model(settings))
        sessions[session.id] = session
        return session.response()


@router.get('/{lab}/sessions/{session_id}', response_model=SessionResponse)
def get_session(lab: str, session_id: str, store: Store) -> SessionResponse:
    with store.lock:
        return store.require(lab, session_id).response()


@router.post('/{lab}/sessions/{session_id}/reset', response_model=SessionResponse)
def reset(lab: str, session_id: str, body: SessionReset, store: Store) -> SessionResponse:
    settings = _settings(lab, body)
    with store.lock:
        session = store.require(lab, session_id)
        _generation(session, body.generation)
        session.preset, session.settings, session.model = body.preset, settings, _model(settings)
        session.generation += 1
        session.revision, session.last_result = 0, None
        session.events.clear()
        return session.response()


@router.post('/{lab}/sessions/{session_id}/actions', response_model=SessionResponse)
def act(lab: str, session_id: str, body: SessionAction, store: Store) -> SessionResponse:
    with store.lock:
        session = store.require(lab, session_id)
        _generation(session, body.generation)
        if isinstance(session.model, KuksaModel):
            if body.action not in ('read', 'register_provider', 'extend_provider'):
                raise HTTPException(422, 'KUKSA 실습에 없는 동작입니다.')
            result = session.model.apply(body.action)
        else:
            if body.action == 'evaluate' and body.input is not None:
                value = body.input
                result = session.model.evaluate(LengthInput(value.boundaryLength, value.bufferLength, value.parserStageReached, value.boundaryFound))
            elif body.action == 'finish_upload':
                result = session.model.finish_upload()
            else:
                raise HTTPException(422, 'SWUpdate 실습에 없는 동작입니다.')
        session.revision += 1
        session.last_result = {'code': result.code, 'reason': result.reason, 'inputSummary': result.input_summary}
        session.events.append({'sequence': session.revision, 'sessionId': session.id,
                               'generation': session.generation, 'action': body.action, **session.last_result})
        return session.response()
