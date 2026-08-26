# CAN 공격 실습 빠른 통과표 — 정답 포함

> **교사용 문서:** 정답 CAN ID, payload, 파일명이 포함되어 있으므로 학습자에게 배포하지 않는다. 아래 명령은 CANLite의 localhost Toy ECU/Toy IDS에서만 유효하며 실제 차량이나 OEM IDS 우회를 입증하지 않는다.

## 공통 Script 작동 방법

1. 학습 안내 모드에서 `초보자용 (Guided)` 또는 `실습자용 (Challenge)`을 먼저 선택한다.
2. `Virtual terminal`에는 `pwd`, `ls`, `cat`, `candump` 같은 관찰·캡처 명령을 한 줄씩 입력한다.
3. 오른쪽 `Lab script`에는 최종 공격 동작을 입력한다. 예시 줄 앞의 `#`은 주석이므로 실행할 줄에서는 제거한다.
4. `스크립트 실행`을 누른 뒤 `Network monitor`, `Binary inspector`, `Toy IDS`, `Evidence/Proof`, GLB 차량 상태를 함께 확인한다.
5. 다시 검증할 때는 `실습 초기화`를 누른다. 브라우저 새로고침만으로는 현재 세션 상태가 초기화되지 않을 수 있다.

### 초보자용 / 실습자용 판정 기준

- `초보자용 (Guided)`은 실행 직후 첫 node에서 멈춘다. `한 단계 진행`을 한 번 누를 때마다 다음 장치 하나로만 이동하고, 현재 Frame/단계, 장치 판정, 근거, 다음 장치, 실행 command를 설명 카드에 표시한다. 최종 effect node 전에는 문·트렁크 효과가 적용되면 안 된다.
- `실습자용 (Challenge)`은 상세 단계 설명 카드를 숨기고 동일한 authoritative trace를 자동 재생한다. `일시정지`와 `한 단계 진행`은 자동 흐름을 검사하는 보조 제어이며, 정상 실행은 별도 클릭 없이 endpoint까지 진행한다.
- `prefers-reduced-motion: reduce`에서도 장치 순서를 건너뛰지 않는다. 연속 packet 이동 애니메이션 대신 정적인 단계 전환을 사용하며, Guided는 계속 수동 진행, Challenge는 시간 간격을 둔 자동 진행이다.

### 모든 완료 action에서 함께 볼 증거

- Virtual Terminal action은 command echo와 `stdout`/`stderr`/`silent` stream을 구분한다. 정상 `cansend`/`canplayer`의 `silent`는 ECU 수락 증거가 아니다. Lab script action은 transcript row를 만들지 않는다. 정확한 current script line은 Vehicle Flow에서, script action의 structured result는 Activity에서 확인한다.
- 3D route는 authoritative result를 보여 주는 교육용 흐름이고 live CAN hop telemetry가 아니다. Guided는 `한 단계 진행` 1회당 node 하나, Challenge는 `600 ms` node 간격으로 진행한다. Challenge의 multi-trace는 final node를 `900 ms` 유지한 뒤 다음 trace로 간다.
- Why panel의 `Terminal`, `Toy ECU`, `Toy IDS`, `교육용 분석` source와 Network Monitor/Binary Inspector를 같은 action 기준으로 대조한다. IDS/ECU/effect 정보는 각 node 도달 전에 나타나면 안 된다.
- `공격 조건 충족=달성`은 Toy 기술 결과다. `학습 확인 완료=완료`는 실행 전 prediction, monitor frame/Activity evidence 선택, 20자 이상 comparison/reflection 후 별도로 확인한다.

## A. 전체 공격 체인 — Door

### 1단계: 관찰과 실패하는 Replay 확인

`Virtual terminal`에서 순서대로 실행한다.

```text
pwd
ls
cat baseline.log
cat door-open.log
cansend vcan0 456#010110B5
```

마지막 명령 뒤 기대 결과:

- Stage: `Replay 실패`
- Toy IDS: `ALERT`
- Attempt: `COUNTER_REJECTED`
- 좌·우 문: 모두 닫힘
- Monitor 마지막 프레임: ID `0x456`, DATA `01 01 10 B5`

### 2단계: 유효한 시퀀스 제작

`Lab script` 내용을 전부 아래로 교체한 뒤 `스크립트 실행`을 누른다.

```text
interval_ms=100
cansend vcan0 456#000113B7
cansend vcan0 456#000114B0
cansend vcan0 456#000115B1
```

통과 기준:

- 세 completion 줄은 script-origin이므로 Virtual Terminal transcript가 추가되지 않고, 각 command label이 Vehicle Flow에 순서대로 표시됨
- Stage: `증거`
- 세 프레임 verdict: 모두 `EXECUTED`
- Toy IDS: `NORMAL`
- Proof: `COMPLETE`
- Attempts: `4` (실패 Replay 1회 + 성공 프레임 3회)
- 3D: 각 frame이 `Training OBD-II → Toy IDS → Toy Gateway → Toy Body ECU → GLB Left Door`; final callout `GLB Left Door · EFFECT APPLIED · 교육용 분석`
- Monitor/Binary Inspector: accepted 세 행의 DATA가 차례로 `00 01 13 B7`, `00 01 14 B0`, `00 01 15 B1`
- Why: 마지막 trace에서 IDS node 이후 value `관찰됨 · Toy 규칙 경보 없음`/source `Toy IDS`, Body ECU 이후 `ECU 판정=EXECUTED`/source `Toy ECU`, endpoint 이후 `차량 영향=적용됨`/source `교육용 분석`
- Activity: `EXECUTED · 가상 CAN 경로 입력 기록됨 · 차량 영향 적용`; `공격 조건 충족`/Proof는 structured trace에서 먼저 달성될 수 있지만 GLB/Why effect는 endpoint에서 적용·공개된다. Guided는 node마다 수동 진행하고, Challenge는 각 node `600 ms`, trace 사이 `900 ms`로 진행한다.
- GLB: Left Door만 열리고 Right Door는 닫힘
- Self-check: `공격 조건 충족=달성`, `학습 확인 완료`는 prediction/evidence/reflection 전까지 `미완료`

## B. CAN Spoofing 기초

### 1단계: 계약 관찰

`Virtual terminal`에서 순서대로 실행한다.

```text
pwd
ls
candump -L vcan0
cat message-map.txt
```

### 2단계: 위조 프레임 전송

`Lab script`를 아래처럼 작성한다. `cansend` 줄 앞에 `#`을 붙이지 않는다.

```text
# final action
cansend vcan0 5A1#01
```

통과 기준:

- Lab script origin이므로 Virtual Terminal transcript row 없음. terminal에서 같은 completion action을 실행할 때는 command echo 뒤 `silent`임
- Stage: `EVIDENCE`
- Last verdict: `EXECUTED`
- Toy IDS: `NORMAL`
- Attempts: `1`, Completed: `YES`
- Monitor: 관찰 프레임과 live 프레임을 합쳐 `2`행
- Binary inspector의 live DATA: `01`
- 3D: `Training OBD-II → Toy IDS → Toy Gateway → Toy Rear ECU → GLB Tailgate`; final callout `GLB Tailgate · EFFECT APPLIED · 교육용 분석`
- Why: IDS/Rear ECU/Tailgate 도달 순서대로 value `관찰됨 · Toy 규칙 경보 없음`/source `Toy IDS`, `ECU 판정=EXECUTED`/source `Toy ECU`, `차량 영향=적용됨`/source `교육용 분석`
- Activity: `EXECUTED · 가상 CAN 경로 입력 기록됨 · 차량 영향 적용`; `공격 조건 충족`은 먼저 달성될 수 있지만 GLB/Why effect는 Guided의 수동 진행 또는 Challenge의 `600 ms` 진행이 Tailgate endpoint에 도달했을 때만 적용·공개
- GLB: Tailgate만 열림
- Self-check: `공격 조건 충족=달성`과 `학습 확인 완료=완료`를 별도로 확인

## C. CAN Replay 기초

### 1단계: 정상 프레임 캡처

`Virtual terminal`에서 순서대로 실행한다.

```text
candump -L vcan0 > capture.log
cat capture.log
```

첫 명령 뒤 Stage가 `CAPTURE`, verdict가 `CAPTURED`인지 확인한다.

### 2단계: 캡처 재생

`Lab script`를 아래처럼 작성한다. `canplayer` 줄 앞에 `#`을 붙이지 않는다.

```text
# final action
canplayer -I capture.log -l 1
```

통과 기준:

- capture command는 echo 뒤 `silent`, `cat`은 echo와 frame `stdout`; completion action은 Lab script origin이므로 transcript row 없음. terminal에서 실행할 때는 echo 뒤 `silent`임
- Stage: `EVIDENCE`
- Last verdict: `EXECUTED`
- Toy IDS: `NORMAL`
- Attempts: `1`, Completed: `YES`
- Monitor: capture와 live 프레임을 합쳐 `2`행
- 두 프레임 DATA: 모두 `00 01`
- 3D playback: `Training OBD-II → Toy IDS → Toy Gateway → Toy Body ECU → GLB Left Door`; final callout `GLB Left Door · EFFECT APPLIED · 교육용 분석`
- Why: IDS/Body ECU/Left Door 도달 순서대로 value `관찰됨 · Toy 규칙 경보 없음`/source `Toy IDS`, `ECU 판정=EXECUTED`/source `Toy ECU`, `차량 영향=적용됨`/source `교육용 분석`
- Activity: completion `EXECUTED · 가상 CAN 경로 입력 기록됨 · 차량 영향 적용`; `공격 조건 충족`은 먼저 달성될 수 있지만 GLB/Why effect는 Guided의 수동 진행 또는 Challenge의 `600 ms` 진행이 Left Door endpoint에 도달했을 때만 적용·공개
- GLB: Left Door만 열림
- Self-check: `공격 조건 충족=달성`과 `학습 확인 완료=완료`를 별도로 확인

초기화 직후 캡처 없이 재생하면 `CAPTURE_REQUIRED`가 나오는 것이 정상이다. 이 negative route는 다음을 모두 만족해야 한다.

- Virtual Terminal: command echo + `stderr`; Vehicle Flow는 `Lab Terminal · NO VEHICLE PATH`에서 종료
- 3D: route/final callout 없음, Training OBD-II·Toy Body ECU·GLB Left Door active highlight 없음
- Network Monitor: 새 frame 없음; Binary Inspector는 비어 있거나 기존 선택을 변경하지 않음
- Why: `Terminal` source만 표시하고 `가상 CAN 경로 입력`, `Toy ECU`, `Toy IDS` row 없음
- Activity: `CAPTURE_REQUIRED · 차량 경로 없음 · terminal`
- ECU/IDS verdict와 effect 없음, `공격 조건 충족=미달성`; Guided는 Terminal 단일 node에서 즉시 완료되고, Challenge는 Terminal final state를 `900 ms` 유지한 뒤 완료한다. reduced motion에서도 Challenge의 의미 단계는 생략하지 않는다.

## 실패할 때 먼저 확인할 것

- action 줄이 아직 `#`으로 시작하는가
- Spoofing/Replay script에 최종 action이 두 줄 이상 있는가
- Door의 `interval_ms`가 `10..2000` 범위를 벗어났는가
- Replay에서 캡처 전에 재생했거나 파일명을 다르게 입력했는가
- `Network monitor`에서 선택한 행과 `Binary inspector`의 DATA가 같은가
- 이전 실습 상태가 남아 있다면 `실습 초기화` 후 다시 시작했는가
