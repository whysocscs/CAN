"""Strict wire inputs: educational settings are not authentication credentials."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictInput(BaseModel):
    model_config = ConfigDict(strict=True, extra='forbid')


class KuksaSettings(StrictInput):
    patched: bool
    credentialRole: Literal['invalid', 'read', 'provide_primary', 'provide_all']
    responseOpen: bool
    existingProvider: bool


class SwupdateSettings(StrictInput):
    patched: bool
    sizeTBits: int

    @field_validator('sizeTBits')
    @classmethod
    def valid_bits(cls, value: int) -> int:
        if value not in (32, 64):
            raise ValueError('Expected 32 or 64 bits')
        return value


class SessionCreate(StrictInput):
    preset: Literal['normal', 'vulnerable', 'patched']
    settings: KuksaSettings | SwupdateSettings | None = None


class SessionReset(SessionCreate):
    generation: int = Field(ge=0)


class LengthRequest(StrictInput):
    boundaryLength: int = Field(ge=1, le=64)
    bufferLength: int = Field(ge=0, le=256)
    parserStageReached: bool
    boundaryFound: bool


class SessionAction(StrictInput):
    generation: int = Field(ge=0)
    action: Literal['read', 'register_provider', 'extend_provider', 'evaluate', 'finish_upload']
    input: LengthRequest | None = None

    @model_validator(mode='after')
    def valid_input_shape(self) -> Self:
        if self.action == 'evaluate':
            if self.input is None:
                raise ValueError('evaluate requires input')
        elif 'input' in self.model_fields_set:
            raise ValueError('Only evaluate accepts input')
        return self


class SessionResponse(BaseModel):
    lab: Literal['kuksa', 'swupdate']
    sessionId: str
    generation: int
    revision: int
    evidenceKind: Literal['simulation'] = 'simulation'
    preset: str
    settings: dict[str, object]
    state: dict[str, object]
    lastResult: dict[str, object] | None
    events: list[dict[str, object]]
