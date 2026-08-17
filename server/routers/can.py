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
import json
import os
import shutil
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

_clients: set[WebSocket] = set()
_sequence = count(1)

# CAN ID별 마지막 프레임. 새로 접속한 브라우저에게 현재 상태를 알려주는 데 씁니다.
#
# 연결이 끊긴 동안 지나간 프레임은 되돌릴 수 없습니다. 그래서 접속 직후 한 번,
# 각 ID의 마지막 프레임을 재생해 줍니다. 서버는 여전히 "문"이 무엇인지 모릅니다 —
# 마지막으로 본 바이트를 그대로 다시 보낼 뿐이고, 해석은 브라우저가 합니다.
# 표준 CAN 프레임 ID는 0x7ff까지라 이 dict는 자연히 2048개로 묶입니다.
_last_frames: dict[str, dict[str, Any]] = {}


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


def build_event(can_id: str, data: list[str], *, timestamp_ms: int, channel: str) -> dict[str, Any]:
    """프론트의 CanEvent(types.ts)와 같은 모양의 dict를 만듭니다."""
    return {
        "eventId": f"can-{next(_sequence):06d}",
        "timestamp": timestamp_ms,
        "channel": channel,
        "origin": "backend",
        "frame": {"canId": can_id, "dlc": len(data), "data": data},
        # 의미 해석은 프론트가 합니다. 여기서는 비워 둡니다.
        "context": {},
    }


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
        timestamp_ms = int(float(raw_ts.strip("()")) * 1000)
        can_id = normalize_can_id(raw_id)
    except ValueError:
        return None
    return build_event(can_id, normalize_data(payload), timestamp_ms=timestamp_ms, channel=channel)


# --------------------------------------------------------------- 브로드캐스트

async def broadcast(event: dict[str, Any]) -> None:
    _last_frames[event["frame"]["canId"]] = event
    payload = json.dumps(event)
    for client in list(_clients):
        try:
            await client.send_text(payload)
        except Exception:
            _clients.discard(client)  # 끊긴 클라이언트는 조용히 정리합니다.


async def send_snapshot(websocket: WebSocket) -> None:
    """접속 직후 현재 상태를 한 번 재생합니다.

    replay=True가 붙어 있어 브라우저가 새 트래픽과 구분할 수 있습니다.
    (Monitor 목록에는 넣지 않고, 차량 상태에만 반영합니다.)
    """
    for event in list(_last_frames.values()):
        await websocket.send_text(json.dumps({**event, "replay": True}))


async def emit(can_id: str, data: list[str]) -> bool:
    """프레임 하나를 버스에 올립니다. 브라우저 전달은 구독 루프가 맡습니다."""
    if MODE == "loopback":
        loop_ms = int(asyncio.get_running_loop().time() * 1000)
        await broadcast(build_event(can_id, data, timestamp_ms=loop_ms, channel=CHANNEL))
        return True

    payload = "".join(data)
    # 셸을 거치지 않고 인자 배열로 실행합니다. 문자열을 그대로 넘기면 명령 주입이 됩니다.
    process = await asyncio.create_subprocess_exec(
        "cansend",
        CHANNEL,
        f"{int(can_id, 16):03X}#{payload}",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await process.wait()
    return process.returncode == 0


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
                await broadcast(event)
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
    cleared = len(_last_frames)
    _last_frames.clear()
    return {"cleared": cleared}


# --------------------------------------------------------------- WebSocket

@router.websocket("/ws/can")
async def can_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    # 스트림에 넣기 전에 스냅샷을 보냅니다. 순서가 반대면 재생 중에 들어온
    # 새 프레임이 오래된 값에 덮여 상태가 뒤집힐 수 있습니다.
    await send_snapshot(websocket)
    _clients.add(websocket)
    try:
        while True:
            # 클라이언트 입력은 쓰지 않습니다. 연결 유지 및 종료 감지용입니다.
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _clients.discard(websocket)
