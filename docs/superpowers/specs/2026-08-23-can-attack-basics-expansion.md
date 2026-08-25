# CAN Attack Basics Expansion Specification

## Problem and target learner

현재 `attacks/chain`에는 동작하는 Black-box Door 실습이 있지만 차량 위의 큰 HTML 라벨이 모델을 가리고, `attacks/spoofing`과 `attacks/replay`는 실행할 수 없는 정적 미리보기다. 대상 학습자는 CAN frame 형식과 `ls`, `cat`, `candump`, `cansend` 같은 기본 명령을 배운 자동차 보안 입문자다.

## Goals

1. 기존 GLB 차량을 가리지 않으면서 `OBD-II → Gateway/IDS → target ECU → actuator` 흐름과 현재 공격 대상을 명확히 보여 준다.
2. Spoofing과 Replay를 의미가 겹치지 않는 별도 기초 실습으로 제공한다.
3. 각 실습의 정확한 완료 명령과 기대 증거를 교사용 검증 문서로 제공한다.
4. 기존 Door full-chain과 `main`을 보존하고, 승인된 현재 lab event만 GLB에 반영한다.

## Success criteria

- `attacks/chain`, `attacks/spoofing`, `attacks/replay`가 각각 동작하고 `attacks/dos` 정적 화면은 회귀하지 않는다.
- 차량 중앙에는 작은 번호 pin과 route 선만 두고, ECU 설명은 Canvas 밖 target map에 표시한다.
- target map은 노드 이름, 역할, 공격 입력, 영향 부위, 현재 처리 상태를 표시한다.
- ECU/OBD/Gateway/IDS는 `Toy logical position · OEM placement 아님`, 문/테일게이트는 `GLB effect anchor · actuator 물리 위치 아님`으로 구분한다.
- 데스크톱 차량 영역은 기존보다 크며, 820px/520px에서도 차량과 설명 카드가 겹치지 않는다.
- Spoofing 실습은 정상 송신자를 사칭해 같은 ID의 다른 상태 payload를 제작하는 과정을 가르친다.
- Replay 실습은 세션에서 캡처한 유효 frame을 나중에 byte-identical하게 재전송하는 과정을 가르친다.
- capture와 rejected attempt는 REST evidence로만 보이고 GLB를 움직이지 않는다.
- 현재 scenario, labId, sessionId, generation이 일치하는 `ACCEPT/EXECUTED` live event만 해당 실습의 monitor와 GLB에 반영된다.
- Replay Attack event는 live event이며 WebSocket snapshot 뜻의 top-level `replay: true`를 사용하지 않는다.
- 초기 DOM/public state/frontend production bundle에는 정답 CAN ID, payload, solution command가 없다.
- Docker, backend tests, frontend tests, typecheck, build, desktop/mobile browser smoke가 통과한다.
- 모든 작업은 `feat/can-attack-basics-expansion`에서 수행하며 `main`과 `feat/blackbox-can-door-lab`을 변경하거나 merge하지 않는다.

## Threat model and safety boundary

- 자산: 호스트 파일/프로세스, Docker daemon, 실제 CAN interface, 기존 Door lab 상태.
- 학습자 입력: virtual terminal command와 제한 script 문자열.
- 신뢰 경계: browser → FastAPI scenario session → pure Toy ECU evaluator → accepted CAN event → exact frontend predicate → vehicle store/GLB.
- 실제 shell, subprocess, redirection, `eval`, `exec`, `shell=True`, Docker socket, host CAN을 사용하지 않는다.
- 화면의 `vcan0`, 파일, `candump`, `canplayer`는 세션 메모리에서 해석하는 교육용 virtual command다.
- Compose 기본값은 loopback Toy bus, localhost-only, non-root, read-only다.
- 이 실습은 실제 OEM 메시지 계약, 실제 ECU 위치, 실제 IDS 우회, 물리 차량 영향의 증거가 아니다.

## Scenario contracts

### Beginner Spoofing

- Lab ID: `can-spoofing-basic-v1`
- Target: Toy Rear ECU and GLB Tailgate
- Private Toy CAN ID: `0x5A1`
- Private state payload: one byte, `00=closed`, `01=open`
- Learner evidence: observe normal traffic and read the educational message map; no captured open command is provided.
- Completion command: `cansend vcan0 5A1#01`
- Completion meaning: a frame with the legitimate ID but attacker-controlled payload is accepted because the Toy receiver does not authenticate the sender.
- This is not Replay: the learner constructs a new state payload instead of resending a captured valid open frame.

### Beginner Replay

- Lab ID: `can-replay-basic-v1`
- Target: Toy Body ECU and GLB Left Door
- Private Toy CAN frame: `0x5A2#0001` (`left=open`, `right=closed`)
- Capture command: `candump -L vcan0 > capture.log`
- Inspection command: `cat capture.log`
- Completion command: `canplayer -I capture.log -l 1`
- Completion meaning: an exact frame captured in the same session/generation is replayed later and accepted because the Toy receiver has no counter, timestamp, nonce, or MAC freshness check.
- Modified payload, foreign captureId, old generation, or replay before capture does not complete the lab.

Both contracts are server-private startup data. They may appear in instructor docs and tests but not in frontend scenario configuration, initial state, or public API fields.

## Domain and API

Create a pure `BeginnerCanAttackSession` with immutable result values and injected `ScenarioSpec`. It must not import FastAPI or execute system commands.

Base routes:

```text
POST /labs/can-attacks/{scenario}/sessions
GET  /labs/can-attacks/{scenario}/sessions/{sessionId}
POST /labs/can-attacks/{scenario}/sessions/{sessionId}/reset
POST /labs/can-attacks/{scenario}/sessions/{sessionId}/terminal
POST /labs/can-attacks/{scenario}/sessions/{sessionId}/run
```

`scenario` is exactly `spoofing` or `replay`. Public state contains only:

```text
labId, scenario, sessionId, generation, stage, targetLabel,
targetNode, effectTarget, vehicleState, evidence, attemptCount,
lastVerdict, completed
```

It does not contain target ID, answer payload, capture bytes before observation, file contents, solution commands, or private checksum/freshness values.

The terminal supports only exact virtual forms needed by the scenarios plus `pwd`, `whoami`, `ls`, and `cat <known-file>`. Input limits are 512 characters per command, 4096 characters/20 lines per script, and replay count exactly one. Unknown interfaces, files, flags, chaining, pipes, command substitution, real paths, and arbitrary redirection are rejected.

Router state is isolated per scenario. Each scenario has a bounded session map, active `(sessionId, generation)` correlation, a cross-loop-safe lifecycle lock, and its own snapshot CAN ID. Create/reset clears only that scenario ID, never `0x456`, `0x101`, `0x200`, or the other beginner scenario.

Only an `EXECUTED` attempt is emitted. Event metadata includes:

```json
{
  "processing": {"filterResult": "ACCEPT", "executionResult": "EXECUTED"},
  "monitoring": {"idsObserved": true, "status": "NORMAL"},
  "lab": {
    "labId": "<scenario-lab-id>",
    "scenario": "spoofing|replay",
    "sessionId": "<opaque uuid>",
    "generation": 0,
    "attemptId": "<opaque id>",
    "stage": "impact"
  }
}
```

Spoofing uses `context.command: TRUNK_OPEN`, route `obd → ids → gateway → rear`, and action `TAILGATE_OPEN`. Replay uses `context.command: DOOR_LOCK`, route `obd → ids → gateway → body`, and action `LEFT_DOOR_OPEN`. Accepted Replay Attack events remain normal live events and omit top-level `replay`.

## Frontend architecture

### Vehicle target map

Create shared topology data and a shared `VehicleNetworkViewport` consumed by the Door and beginner labs.

- GLB: `/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb`
- Effect anchors reuse `HINGES.doorL.pivot` and `HINGES.tailgate.pivot`.
- Logical pins cover OBD-II, IDS, Gateway, Body ECU, and Rear ECU.
- Canvas renders the GLB, small numbered pins, and thin route lines only.
- An external target map lists the numbered nodes and truthful location kind.
- Controls provide overview/source/target/effect focus and camera reset; no mandatory auto-rotation.
- Reduced-motion is respected.
- The viewport never subscribes to the CAN WebSocket itself.

Door full-chain route is `obd → ids → gateway → body → leftDoor`. Spoofing is `obd → ids → gateway → rear → tailgate`. Replay is `obd → ids → gateway → body → leftDoor` with capture/replay stage text.

### Beginner page

`BeginnerCanAttackLabPage` is parameterized only by `scenario`; private IDs or payloads never enter its configuration. It creates a server session, uses the API state as authority, listens to the existing CAN WebSocket once, and uses an exact session/generation predicate.

It retains the CANLite design and exposes:

- scenario header and stage rail
- large vehicle target map
- main restricted script/code input
- binary inspector driven by selected frame
- network monitor with bounded rows
- small virtual terminal with history
- learning objective, hints, evidence, explicit Toy/simulation boundary
- reset/run/offline/error states

The initial script contains syntax placeholders only. Reset closes the affected GLB part from the authoritative response and clears local monitor, terminal, editor, evidence selection, and stale requests.

`AttackPracticePage` routes chain to `DoorAttackLabPage`, spoofing/replay to the parameterized beginner page, and DoS to the unchanged static preview. Mobile bottom navigation gains an Attack entry so a fresh mobile session can reach the tabs.

## Guides

- Learner guide: concepts, command grammar, evidence checklist, hints, safety boundary; no exact answer.
- Instructor validation guide: exact commands for Door full-chain, Spoofing, Replay; expected API/UI/GLB/monitor/IDS evidence; negative tests; reset; troubleshooting.
- README links learner guides and labels the instructor guide as answer-bearing.

## Explicit exclusions

- DoS implementation in this iteration
- Ignition/engine ECU actuation
- Real SocketCAN/physical vehicle traffic
- OEM DBC, UDS, SecOC, E2E, commercial IDS claims
- Arbitrary code execution or real shell access
- Multi-user persistence/SQLite progress
- Refactoring the existing Door domain/router or global vehicle debug handle
