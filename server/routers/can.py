"""CAN 프레임 브로드캐스트와 차량 제어 엔드포인트.

설계 원칙: 이 모듈은 "문"이나 "트렁크"를 열지 않습니다. 프레임을 버스에 쏠 뿐입니다.
프레임의 의미를 해석해 3D 모델을 움직이는 일은 브라우저(vehicleStore.ts)가 합니다.

경로가 하나로 합쳐지도록 설계했습니다.

    POST /can/door ─┐
                    ├─> 버스 ─> 구독 ─> /ws/can ─> 모든 브라우저
    실습생 cansend ─┘

API로 열든 실습생이 터미널로 열든 화면이 똑같이 반응하고, Monitor에도 똑같이 기록됩니다.
엔드포인트가 WebSocket에 직접 쏘게 만들면 이 성질이 깨집니다.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
import json
import os
import shutil
import threading
import time
from itertools import count
from typing import Any, Final, Literal

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from server.routers.terminal import ALLOWED_ORIGINS


router = APIRouter()

CHANNEL: Final = os.environ.get("CANLITE_CAN_CHANNEL", "vcan0")

# socketcan: 진짜 vcan0 버스를 사용합니다 (candump/cansend 필요).
# loopback:  버스 없이 서버 안에서 프레임을 되돌립니다. vcan 모듈이나 sudo가
#            없는 개발 머신에서도 프론트 동작을 그대로 확인할 수 있습니다.
Mode = Literal["socketcan", "loopback"]


def resolve_mode() -> Mode:
    requested = os.environ.get("CANLITE_CAN_MODE")
    if requested in ("socketcan", "loopback"):
        return requested  # type: ignore[return-value]
    # 자동 판별: can-utils가 없으면 loopback으로 떨어집니다.
    if shutil.which("candump") and shutil.which("cansend"):
        return "socketcan"
    return "loopback"


MODE: Final[Mode] = resolve_mode()


@dataclass(eq=False, slots=True)
class _ClientConnection:
    """One ordered CAN WebSocket stream owned by the server event loop."""

    websocket: WebSocket
    loop: asyncio.AbstractEventLoop
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    evicted_event: asyncio.Event = field(default_factory=asyncio.Event)
    backlog: deque[str] = field(default_factory=deque)
    replaying: bool = True
    evicted: bool = False


_clients: set[_ClientConnection] = set()
_CLIENT_SEND_TIMEOUT_SECONDS: Final = 0.25
_sequence = count(1)

# CAN ID별 마지막 프레임. 새로 접속한 브라우저에게 현재 상태를 알려주는 데 씁니다.
#
# 연결이 끊긴 동안 지나간 프레임은 되돌릴 수 없습니다. 그래서 접속 직후 한 번,
# 각 ID의 마지막 프레임을 재생해 줍니다. 서버는 여전히 "문"이 무엇인지 모릅니다 —
# 마지막으로 본 바이트를 그대로 다시 보낼 뿐이고, 해석은 브라우저가 합니다.
# 표준 CAN 프레임 ID는 0x7ff까지라 이 dict는 자연히 2048개로 묶입니다.
_last_frames: dict[str, dict[str, Any]] = {}
# SocketCAN emits are observed later by candump.  Keep metadata keyed by the
# frame until that observation reaches the shared event stream.
EchoKey = tuple[str, tuple[str, ...]]


@dataclass(frozen=True, slots=True)
class PendingEcho:
    metadata: Mapping[str, Any]
    sent_at_us: int


_echo_state_lock = threading.RLock()
_pending_echoes: dict[EchoKey, deque[PendingEcho]] = defaultdict(deque)
_background_emit_tasks: set[asyncio.Task[None]] = set()
_OBSERVED_AT_US_KEY: Final = "_observedAtUs"
_CLEARED_ECHO_TTL_SECONDS: Final = 5.0
_MAX_CLEARED_ECHO_TOMBSTONES: Final = 128
_cleared_echo_tombstones: deque[
    tuple[EchoKey, int, float]
] = deque()


# --------------------------------------------------------------- 프레임 표현

def normalize_can_id(raw: str | int) -> str:
    """'0x200' / '200' / 512 → '0x200'"""
    value = raw if isinstance(raw, int) else int(str(raw).lower().removeprefix("0x"), 16)
    return f"0x{value:03x}"


def normalize_data(data: list[str] | str | None) -> list[str]:
    """['01'] / '01' / '0x01' / '0100' → ['01'] 형태로 통일합니다."""
    if not data:
        return []
    parts = data if isinstance(data, list) else [data[i : i + 2] for i in range(0, len(data), 2)]
    return [p.lower().removeprefix("0x").rjust(2, "0").upper() for p in parts if p]


def build_event(
    can_id: str,
    data: list[str],
    *,
    timestamp_ms: int,
    channel: str,
    context: dict[str, Any] | None = None,
    processing: dict[str, Any] | None = None,
    monitoring: dict[str, Any] | None = None,
    lab: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """프론트의 CanEvent(types.ts)와 같은 모양의 dict를 만듭니다."""
    event: dict[str, Any] = {
        "eventId": f"can-{next(_sequence):06d}",
        "timestamp": timestamp_ms,
        "channel": channel,
        "origin": "backend",
        "frame": {"canId": can_id, "dlc": len(data), "data": data},
        # 의미 해석은 프론트가 합니다. 여기서는 비워 둡니다.
        "context": context or {},
    }
    if processing is not None:
        event["processing"] = processing
    if monitoring is not None:
        event["monitoring"] = monitoring
    if lab is not None:
        event["lab"] = lab
    return event


def parse_candump(line: str) -> dict[str, Any] | None:
    """candump -L 한 줄: '(1755499200.123456) vcan0 200#01'"""
    parts = line.split()
    if len(parts) != 3:
        return None
    raw_ts, channel, frame = parts
    raw_id, sep, payload = frame.partition("#")
    if not sep:
        return None
    try:
        timestamp_us = int(Decimal(raw_ts.strip("()")) * 1_000_000)
        can_id = normalize_can_id(raw_id)
    except (InvalidOperation, ValueError):
        return None
    event = build_event(
        can_id,
        normalize_data(payload),
        timestamp_ms=timestamp_us // 1000,
        channel=channel,
    )
    # Public CanEvent timestamps stay in milliseconds.  Echo correlation keeps
    # candump's microsecond ordering until attach_pending_metadata consumes it.
    event[_OBSERVED_AT_US_KEY] = timestamp_us
    return event


def _purge_expired_cleared_echoes() -> None:
    with _echo_state_lock:
        now = time.monotonic()
        while _cleared_echo_tombstones and _cleared_echo_tombstones[0][2] <= now:
            _cleared_echo_tombstones.popleft()


def _remember_cleared_echo(
    key: EchoKey,
    sent_at_us: int,
) -> None:
    with _echo_state_lock:
        _purge_expired_cleared_echoes()
        while len(_cleared_echo_tombstones) >= _MAX_CLEARED_ECHO_TOMBSTONES:
            _cleared_echo_tombstones.popleft()
        _cleared_echo_tombstones.append(
            (key, sent_at_us, time.monotonic() + _CLEARED_ECHO_TTL_SECONDS)
        )


def _has_cleared_echo(key: EchoKey) -> bool:
    with _echo_state_lock:
        _purge_expired_cleared_echoes()
        return any(tombstone[0] == key for tombstone in _cleared_echo_tombstones)


def _consume_cleared_echo(
    key: EchoKey,
    *,
    observed_at_us: int,
    before_sent_at_us: int | None,
) -> bool:
    with _echo_state_lock:
        _purge_expired_cleared_echoes()
        for tombstone in _cleared_echo_tombstones:
            tombstone_key, sent_at_us, _expires_at = tombstone
            if tombstone_key != key:
                continue
            if observed_at_us < sent_at_us:
                continue
            if (
                before_sent_at_us is not None
                and sent_at_us >= before_sent_at_us
            ):
                continue
            _cleared_echo_tombstones.remove(tombstone)
            return True
        return False


def _forget_obsolete_cleared_echoes(
    key: EchoKey,
    *,
    current_sent_at_us: int,
) -> None:
    """A matched current echo proves older same-key echoes were lost."""
    with _echo_state_lock:
        _purge_expired_cleared_echoes()
        for tombstone in list(_cleared_echo_tombstones):
            tombstone_key, sent_at_us, _expires_at = tombstone
            if tombstone_key == key and sent_at_us <= current_sent_at_us:
                _cleared_echo_tombstones.remove(tombstone)


def _pop_pending_echo(key: EchoKey) -> PendingEcho | None:
    with _echo_state_lock:
        pending = _pending_echoes.get(key)
        if not pending:
            return None
        echo = pending.popleft()
        if not pending:
            _pending_echoes.pop(key, None)
        return echo


def _remove_pending_echo(
    key: EchoKey,
    echo: PendingEcho,
    *,
    remember_cleared: bool = False,
) -> bool:
    """Remove this exact emit without touching byte-identical peers."""
    with _echo_state_lock:
        pending = _pending_echoes.get(key)
        if not pending:
            return False
        pending_index = next(
            (index for index, item in enumerate(pending) if item is echo),
            None,
        )
        if pending_index is None:
            return False
        del pending[pending_index]
        if not pending:
            _pending_echoes.pop(key, None)
        if remember_cleared:
            _remember_cleared_echo(key, echo.sent_at_us)
        return True


def _invalidate_pending_echoes(key: EchoKey) -> None:
    """Turn unobserved SocketCAN emits into bounded, expiring tombstones."""
    with _echo_state_lock:
        pending = _pending_echoes.pop(key, None)
        if MODE != "socketcan" or not pending:
            return
        for echo in pending:
            _remember_cleared_echo(key, echo.sent_at_us)


async def _finish_cancelled_process_creation(
    creation: asyncio.Task[Any],
    key: EchoKey,
    pending_echo: PendingEcho | None,
) -> None:
    """Recover and reap a subprocess whose caller was cancelled mid-creation."""
    try:
        process = await creation
    except asyncio.CancelledError:
        if pending_echo is not None:
            _remove_pending_echo(key, pending_echo, remember_cleared=True)
        return
    except BaseException:
        if pending_echo is not None:
            _remove_pending_echo(key, pending_echo)
        return

    try:
        await process.wait()
    except BaseException:
        returncode = process.returncode
        if pending_echo is not None and returncode != 0:
            _remove_pending_echo(
                key,
                pending_echo,
                remember_cleared=returncode is None,
            )
        return

    if pending_echo is not None and process.returncode != 0:
        _remove_pending_echo(key, pending_echo)


def _track_background_emit(task: asyncio.Task[None]) -> None:
    """Keep cancellation cleanup alive until the child has been reaped."""
    _background_emit_tasks.add(task)
    task.add_done_callback(_background_emit_tasks.discard)


def attach_pending_metadata(event: dict[str, Any]) -> dict[str, Any] | None:
    """Attach metadata recorded by ``emit`` when SocketCAN echoes a frame."""
    frame = event["frame"]
    key = (frame["canId"], tuple(frame["data"]))
    observed_at_us = int(event.pop(_OBSERVED_AT_US_KEY, int(event["timestamp"]) * 1000))
    with _echo_state_lock:
        pending = _pending_echoes.get(key)
        current = pending[0] if pending else None
        current_sent_at_us = current.sent_at_us if current is not None else None
        # With a reset tombstone present, byte equality is insufficient.  Prefer a
        # current pending emit only when the observed kernel timestamp is at/after
        # that send; an older observation still consumes the stale tombstone.
        if current is not None:
            if (
                not _has_cleared_echo(key)
                or observed_at_us >= current.sent_at_us
            ):
                resolved = _pop_pending_echo(key)
                assert resolved is not None
                event.update(resolved.metadata)
                _forget_obsolete_cleared_echoes(
                    key,
                    current_sent_at_us=resolved.sent_at_us,
                )
                return event
        if _consume_cleared_echo(
            key,
            observed_at_us=observed_at_us,
            before_sent_at_us=current_sent_at_us,
        ):
            return None
        return event


def clear_frame_snapshot(can_id: str) -> bool:
    """Remove one CAN ID's replay state and any unobserved accepted metadata."""
    normalized_id = normalize_can_id(can_id)
    with _echo_state_lock:
        removed = _last_frames.pop(normalized_id, None) is not None
        for key in [key for key in _pending_echoes if key[0] == normalized_id]:
            _invalidate_pending_echoes(key)
        return removed


# --------------------------------------------------------------- 브로드캐스트


def _signal_client_evicted(client: _ClientConnection) -> None:
    """Wake the connection handler, including a handler on another test loop."""
    if client.evicted_event.is_set() or client.loop.is_closed():
        return
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None
    if running_loop is client.loop:
        client.evicted_event.set()
    else:
        client.loop.call_soon_threadsafe(client.evicted_event.set)


def _evict_client(client: _ClientConnection) -> None:
    """Atomically stop routing events to a failed or disconnected client."""
    with _echo_state_lock:
        if client.evicted:
            return
        client.evicted = True
        client.backlog.clear()
        _clients.discard(client)
        _signal_client_evicted(client)


def _route_event_locked(
    event: dict[str, Any],
    *,
    store_snapshot: bool,
) -> tuple[str, tuple[_ClientConnection, ...]]:
    """Commit replay state and choose recipients at one linearization point."""
    if store_snapshot:
        _last_frames[event["frame"]["canId"]] = event
    payload = json.dumps(event)
    ready: list[_ClientConnection] = []
    for client in list(_clients):
        if client.evicted:
            _clients.discard(client)
        else:
            client.backlog.append(payload)
            if not client.replaying:
                ready.append(client)
    return payload, tuple(ready)


async def _drain_live_backlog(client: _ClientConnection) -> None:
    try:
        async with client.send_lock:
            with _echo_state_lock:
                if client.evicted or client not in _clients:
                    return
                pending = tuple(client.backlog)
                client.backlog.clear()
            for payload in pending:
                await asyncio.wait_for(
                    client.websocket.send_text(payload),
                    timeout=_CLIENT_SEND_TIMEOUT_SECONDS,
                )
    except asyncio.CancelledError:
        _evict_client(client)
        raise
    except Exception:
        _evict_client(client)


async def _deliver_to_clients(
    clients: tuple[_ClientConnection, ...],
    _payload: str,
) -> None:
    """Send concurrently; every coroutine finishes or is cancelled before return."""
    if not clients:
        return
    await asyncio.gather(*(_drain_live_backlog(client) for client in clients))


async def broadcast(
    event: dict[str, Any],
    *,
    store_snapshot: bool = True,
) -> None:
    with _echo_state_lock:
        payload, clients = _route_event_locked(
            event,
            store_snapshot=store_snapshot,
        )
    await _deliver_to_clients(clients, payload)


async def publish_observed_event(event: dict[str, Any]) -> bool:
    """Publish one candump event unless it is an echo invalidated by reset."""
    with _echo_state_lock:
        resolved = attach_pending_metadata(event)
        if resolved is None:
            return False
        payload, clients = _route_event_locked(resolved, store_snapshot=True)
    await _deliver_to_clients(clients, payload)
    return True


async def send_snapshot(websocket: WebSocket) -> None:
    """접속 직후 현재 상태를 한 번 재생합니다.

    replay=True가 붙어 있어 브라우저가 새 트래픽과 구분할 수 있습니다.
    (Monitor 목록에는 넣지 않고, 차량 상태에만 반영합니다.)
    """
    with _echo_state_lock:
        payloads = [
            json.dumps({**event, "replay": True})
            for event in _last_frames.values()
        ]
    for payload in payloads:
        await asyncio.wait_for(
            websocket.send_text(payload),
            timeout=_CLIENT_SEND_TIMEOUT_SECONDS,
        )


async def emit(
    can_id: str,
    data: list[str],
    *,
    context: dict[str, Any] | None = None,
    processing: dict[str, Any] | None = None,
    monitoring: dict[str, Any] | None = None,
    lab: dict[str, Any] | None = None,
) -> bool:
    """프레임 하나를 버스에 올립니다. 브라우저 전달은 구독 루프가 맡습니다."""
    if MODE == "loopback":
        loop_ms = int(time.time() * 1000)
        await broadcast(
            build_event(
                can_id,
                data,
                timestamp_ms=loop_ms,
                channel=CHANNEL,
                context=context,
                processing=processing,
                monitoring=monitoring,
                lab=lab,
            )
        )
        return True

    metadata = {
        name: value
        for name, value in (("context", context), ("processing", processing), ("monitoring", monitoring), ("lab", lab))
        if value is not None
    }
    metadata_key = (normalize_can_id(can_id), tuple(normalize_data(data)))
    pending_echo: PendingEcho | None = None
    if metadata:
        with _echo_state_lock:
            pending_echo = PendingEcho(
                metadata=metadata,
                sent_at_us=int(time.time() * 1_000_000),
            )
            _pending_echoes[metadata_key].append(pending_echo)
    payload = "".join(data)
    # Shield process creation because cancellation can arrive after the OS has
    # started the child but before asyncio has returned its Process handle.
    # Pass an argument vector directly; using a shell here would enable command
    # injection through frame input.
    creation = asyncio.create_task(
        asyncio.create_subprocess_exec(
            "cansend",
            CHANNEL,
            f"{int(can_id, 16):03X}#{payload}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
    )
    try:
        process = await asyncio.shield(creation)
    except asyncio.CancelledError:
        _track_background_emit(
            asyncio.create_task(
                _finish_cancelled_process_creation(
                    creation,
                    metadata_key,
                    pending_echo,
                )
            )
        )
        raise
    except BaseException:
        if pending_echo is not None:
            _remove_pending_echo(metadata_key, pending_echo)
        raise

    try:
        await process.wait()
    except BaseException:
        returncode = process.returncode
        if pending_echo is not None and returncode != 0:
            # Only an in-flight process has uncertain transmission.  A known
            # success keeps its metadata for candump; a known failure needs no
            # echo tombstone.  If candump already consumed this exact echo,
            # the atomic helper finds nothing and leaves later traffic alone.
            _remove_pending_echo(
                metadata_key,
                pending_echo,
                remember_cleared=returncode is None,
            )
        raise
    if process.returncode == 0:
        return True
    if pending_echo is not None:
        _remove_pending_echo(metadata_key, pending_echo)
    return False


async def pump() -> None:
    """candump을 하나만 띄워 모든 클라이언트에 뿌립니다.

    클라이언트마다 띄우면 프로세스가 접속자 수만큼 늘어납니다.
    """
    if MODE == "loopback":
        return  # loopback에서는 emit()이 직접 방송합니다.

    while True:
        process = await asyncio.create_subprocess_exec(
            "candump", "-L", CHANNEL, stdout=asyncio.subprocess.PIPE
        )
        assert process.stdout is not None
        async for raw in process.stdout:
            event = parse_candump(raw.decode(errors="ignore"))
            if event is not None:
                await publish_observed_event(event)
        # candump이 죽으면(인터페이스 down 등) 잠깐 쉬었다 다시 붙습니다.
        await asyncio.sleep(2)


# --------------------------------------------------------------- 차량 명령

# 프레임 규격 (프론트 vehicleStore.ts와 짝을 이룹니다)
#
#   0x101  도어    data[0] 왼쪽 상태, data[1] 오른쪽 상태   (00=열림 01=닫힘)
#   0x200  트렁크  data[0] 상태                             (01=열림 00=닫힘)
#
# 명령("왼쪽을 열어라")이 아니라 상태("왼쪽 열림, 오른쪽 닫힘")를 싣습니다.
# 프레임 하나가 항상 전체 상태를 담고 있어야, ID별 마지막 프레임만 기억하는
# 스냅샷이 정확해집니다. 명령형이면 "왼쪽 열기" 다음 "오른쪽 열기"를 보냈을 때
# 앞 프레임이 덮여 왼쪽이 닫힌 것으로 복원됩니다.
CAN_ID_DOOR: Final = "0x101"
CAN_ID_TRUNK: Final = "0x200"

_CLOSED: Final = "01"
_OPEN: Final = "00"


def current_door_state() -> list[str]:
    """마지막으로 나간 도어 프레임에서 좌·우 상태를 읽습니다. 없으면 닫힘."""
    event = _last_frames.get(CAN_ID_DOOR)
    data: list[str] = event["frame"]["data"] if event else []
    if len(data) >= 2:
        return [data[0], data[1]]
    if len(data) == 1:
        return [data[0], data[0]]  # 1바이트 구형 프레임은 양쪽 같은 값
    return [_CLOSED, _CLOSED]


class DoorCommand(BaseModel):
    action: Literal["open", "close"]
    side: Literal["both", "L", "R"] = "both"


class TrunkCommand(BaseModel):
    action: Literal["open", "close"]


class RawFrame(BaseModel):
    """일반 프레임 주입. 도어·트렁크 외의 실습에 씁니다."""

    can_id: str = Field(pattern=r"^(0[xX])?[0-9a-fA-F]{1,3}$")
    data: list[str] = Field(default_factory=list, max_length=8)


class CommandResult(BaseModel):
    ok: bool
    can_id: str
    data: list[str]
    mode: Mode
    channel: str


def _result(ok: bool, can_id: str, data: list[str]) -> CommandResult:
    return CommandResult(ok=ok, can_id=can_id, data=data, mode=MODE, channel=CHANNEL)


@router.post("/can/door", response_model=CommandResult, tags=["vehicle"])
async def control_door(command: DoorCommand) -> CommandResult:
    """차량 도어를 여닫습니다.

    한쪽만 지정해도 프레임에는 양쪽 상태가 모두 실립니다.
    반대쪽은 직전 상태를 그대로 유지합니다.
    """
    value = _OPEN if command.action == "open" else _CLOSED
    left, right = current_door_state()
    if command.side in ("both", "L"):
        left = value
    if command.side in ("both", "R"):
        right = value
    data = [left, right]
    return _result(await emit(CAN_ID_DOOR, data), CAN_ID_DOOR, data)


@router.post("/can/trunk", response_model=CommandResult, tags=["vehicle"])
async def control_trunk(command: TrunkCommand) -> CommandResult:
    """트렁크(리프트게이트)를 여닫습니다."""
    data = ["01" if command.action == "open" else "00"]
    return _result(await emit(CAN_ID_TRUNK, data), CAN_ID_TRUNK, data)


@router.post("/can/send", response_model=CommandResult, tags=["can"])
async def send_frame(frame: RawFrame) -> CommandResult:
    """임의의 프레임을 버스에 올립니다."""
    can_id = normalize_can_id(frame.can_id)
    data = normalize_data(frame.data)
    return _result(await emit(can_id, data), can_id, data)


@router.get("/can/status", tags=["can"])
async def can_status() -> dict[str, Any]:
    return {
        "mode": MODE,
        "channel": CHANNEL,
        "clients": len(_clients),
        "snapshot": len(_last_frames),
    }


@router.get("/can/snapshot", tags=["can"])
async def can_snapshot() -> dict[str, Any]:
    """새 브라우저가 접속하면 받게 될 프레임들. 디버깅용입니다."""
    return {"frames": list(_last_frames.values())}


@router.delete("/can/snapshot", tags=["can"])
async def clear_snapshot() -> dict[str, Any]:
    """캐시를 비웁니다. 다음 실습을 깨끗한 상태로 시작할 때 씁니다.

    이미 접속해 있는 브라우저의 화면은 바꾸지 않습니다.
    실제로 닫으려면 닫기 프레임을 쏘세요.
    """
    with _echo_state_lock:
        cleared = len(_last_frames)
        _last_frames.clear()
        for key in list(_pending_echoes):
            _invalidate_pending_echoes(key)
        _purge_expired_cleared_echoes()
        return {"cleared": cleared}


# --------------------------------------------------------------- WebSocket


def _register_client_and_capture_snapshot(
    client: _ClientConnection,
) -> tuple[str, ...]:
    """Atomically split history from future live events for one connection."""
    with _echo_state_lock:
        payloads = tuple(
            json.dumps({**event, "replay": True})
            for event in _last_frames.values()
        )
        _clients.add(client)
        return payloads


async def _send_snapshot_and_backlog(
    client: _ClientConnection,
    snapshot: tuple[str, ...],
) -> bool:
    """Run with ``send_lock`` held so live sends cannot overtake replay."""
    try:
        for payload in snapshot:
            await asyncio.wait_for(
                client.websocket.send_text(payload),
                timeout=_CLIENT_SEND_TIMEOUT_SECONDS,
            )

        while True:
            with _echo_state_lock:
                if client.evicted:
                    return False
                pending = tuple(client.backlog)
                client.backlog.clear()
                if not pending:
                    client.replaying = False
                    return True
            for payload in pending:
                await asyncio.wait_for(
                    client.websocket.send_text(payload),
                    timeout=_CLIENT_SEND_TIMEOUT_SECONDS,
                )
    except asyncio.CancelledError:
        raise
    except Exception:
        _evict_client(client)
        return False


async def _wait_for_disconnect_or_eviction(client: _ClientConnection) -> None:
    """Observe either peer disconnect or server eviction without orphan tasks."""
    while not client.evicted_event.is_set():
        receive = asyncio.create_task(client.websocket.receive_text())
        evicted = asyncio.create_task(client.evicted_event.wait())
        tasks = (receive, evicted)
        try:
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        if evicted in done:
            await asyncio.gather(receive, return_exceptions=True)
            return
        try:
            receive.result()
        except (WebSocketDisconnect, RuntimeError):
            return


@router.websocket("/ws/can")
async def can_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    client = _ClientConnection(
        websocket=websocket,
        loop=asyncio.get_running_loop(),
    )
    registered = False
    try:
        # Acquire before registration.  A live sender that sees this client
        # therefore cannot overtake its snapshot/backlog handoff.
        await client.send_lock.acquire()
        try:
            snapshot = _register_client_and_capture_snapshot(client)
            registered = True
            ready = await _send_snapshot_and_backlog(client, snapshot)
        finally:
            client.send_lock.release()
        if not ready:
            return
        await _wait_for_disconnect_or_eviction(client)
    finally:
        if registered:
            _evict_client(client)
