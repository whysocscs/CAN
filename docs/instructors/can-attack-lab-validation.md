# 교사용 CAN Attack Lab 검증 가이드 — 정답 포함

> **경고: 이 문서는 Door, Spoofing, Replay의 정답 ID·payload·명령을 포함한다. 학습자에게 배포하지 않는다.**

이 runbook은 격리된 로컬 Toy 환경의 구현 계약을 검증한다. 실제 차량·OEM ECU·상용 IDS의 공격 가능성 또는 우회를 입증하지 않는다.

공격 실습은 두 학습 안내 모드를 제공한다. `초보자용 (Guided)`은 첫 node에서 멈추고 `한 단계 진행` 1회당 장치 하나만 전진하며 상세 원인 카드를 표시한다. `실습자용 (Challenge)`은 같은 authoritative trace를 상세 원인 카드 없이 자동 재생한다. 두 모드 모두 실제 차량 효과는 endpoint에 도달한 뒤에만 적용되어야 한다.

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

### 공통 UI evidence contract

완료 command를 검증할 때 한 화면의 결과를 하나의 출력처럼 취급하지 말고 다음 channel을 분리한다.

- **Virtual Terminal**: terminal-origin action은 command echo와 `stdout`/`stderr`/`silent` stream을 남긴다. script-origin action은 terminal transcript row를 만들지 않는다. 현재의 정확한 script line은 Vehicle Flow에서, script action의 structured result는 Activity에서 확인한다.
- **Vehicle Flow/3D**: `flowTraces`를 authoritative result 이후 Guided의 수동 단계 또는 Challenge의 자동 단계로 재생하는 교육용 흐름이다. 실제 물리 CAN hop telemetry, ACK, ECU 수락의 wire evidence가 아니다.
- **왜 이런 결과가 발생했나요?**: `Terminal`, `Toy ECU`, `Toy IDS`, `교육용 분석` source label을 유지한다. `NORMAL`은 관찰됐으나 Toy rule alert가 없다는 뜻이고, `ALERT`는 탐지됐으나 차단 증거가 없다는 뜻이다.
- **진행 시간**: Guided는 `한 단계 진행` 1회당 일반 node 하나를 전진한다. Challenge는 일반 node를 `600 ms`마다 전진하고 multi-trace script는 한 trace의 final node를 `900 ms` 유지한 뒤 다음 trace를 시작한다. ECU/IDS/effect row와 3D callout은 해당 authoritative node에 도달하기 전에 보이면 안 된다.
- **Learning Check**: backend `completed`가 만든 `공격 조건 충족=달성`과 로컬 `학습 확인 완료=완료`를 별도로 확인한다. 후자는 실행 전 prediction, 해당 action의 monitor frame/Activity evidence 선택, 20자 이상의 비교·reflection을 요구한다.

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

- `pwd`, `ls`, 두 `cat`은 Virtual Terminal command echo와 `stdout`을 남기며 structured result는 `OK`
- 두 log 관찰 후 Stage `분석`, monitor에 `OBSERVED` 12행
- replay attempt: top-level `code=COUNTER_REJECTED`, `ok=false`, frame verdict `COUNTER_REJECTED`
- replay `cansend`는 command echo 뒤 output이 `silent`다. silence는 ECU 수락 증거가 아니며 Why panel의 `Toy ECU=COUNTER_REJECTED`, `Toy IDS=ALERT`와 대조한다.
- Vehicle Flow/3D는 `Training OBD-II → Toy IDS → Toy Gateway → Toy Body ECU`에서 멈추고 final callout은 `Toy Body ECU · REJECTED · Toy ECU`다. `Left Door` route/effect callout은 없어야 한다.
- 화면 Stage `Replay 실패`, Toy IDS `ALERT`, Attempts `1`, Proof `NOT YET`
- monitor는 replay rejected 행을 포함해 총 13행
- rejected 행을 선택하면 Binary inspector가 `01 01 10 B5`를 표시
- Activity에는 `COUNTER_REJECTED`, `가상 CAN 경로 입력 기록됨`, `body`가 같은 action으로 남는다.
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

- 세 completion `cansend`는 Lab script origin이므로 Virtual Terminal에 command echo/stdout/stderr row를 추가하지 않는다. 재생 중 각 정확한 script line은 Vehicle Flow의 current command label로 순서대로 표시된다.
- `attempts[].verdict`가 차례로 `EXECUTED`, `EXECUTED`, `EXECUTED`
- `idsStatus=NORMAL`, `state.stage=증거`, `state.completed=true`, total Attempts `4`
- live CAN stream의 accepted 세 행이 도착한 뒤 monitor 총 16행; 각 행 source `CAN stream`, verdict `EXECUTED`
- accepted 세 행을 차례로 선택하면 Binary Inspector DATA가 `00 01 13 B7`, `00 01 14 B0`, `00 01 15 B1`로 각 command와 일치한다.
- 각 trace의 정확한 3D route는 `Training OBD-II → Toy IDS → Toy Gateway → Toy Body ECU → GLB Left Door`이며 final callout은 `GLB Left Door · EFFECT APPLIED · 교육용 분석`이다.
- progressive reveal에서 OBD-II 전에는 `가상 CAN 경로 입력` row가 없고, IDS 전에는 `Toy IDS`, Body ECU 전에는 `Toy ECU`, endpoint 전에는 `차량 영향` row가 없다. 첫 두 trace의 IDS는 관찰 중이며 전체 sequence `NORMAL`은 마지막 trace의 IDS node에서만 공개된다.
- Activity에는 script action의 `EXECUTED`, `가상 CAN 경로 입력 기록됨`, `차량 영향 적용` evidence가 남는다.
- structured trace를 수락하면 `공격 조건 충족=달성`과 Proof `COMPLETE`가 먼저 보일 수 있지만, GLB effect와 Why의 `차량 영향` row는 각 trace가 Left Door endpoint에 도달할 때만 적용·공개된다. Guided의 1-click-1-node 계약과 Challenge의 `600 ms` node progression/trace 사이 `900 ms` final hold를 각각 확인한다.
- GLB left door open, right door closed이며 `학습 확인 완료`는 prediction/evidence/reflection을 마칠 때까지 `미완료`다.

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

- 이 runbook처럼 Virtual Terminal에서 completion `cansend`를 실행하면 command echo 뒤 stream은 `silent`다. Lab script에서 실행하면 transcript row가 없고 Vehicle Flow/Activity에 command label이 남는다.
- response `ok=true`, `attempts[0].verdict=EXECUTED`, `idsStatus=NORMAL`, `completed=true`, Attempts `1`
- live event `lab.scenario=spoofing`, `context.target=rear`, `context.action=TAILGATE_OPEN`
- accepted monitor 행 source `CAN stream`, verdict `EXECUTED`; 선택 시 Binary inspector `01`
- 정확한 3D route는 `Training OBD-II → Toy IDS → Toy Gateway → Toy Rear ECU → GLB Tailgate`, final callout은 `GLB Tailgate · EFFECT APPLIED · 교육용 분석`이다.
- Why panel은 IDS node 이후 `Toy IDS · 관찰됨 · Toy 규칙 경보 없음`, Rear ECU 이후 `Toy ECU · EXECUTED`, endpoint 이후 `교육용 분석 · 차량 영향 적용`을 순차 공개한다.
- Activity에는 `EXECUTED`, `가상 CAN 경로 입력 기록됨`, `차량 영향 적용`이 남는다. structured trace의 `공격 조건 충족=달성`은 먼저 보일 수 있지만 GLB effect와 Why effect row는 Guided의 수동 진행 또는 Challenge의 `600 ms` 진행이 Tailgate endpoint에 도달했을 때만 적용·공개된다.
- target은 Toy Rear ECU; GLB는 tailgate만 open, left/right door closed
- Evidence에는 `kind=attempt`, `status=EXECUTED`
- `공격 조건 충족=달성`과 `학습 확인 완료`는 자동으로 같아지지 않는다. prediction, accepted monitor frame 선택, 20자 이상 reflection 후에만 후자를 확인한다.

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

- capture redirection은 command echo 뒤 `silent`이며 capture frame은 `Training OBD-II → Network Monitor` evidence route로 처리된다. 3D에는 Training OBD-II까지만 대응하고 ECU/effect callout은 없다. `cat`은 command echo와 captured frame `stdout`을 남긴다.
- 이 runbook처럼 Virtual Terminal에서 completion `canplayer`를 실행하면 command echo 뒤 `silent`다. Lab script에서 실행하면 terminal row가 없고 Vehicle Flow/Activity에 command label이 남는다.
- capture와 playback frame이 모두 ID `0x5A2`, DLC `2`, DATA `00 01`로 byte-identical
- response `ok=true`, `attempts[0].verdict=EXECUTED`, `idsStatus=NORMAL`, `completed=true`, Attempts `1`
- live event `lab.scenario=replay`, `context.target=body`, `context.action=LEFT_DOOR_OPEN`
- live WebSocket event 최상위에 `replay` key가 없음. 즉 snapshot marker인 top-level `replay:true`를 사용하지 않는 ordinary live event임
- accepted monitor 행 source `CAN stream`, verdict `EXECUTED`; 선택한 Binary inspector는 `00`, `01`
- 정확한 playback 3D route는 `Training OBD-II → Toy IDS → Toy Gateway → Toy Body ECU → GLB Left Door`, final callout은 `GLB Left Door · EFFECT APPLIED · 교육용 분석`이다.
- Why panel은 IDS node 이후 `Toy IDS · 관찰됨 · Toy 규칙 경보 없음`, Body ECU 이후 `Toy ECU · EXECUTED`, endpoint 이후 `교육용 분석 · 차량 영향 적용`을 순차 공개한다.
- completion Activity에는 `EXECUTED`, `가상 CAN 경로 입력 기록됨`, `차량 영향 적용`이 남는다. structured trace의 `공격 조건 충족=달성`은 먼저 보일 수 있지만 GLB effect와 Why effect row는 Guided의 수동 진행 또는 Challenge의 `600 ms` 진행이 Left Door endpoint에 도달했을 때만 적용·공개된다.
- Toy Body ECU가 target이고 GLB는 left door open, right door/tailgate closed
- `공격 조건 충족=달성` 뒤에도 prediction, accepted live frame 선택, byte-identical 비교 reflection 없이는 `학습 확인 완료=미완료`다.

### Replay negative, old generation, reset

| 조건/입력 | 실제 stable code | 설명 |
| --- | --- | --- |
| capture 전 `canplayer -I capture.log -l 1` | `CAPTURE_REQUIRED` | capture provenance 없음 |
| `canplayer -I unknown.log -l 1` | `CAPTURE_FILE_UNKNOWN` | 허용된 capture 파일 아님 |
| capture 후 `canplayer -I capture.log -l 2` | `REPEAT_COUNT_INVALID` | literal repeat `1`만 허용 |
| `cansend vcan0 5A2#0001` | `SCENARIO_COMMAND_UNSUPPORTED` | Replay의 final method가 아님 |
| 내부 capture record의 generation이 현재와 다름 | `CAPTURE_GENERATION_MISMATCH` | stale capture 방어 계약 |

공개 REST reset은 stale capture를 유지하지 않고 파일 자체를 지운다. 따라서 정상 public flow에서 reset 뒤 playback을 시도하면 `CAPTURE_GENERATION_MISMATCH`가 아니라 `CAPTURE_REQUIRED`가 맞다. 내부 old-generation 방어 code는 다음 실제 domain test가 검증한다.

### `CAPTURE_REQUIRED` UI negative route

reset 직후 또는 새 Replay session에서 capture 없이 위 표의 playback command를 실행한다.

| 증거 위치 | 정확한 기대 결과 |
| --- | --- |
| Virtual Terminal | command echo와 `stderr`의 `CAPTURE_REQUIRED`; `silent`가 아님 |
| Vehicle Flow | `Lab Terminal`에서 `NO VEHICLE PATH`로 종료 |
| 3D | route/final callout 없음; Training OBD-II, Toy Body ECU, GLB Left Door를 active highlight하지 않음 |
| Network Monitor / Binary Inspector | 새 frame 없음; inspector는 비어 있거나 이전 선택을 변경하지 않음 |
| Why panel | `Terminal` source의 local preflight 설명만 표시; `가상 CAN 경로 입력`, `Toy ECU`, `Toy IDS` row 없음 |
| Activity | `CAPTURE_REQUIRED · 차량 경로 없음 · terminal`; 이 row를 Learning Check evidence로 선택 가능 |
| ECU / IDS / effect | verdict 생성 없음, part 이동 없음, `공격 조건 충족=미달성` |
| timing | Terminal 단일 node이므로 `600 ms` node transition은 없다. Guided는 단일 final node 도달 시 완료되고, Challenge는 final Terminal state를 `900 ms` 유지한 뒤 완료한다. reduced motion에서도 Challenge의 의미 단계는 생략하지 않는다. |

```powershell
.\.venv\Scripts\python.exe -X dev -m pytest server\tests\test_can_attack_basics.py::test_replay_requires_current_same_session_unmodified_capture_and_exact_repeat_count -q
```

reset:

```powershell
$ReplayReset = Invoke-RestMethod -Method Post "$Api/labs/can-attacks/replay/sessions/$ReplayId/reset"
$AfterResetPlayback = Invoke-LabPost "$Api/labs/can-attacks/replay/sessions/$ReplayId/terminal" @{ command = "canplayer -I capture.log -l 1" }
```

기대 상태는 generation `+1`, Stage `RECON`, Attempts `0`, Last verdict `NONE`, Completed `NO`, left/right/tailgate closed, monitor `0`, terminal/history 없음, editor placeholder 복원이다. 그 뒤 playback 응답은 `CAPTURE_REQUIRED`; 이 rejected 행을 제외한 reset 직후 GLB는 변하지 않는다.

## 6. Task 6 CLI 검증 기록 — 2026-08-26

이 기록은 아래 command를 실제로 실행해 관찰한 결과만 포함한다.

```powershell
& '.\.venv\Scripts\python.exe' -m pytest server/tests -q
& '.\node_modules\.bin\vitest.cmd' run
& '.\node_modules\.bin\tsc.cmd' --noEmit
& '.\node_modules\.bin\vite.cmd' build --mode ver4
git diff --check
```

- backend: `126 passed`, 기존 Starlette/httpx deprecation warning `1`, exit `0`
- frontend: `25` test files, `242 passed`, exit `0`
- TypeScript: diagnostic 없음, exit `0`
- Vite production build: `7307` modules transformed, exit `0`; plugin timing과 `500 kB` 초과 chunk advisory가 있었으며 build failure는 아님
- whitespace: `git diff --check` 출력 없음, exit `0`
- bundle secrecy: 두 instructor guide의 성공 섹션에서 추출한 완료 command 집합이 각각 동일한 `5`개임을 확인했다. 중복 제거한 full literal `5`개 각각을 `dist`에 `rg -F`로 검사했으며 모두 exit `1`, match `0`, error `0`이었다. command literal 자체는 이 결과 기록에 반복하지 않는다.
- generated `dist/`는 Git ignore 상태이고 tracked diff는 계획된 네 문서뿐이다.

이 CLI 기록 자체는 terminal/Vehicle Flow/Why/monitor/inspector/3D를 live browser에서 관찰한 증거가 아니다. 실제 Browser-plugin 관찰 결과는 다음 절에 별도로 기록한다.

## 7. Browser-plugin 실측 기록 — 2026-08-26

로컬 frontend `http://127.0.0.1:8447/`와 backend `http://127.0.0.1:8010/`를 feature worktree에서 직접 실행하고, in-app Browser-plugin으로 아래 결과를 관찰했다.

### 실제로 확인한 시나리오

- **Door**: 정상 3-frame script 뒤 `GLB Left Door · EFFECT APPLIED`까지 진행되는 것과, 다음 rejected terminal action이 시작되면 이전 final callout/Why/learning selection이 새 action에 귀속되지 않도록 초기화되는 것을 확인했다. rejected frame은 `Toy Body ECU · REJECTED`에서 멈추고 door effect를 적용하지 않았다.
- **Spoofing**: 관찰 command, 다른 target ID frame, valid target frame을 차례로 실행했다. Virtual Terminal은 정상 `cansend` 뒤 ECU verdict를 출력하지 않았고, Network Monitor/Activity의 structured result는 `OBSERVED → TARGET_ID_MISMATCH → EXECUTED`로 구분됐다. valid frame은 `Training OBD-II → Toy IDS → Toy Gateway → Toy Rear ECU → GLB Tailgate`를 거쳐 Tailgate effect를 적용했다.
- **Replay**: capture 전에 playback을 실행했을 때 Virtual Terminal `stderr=CAPTURE_REQUIRED`, Vehicle Flow는 `Lab Terminal · 거부됨` 한 node만 표시하고 Monitor에는 placeholder 외 새 frame이 없었다. 그 뒤 capture redirection, `cat`, byte-identical playback을 실행했을 때 Monitor는 capture/live source를 구분했고 `CAPTURED → EXECUTED`, `Body ECU → Left Door`, `IDS NORMAL`, Left Door effect가 일치했다.
- Lab script action은 terminal transcript row를 추가하지 않았고, terminal-origin action만 command echo와 `stdout`/`stderr`/`silent`를 남겼다.

### 실측 geometry와 접근성 상태

- desktop `1440×900`: Learning column이 `949 px`까지 늘어난 상태에서도 Terminal outer height는 약 `238.8 px`, output은 `145 px`로 유지됐다. 이전처럼 Terminal panel 자체가 sibling 높이에 맞춰 늘어나지 않았다.
- `820×900`: document/body horizontal overflow `0`; lab viewport `475 px`; stage connector와 stage label rectangle 교차 `0`; final feedback callout의 Canvas inset은 네 방향 모두 양수였다.
- `390×844`: document/body horizontal overflow `0`; lab viewport `350 px`; stage connector와 label 교차 `0`; Terminal outer height 약 `238.8 px`; callout text `14 px`이고 Canvas 밖으로 나가지 않았다. stage/target route는 의도한 내부 horizontal scroll을 유지했다.
- dynamic feedback surface는 pointer interaction을 받으며, feedback/pin Drei HTML layer는 서로 겹치지 않는 range를 사용했다. final feedback 중 non-active pins는 disabled/dim 상태이고 active effect pin만 강조됐다.
- 2026-08-27 재검증에서 host가 `prefers-reduced-motion: reduce`인 live run이어도 의미 단계를 건너뛰지 않았다. Guided HUD는 `초보자용 · 장치별 수동 진행`, Challenge HUD는 `실습자용 · 정적 단계 전환 · reduced motion`으로 표시됐다.
- browser console error는 없었다. Three.js의 기존 `THREE.Clock` 및 `PCFSoftShadowMap` deprecation warning은 남아 있으며 이 실습 결과의 오류는 아니지만 후속 dependency maintenance 대상이다.

### 직접 확인하지 못한 항목

- in-app Browser-plugin에서 실제 browser zoom을 125%/150%로 바꾸는 제어가 동작하지 않아 `1440×900 @ 125%/150%`는 직접 관찰하지 못했다. 더 좁은 `820 px`와 `390 px` responsive geometry는 확인했지만 browser zoom 검증을 대체했다고 주장하지 않는다.
- host가 reduced-motion으로 고정돼 normal-motion의 packet travel 자체는 직접 관찰하지 못했다. 일반 node `600 ms`, final hold `900 ms`, reduced-motion에서도 단계 순서를 보존하는 동작은 fake timer/frontend regression test가 검증했다.

### 후속 수동 판정 체크리스트

각 viewport를 새 page load로 확인한다.

- desktop `1440×900`: sidebar → Door → Spoofing → Replay
- tablet `820×1180`: 차량과 target map 카드가 겹치지 않으며 body horizontal overflow 없음
- fresh mobile `390×844`: 모바일 **공격 실습** → tabs로 진입; desktop 진입 후 resize한 결과로 대체하지 않음
- Canvas 중앙에는 작은 번호 pin/route만 있고 큰 설명 card가 GLB를 덮지 않음
- Door focus는 Body ECU/Left Door, Spoofing은 Rear ECU/Tailgate, Replay는 Body ECU/Left Door 의미를 표시
- rejected/wrong/stale event는 GLB를 바꾸지 않음
- reset은 affected part를 닫고 monitor/editor/terminal 상태를 초기화
- framework overlay, uncaught console error, failed resource가 없음

## 8. 문제 해결과 한계

- `Cannot connect to the Docker daemon`: Docker Desktop/Engine의 Server 상태를 먼저 확인하고, daemon을 사용할 수 없으면 direct runtime 결과만 보고한다.
- backend offline: `Invoke-WebRequest http://127.0.0.1:8010/health`, Uvicorn log, 포트 충돌을 확인한다.
- frontend health만 성공하고 API가 실패: browser hostname과 `:8010` CORS/origin, `VITE_CAN_STREAM_URL` override를 확인한다.
- WebSocket 행이 늦음: REST response의 current session/generation을 확인하고 잠시 기다린 뒤 live event의 동일 correlation과 `ACCEPT/EXECUTED`를 검증한다.
- WebGL/GLB 실패: console과 `/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb` resource를 확인한다.
- 초기 UI/public API/frontend production bundle은 정답을 생략하지만 repository 또는 backend image owner는 server source와 이 instructor 문서를 읽을 수 있다. source/image secrecy를 주장하지 않는다.
