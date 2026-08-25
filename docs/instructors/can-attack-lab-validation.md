# 교사용 CAN Attack Lab 검증 가이드 — 정답 포함

> **경고: 이 문서는 Door, Spoofing, Replay의 정답 ID·payload·명령을 포함한다. 학습자에게 배포하지 않는다.**

이 runbook은 격리된 로컬 Toy 환경의 구현 계약을 검증한다. 실제 차량·OEM ECU·상용 IDS의 공격 가능성 또는 우회를 입증하지 않는다.

## 1. 공통 배포와 health

저장소 루트의 PowerShell에서 실행한다.

```powershell
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps
Invoke-WebRequest http://127.0.0.1:8010/health
Invoke-WebRequest http://127.0.0.1:8447/health
```

기대 결과:

- `backend`와 `frontend`가 모두 `healthy`
- 두 health 요청 모두 HTTP `200`
- 공개 포트가 `127.0.0.1:8010->8010/tcp`, `127.0.0.1:8447->8080/tcp`뿐이며 `0.0.0.0`/`[::]` binding이 없음
- backend는 `CANLITE_CAN_MODE=loopback`, `CANLITE_ENABLE_REAL_TERMINAL=false`

종료:

```powershell
docker compose down
```

Docker daemon이 없으면 `docker compose config --quiet`까지만 정적 검증하고, 아래처럼 direct runtime을 시작한다.

```powershell
$env:CANLITE_CAN_MODE = "loopback"
$env:CANLITE_ENABLE_REAL_TERMINAL = "false"
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8010
```

다른 PowerShell:

```powershell
npm run build
.\node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 8447
```

## 2. PowerShell REST helper

브라우저 UI와 같은 public API를 독립적으로 확인할 때 사용한다.

```powershell
$Api = "http://127.0.0.1:8010"
function Invoke-LabPost([string]$Uri, [hashtable]$Body) {
  Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Compress)
}
```

응답에서 공통으로 확인할 필드는 `state.stage`, `code`, `attempts[].verdict`, `idsStatus`, `state.vehicleState`, `state.attemptCount`, `state.completed`다. Beginner public initial state에는 정답 ID·payload·capture bytes·solution command가 없어야 한다.

## 3. Door full-chain 정답 흐름

### UI와 초기 상태

- 이동: **공격 실습 → 전체 공격 체인**
- 보이는 제목: `Door Attack Workbench`
- 초기 Stage: `정찰`
- Target: `BODY ECU`; target map의 `Body ECU`와 `Left Door` 의미 및 truth qualifier 확인
- 초기 GLB: left/right door 모두 closed
- 초기 Evidence: Toy IDS `PENDING`, Attempts `0`, Proof `NOT YET`

REST session 생성:

```powershell
$Door = Invoke-RestMethod -Method Post "$Api/labs/door-blackbox/sessions"
$DoorId = $Door.sessionId
```

### Terminal 관찰과 Replay 실패

UI의 Restricted terminal에 순서대로 입력한다.

```text
pwd
ls
cat baseline.log
cat door-open.log
cansend vcan0 456#010110B5
```

REST 등가 명령:

```powershell
Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/terminal" @{ command = "pwd" }
Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/terminal" @{ command = "ls" }
Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/terminal" @{ command = "cat baseline.log" }
Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/terminal" @{ command = "cat door-open.log" }
$DoorReplay = Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/terminal" @{ command = "cansend vcan0 456#010110B5" }
$DoorReplay | ConvertTo-Json -Depth 8
```

기대 결과:

- `pwd`, `ls`, 두 `cat`의 terminal code는 `OK`
- 두 log 관찰 후 Stage `분석`, monitor에 `OBSERVED` 12행
- replay attempt: top-level `code=COUNTER_REJECTED`, `ok=false`, frame verdict `COUNTER_REJECTED`
- 화면 Stage `Replay 실패`, Toy IDS `ALERT`, Attempts `1`, Proof `NOT YET`
- monitor는 replay rejected 행을 포함해 총 13행
- rejected 행을 선택하면 Binary inspector가 `01 01 10 B5`를 표시
- GLB left/right door는 모두 closed로 유지

### Editor 성공

Lab script를 다음으로 교체하고 **스크립트 실행**을 누른다.

```text
interval_ms=100
cansend vcan0 456#000113B7
cansend vcan0 456#000114B0
cansend vcan0 456#000115B1
```

REST 등가 명령:

```powershell
$DoorScript = @"
interval_ms=100
cansend vcan0 456#000113B7
cansend vcan0 456#000114B0
cansend vcan0 456#000115B1
"@
$DoorSuccess = Invoke-LabPost "$Api/labs/door-blackbox/sessions/$DoorId/run" @{ script = $DoorScript }
$DoorSuccess | ConvertTo-Json -Depth 8
```

기대 결과:

- `attempts[].verdict`가 차례로 `EXECUTED`, `EXECUTED`, `EXECUTED`
- `idsStatus=NORMAL`, `state.stage=증거`, `state.completed=true`, total Attempts `4`
- live CAN stream의 accepted 세 행이 도착한 뒤 monitor 총 16행; 각 행 source `CAN stream`, verdict `EXECUTED`
- 마지막 행을 선택하면 Binary inspector가 `00 01 15 B1`을 표시
- target focus는 Toy Body ECU, effect focus는 Left Door 의미를 보여 줌
- GLB left door open, right door closed

Reset:

```powershell
$DoorReset = Invoke-RestMethod -Method Post "$Api/labs/door-blackbox/sessions/$DoorId/reset"
$DoorReset | ConvertTo-Json -Depth 6
```

UI의 **실습 초기화**와 같은 기대 상태는 generation `+1`, Stage `정찰`, Attempts `0`, Proof `NOT YET`, left/right closed, monitor `0`, terminal entry/history 없음, editor placeholder 복원, Toy IDS `PENDING`이다.

## 4. Spoofing 정답 흐름

### UI와 관찰

- 이동: **공격 실습 → Spoofing**
- 보이는 제목: `CAN Spoofing Basics`
- 초기 Stage: `RECON`; Target `REAR ECU`; GLB/Toy effect `TAILGATE`
- target map: `OBD-II → IDS → Gateway → Rear ECU → Tailgate`

Virtual terminal의 정확한 관찰 명령:

```text
pwd
ls
candump -L vcan0
cat message-map.txt
cansend vcan0 5A1#01
```

REST 등가 흐름:

```powershell
$Spoof = Invoke-RestMethod -Method Post "$Api/labs/can-attacks/spoofing/sessions"
$SpoofId = $Spoof.sessionId
Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "pwd" }
Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "ls" }
$SpoofObserved = Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "candump -L vcan0" }
$SpoofMap = Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "cat message-map.txt" }
$SpoofSuccess = Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "cansend vcan0 5A1#01" }
$SpoofSuccess | ConvertTo-Json -Depth 8
```

단계별 기대 결과:

| 동작 | code | 화면 Stage | monitor |
| --- | --- | --- | --- |
| session 생성 | 해당 없음 | `RECON` | 0행 |
| `pwd`, `ls` | `OK` | `RECON` | 0행 |
| `candump -L vcan0` | `OBSERVED` | `OBSERVE` | 정상 closed frame 1행 |
| `cat message-map.txt` | `OBSERVED` | `CRAFT` | 변화 없음 |
| 정답 `cansend` | `EXECUTED` | `EVIDENCE` | accepted live event 추가, 총 2행 |

완료 증거:

- response `ok=true`, `attempts[0].verdict=EXECUTED`, `idsStatus=NORMAL`, `completed=true`, Attempts `1`
- live event `lab.scenario=spoofing`, `context.target=rear`, `context.action=TAILGATE_OPEN`
- accepted monitor 행 source `CAN stream`, verdict `EXECUTED`; 선택 시 Binary inspector `01`
- target은 Toy Rear ECU; GLB는 tailgate만 open, left/right door closed
- Evidence에는 `kind=attempt`, `status=EXECUTED`

### Spoofing negative와 reset

서로 영향을 주지 않도록 각 명령 전 reset하거나 새 session을 만든다.

| 입력 | 실제 stable code | GLB/완료 |
| --- | --- | --- |
| `cansend vcan0 5A0#01` | `TARGET_ID_MISMATCH` | 모두 closed, `completed=false` |
| `cansend vcan0 5A1#0100` | `LENGTH_INVALID` | 모두 closed, `completed=false` |
| `cansend vcan0 5A1#02` | `STATE_INVALID` | 모두 closed, `completed=false` |
| `cansend vcan0 5A1#01; whoami` | `UNSAFE_SYNTAX` | attempt 생성 없음, 모두 closed |

예시:

```powershell
Invoke-LabPost "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/terminal" @{ command = "cansend vcan0 5A0#01" }
$SpoofReset = Invoke-RestMethod -Method Post "$Api/labs/can-attacks/spoofing/sessions/$SpoofId/reset"
```

reset 후 generation `+1`, Stage `RECON`, Attempts `0`, Last verdict `NONE`, Completed `NO`, 세 effect closed, monitor/terminal/editor 초기화다. Rejected REST 행은 monitor evidence로만 보이고 GLB를 움직이지 않는다.

## 5. Replay 정답 흐름

### UI와 capture/playback

- 이동: **공격 실습 → Replay**
- 보이는 제목: `CAN Replay Basics`
- 초기 Stage: `RECON`; Target `BODY ECU`; GLB/Toy effect `LEFT DOOR`
- target map: `OBD-II → IDS → Gateway → Body ECU → Left Door`

Virtual terminal:

```text
candump -L vcan0 > capture.log
cat capture.log
canplayer -I capture.log -l 1
```

REST 등가 흐름:

```powershell
$Replay = Invoke-RestMethod -Method Post "$Api/labs/can-attacks/replay/sessions"
$ReplayId = $Replay.sessionId
$Captured = Invoke-LabPost "$Api/labs/can-attacks/replay/sessions/$ReplayId/terminal" @{ command = "candump -L vcan0 > capture.log" }
$Inspected = Invoke-LabPost "$Api/labs/can-attacks/replay/sessions/$ReplayId/terminal" @{ command = "cat capture.log" }
$ReplaySuccess = Invoke-LabPost "$Api/labs/can-attacks/replay/sessions/$ReplayId/terminal" @{ command = "canplayer -I capture.log -l 1" }
$ReplaySuccess | ConvertTo-Json -Depth 8
```

단계별 기대 결과:

| 동작 | code | 화면 Stage | monitor |
| --- | --- | --- | --- |
| capture | `CAPTURED` | `CAPTURE` | capture 1행 |
| `cat capture.log` | `OBSERVED` | `EXECUTE` | 같은 `captureId`로 deduplicate, 1행 유지 |
| playback | `EXECUTED` | `EVIDENCE` | ordinary accepted live event 추가, 총 2행 |

완료 증거:

- capture와 playback frame이 모두 ID `0x5A2`, DLC `2`, DATA `00 01`로 byte-identical
- response `ok=true`, `attempts[0].verdict=EXECUTED`, `idsStatus=NORMAL`, `completed=true`, Attempts `1`
- live event `lab.scenario=replay`, `context.target=body`, `context.action=LEFT_DOOR_OPEN`
- live WebSocket event 최상위에 `replay` key가 없음. 즉 snapshot marker인 top-level `replay:true`를 사용하지 않는 ordinary live event임
- accepted monitor 행 source `CAN stream`, verdict `EXECUTED`; 선택한 Binary inspector는 `00`, `01`
- Toy Body ECU가 target이고 GLB는 left door open, right door/tailgate closed

### Replay negative, old generation, reset

| 조건/입력 | 실제 stable code | 설명 |
| --- | --- | --- |
| capture 전 `canplayer -I capture.log -l 1` | `CAPTURE_REQUIRED` | capture provenance 없음 |
| `canplayer -I unknown.log -l 1` | `CAPTURE_FILE_UNKNOWN` | 허용된 capture 파일 아님 |
| capture 후 `canplayer -I capture.log -l 2` | `REPEAT_COUNT_INVALID` | literal repeat `1`만 허용 |
| `cansend vcan0 5A2#0001` | `SCENARIO_COMMAND_UNSUPPORTED` | Replay의 final method가 아님 |
| 내부 capture record의 generation이 현재와 다름 | `CAPTURE_GENERATION_MISMATCH` | stale capture 방어 계약 |

공개 REST reset은 stale capture를 유지하지 않고 파일 자체를 지운다. 따라서 정상 public flow에서 reset 뒤 playback을 시도하면 `CAPTURE_GENERATION_MISMATCH`가 아니라 `CAPTURE_REQUIRED`가 맞다. 내부 old-generation 방어 code는 다음 실제 domain test가 검증한다.

```powershell
.\.venv\Scripts\python.exe -X dev -m pytest server\tests\test_can_attack_basics.py::test_replay_requires_current_same_session_unmodified_capture_and_exact_repeat_count -q
```

reset:

```powershell
$ReplayReset = Invoke-RestMethod -Method Post "$Api/labs/can-attacks/replay/sessions/$ReplayId/reset"
$AfterResetPlayback = Invoke-LabPost "$Api/labs/can-attacks/replay/sessions/$ReplayId/terminal" @{ command = "canplayer -I capture.log -l 1" }
```

기대 상태는 generation `+1`, Stage `RECON`, Attempts `0`, Last verdict `NONE`, Completed `NO`, left/right/tailgate closed, monitor `0`, terminal/history 없음, editor placeholder 복원이다. 그 뒤 playback 응답은 `CAPTURE_REQUIRED`; 이 rejected 행을 제외한 reset 직후 GLB는 변하지 않는다.

## 6. 브라우저 판정 체크리스트

각 viewport를 새 page load로 확인한다.

- desktop `1440×900`: sidebar → Door → Spoofing → Replay
- tablet `820×1180`: 차량과 target map 카드가 겹치지 않으며 body horizontal overflow 없음
- fresh mobile `390×844`: 모바일 **공격 실습** → tabs로 진입; desktop 진입 후 resize한 결과로 대체하지 않음
- Canvas 중앙에는 작은 번호 pin/route만 있고 큰 설명 card가 GLB를 덮지 않음
- Door focus는 Body ECU/Left Door, Spoofing은 Rear ECU/Tailgate, Replay는 Body ECU/Left Door 의미를 표시
- rejected/wrong/stale event는 GLB를 바꾸지 않음
- reset은 affected part를 닫고 monitor/editor/terminal 상태를 초기화
- framework overlay, uncaught console error, failed resource가 없음

## 7. 문제 해결과 한계

- `Cannot connect to the Docker daemon`: Docker Desktop/Engine의 Server 상태를 먼저 확인하고, daemon을 사용할 수 없으면 direct runtime 결과만 보고한다.
- backend offline: `Invoke-WebRequest http://127.0.0.1:8010/health`, Uvicorn log, 포트 충돌을 확인한다.
- frontend health만 성공하고 API가 실패: browser hostname과 `:8010` CORS/origin, `VITE_CAN_STREAM_URL` override를 확인한다.
- WebSocket 행이 늦음: REST response의 current session/generation을 확인하고 잠시 기다린 뒤 live event의 동일 correlation과 `ACCEPT/EXECUTED`를 검증한다.
- WebGL/GLB 실패: console과 `/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb` resource를 확인한다.
- 초기 UI/public API/frontend production bundle은 정답을 생략하지만 repository 또는 backend image owner는 server source와 이 instructor 문서를 읽을 수 있다. source/image secrecy를 주장하지 않는다.
