# Black-box CAN Door Attack Lab Specification

## Problem and user

CANLite의 `attacks/chain` 화면은 현재 정적 미리보기라서 학습자가 관찰·가설·실패·수정·증명 과정을 수행할 수 없다. 대상 사용자는 CAN 기본 프레임과 Linux 기본 명령을 배운 자동차 보안 입문자다.

## Goal

격리된 로컬 교육 환경에서 학습자가 잡음이 섞인 CAN 기록을 분석하고, Toy Body ECU의 rolling counter와 checksum을 추론하며, 왼쪽 문 상태를 변경하는 프레임 시퀀스를 제작하고, Toy IDS 규칙까지 통과한 증거를 확인하게 한다.

## Success criteria

1. `attacks/chain`에서 기존 CANLite ver4 AppShell/Sidebar 안에 실습 페이지가 열린다.
2. 실제 `RIDGEX_ROCKER_CLEANUP_V7_01.glb`가 크게 보이고 Body ECU와 Left Door가 구분된다.
3. 페이지에 단계 rail, code/script 입력, binary inspector, network monitor, 제한된 terminal이 함께 보인다.
4. 학습자는 처음에 CAN ID, payload 의미, checksum 공식을 받지 않는다.
5. `ls`, `pwd`, `whoami`, `cat`, `ip ... vcan0`, `candump ... vcan0`, `cansend ...`의 교육용 제한 명령이 동작한다.
6. 잘못된 DLC, checksum, counter 프레임은 `BLOCKED`이며 GLB 상태를 바꾸지 않는다.
7. 승인된 lab-only `0x456` 상태 이벤트만 기존 `/ws/can → vehicleStore → useVehicleRig` 경로로 전달되어 왼쪽 문을 움직인다. 이벤트의 `context.command: DOOR_LOCK`를 사용하므로 공개 tutorial의 `0x101` raw-ID mapping에 의존하지 않는다.
8. 올바른 3프레임 시퀀스를 80–120 ms 간격으로 제출하면 왼쪽 문만 열리고 Toy IDS가 `NORMAL`을 반환하며 실습이 완료된다.
9. 프론트 typecheck/build, backend pytest, frontend unit tests가 통과한다.
10. Docker Compose가 non-root, read-only, loopback Toy bus 기본값으로 로컬에서 실행되도록 정의된다.

## Threat model and safety boundary

- 자산: 호스트 파일, Docker daemon, backend source/private scenario, 사용자 PC 네트워크.
- 공격자 위치: 교육용 웹 페이지의 학습자 입력창.
- 통제 입력: 제한 terminal command와 lab script 문자열.
- 신뢰 경계: 브라우저 ↔ FastAPI lab API ↔ pure Toy ECU/IDS domain ↔ accepted CAN event.
- 임의 Python, Bash, `eval`, `exec`, `shell=True`, Docker socket, host bind mount를 사용하지 않는다.
- 기존 `/ws/terminal` PTY는 이 실습 페이지에서 사용하지 않는다. 실습은 명령 whitelist를 해석하는 virtual terminal을 사용한다.
- Docker는 `privileged`, host network/PID namespace, host CAN 공유 없이 `CANLITE_CAN_MODE=loopback`으로 시작한다.
- UI와 문서에는 “Toy ECU”, “Toy IDS”, “교육용 논리 ECU 위치”라는 표현을 유지한다.

## Toy message contract (server private, lab-only)

이 계약은 Black-box Toy lab에만 쓰는 교육용 ID다. 공개 차량 tutorial과 일반 `/can/door`의 `0x101` mapping은 별개이며 변경하지 않는다. 차량 rig 호환을 위해 앞 두 바이트 계약은 유지하고 freshness 바이트를 뒤에 추가한다.

| Field | Meaning |
|---|---|
| CAN ID | `0x456` |
| DLC | `4` |
| DATA[0] | left door: `00=open`, `01=closed` |
| DATA[1] | right door: `00=open`, `01=closed` |
| DATA[2] | 8-bit rolling counter |
| DATA[3] | `DATA[0] XOR DATA[1] XOR DATA[2] XOR 0xA5` |

Reset의 마지막 정상 counter는 `0x12`이며 다음 승인 counter는 `0x13`이다. 이 값과 공식은 public state/API metadata에 직접 제공하지 않는다. 학습자는 다음 기록에서 관계를 추론한다.

- `baseline.log`: `01 01 10 B5`, `01 01 11 B4`, `01 01 12 B7`
- `door-open.log`: `00 01 20 84`, `00 01 21 85`, `00 01 22 86`
- 다른 CAN ID의 noise frame을 함께 제공한다.

## Toy ECU and Toy IDS behavior

Toy Body ECU validation order:

1. CAN ID가 다르면 `TARGET_ID_MISMATCH`.
2. DLC가 4가 아니면 `LENGTH_INVALID`.
3. hex byte가 잘못되면 `DATA_INVALID`.
4. checksum이 다르면 `CHECKSUM_INVALID`.
5. counter가 기대값과 다르면 `COUNTER_REJECTED`.
6. 모두 맞으면 `EXECUTED`; counter와 door state를 갱신한다.

Toy IDS sequence rules:

- 모든 frame이 ECU에서 승인되어야 한다.
- 정확히 3개 frame이어야 한다. 아니면 `SEQUENCE_LENGTH_ANOMALY`.
- interval은 80–120 ms여야 한다. 아니면 `FREQUENCY_ANOMALY`.
- counter는 각 frame에서 연속 증가해야 한다.
- 왼쪽 `00`, 오른쪽 `01` 상태가 유지되어야 한다.

단일 유효 frame은 차량 영향은 만들 수 있지만 IDS alert가 남아 최종 완료가 아니다.

## Learner script format

임의 코드를 실행하지 않고 다음의 제한 형식만 해석한다.

```text
# comments are allowed
interval_ms=100
cansend vcan0 456#000113B7
cansend vcan0 456#000114B0
cansend vcan0 456#000115B1
```

- `interval_ms`는 정수 10–2000만 허용한다.
- `cansend` line은 정확히 1–8 CAN byte만 허용한다.
- script는 최대 20줄, 4096자다.
- server router는 승인된 frame 사이에 해당 interval만큼 await하여 `/ws/can`에 순서대로 내보낸다.

## API contract

Base path: `/labs/door-blackbox`

- `POST /sessions`: 새 in-memory session을 만들고 public state를 반환한다. single-user lab에서는 생성 전에 lab-only `0x456` accepted replay snapshot과 보류 metadata를 정리하며, 다른 CAN ID snapshot은 보존한다.
- `GET /sessions/{session_id}`: current public state를 반환한다.
- `POST /sessions/{session_id}/reset`: session과 lab-only `0x456` accepted replay state를 초기화한다. 응답의 `vehicleState`는 연결된 UI가 로컬 rig를 reset하는 계약이며, 다른 CAN ID snapshot은 보존한다.
- `POST /sessions/{session_id}/terminal` body `{ "command": string }`: virtual command 결과와 optional structured frames를 반환한다.
- `POST /sessions/{session_id}/run` body `{ "script": string }`: parsed attempts, ECU/IDS verdict, state를 반환한다.

Public state에는 `sessionId`, `stage`, `targetLabel`, `messageContractStatus`, `vehicleState`, `evidence`, `attemptCount`, `completed`만 포함한다. checksum seed/formula와 expected counter는 포함하지 않는다.

`run`의 각 attempt와 terminal의 structured capture frame은 `attemptId`, epoch-millisecond `timestamp`, `canId`, `data`, `verdict`를 반환한다. 스크립트 attempt timestamp는 선언된 `interval_ms` 순서를 반영하고, capture timestamp는 candump 기록 원본을 보존한다.

Accepted CAN event metadata:

```json
{
  "context": {
    "command": "DOOR_LOCK",
    "source": "obd",
    "target": "body",
    "route": ["obd", "ids", "gateway", "body"],
    "meaning": "Toy Body ECU accepted state frame",
    "action": "LEFT_DOOR_OPEN"
  },
  "processing": {
    "filterResult": "ACCEPT",
    "executionResult": "EXECUTED"
  },
  "monitoring": {
    "idsObserved": true,
    "status": "NORMAL"
  },
  "lab": {
    "labId": "door-blackbox-v1",
    "sessionId": "<opaque-session-id>"
  }
}
```

Loopback event timestamp은 epoch milliseconds를 사용한다. Rejected attempts are returned to the attack page monitor but are not emitted as vehicle state events.

## Frontend behavior

- `AttackPracticePage` keeps existing Spoofing/Replay/DoS static pages and renders `DoorAttackLabPage` only for `attacks/chain`.
- Stage order: `정찰 → 캡처 → 분석 → Replay 실패 → 프레임 제작 → IDS 검증 → 증거`.
- Body ECU target is visible as a red education overlay; CAN ID/payload stays `UNKNOWN` until learner evidence reveals it.
- Actual GLB uses `useVehicleRig`; `useCanVehicleStream` is connected exactly once.
- Network list keeps at most 300 items and selected row drives the binary inspector.
- Code/script panel starts without the answer.
- Virtual terminal supports command history and shows that it is a restricted lab shell.
- API/backend offline state is explicit and does not fake success.
- Respect `prefers-reduced-motion`; no mandatory auto-rotation.

## Docker deployment

- Frontend multi-stage build served by nginx on container port 8080, host `127.0.0.1:8447`.
- FastAPI served on container port 8010, host `127.0.0.1:8010`.
- API image runs as non-root, `read_only: true`, `tmpfs: /tmp`, `cap_drop: ALL`, `no-new-privileges:true`, CPU/memory/PID limits.
- No host source mount and no Docker socket.
- Default `CANLITE_CAN_MODE=loopback`.

## Explicit exclusions

- Real vehicle or physical CAN validation
- OEM message contract, MAC, E2E protection, real IDS bypass claims
- RCE/LPE/UDS implementation
- Arbitrary shell/Python execution
- Multi-user dynamic sandbox provisioning
- SQLite progress persistence
- Physical door opening claim; GLB motion is a Toy Vehicle visualization of accepted door state
