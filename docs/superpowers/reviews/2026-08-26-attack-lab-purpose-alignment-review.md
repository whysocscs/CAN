# CAN Attack Lab 목적 적합성 설계회의 기록

Date: 2026-08-26
Branch: `feat/can-attack-basics-expansion`
Decision: 필수 보완을 명세와 구현 계획에 반영하는 조건으로 승인

## 참석 역할

- Backend/Security reviewer: Toy ECU·IDS 계약, Replay preflight, 실제 CAN과
  교육 모델의 경계 검토
- Learning/Feedback reviewer: 명령, 증거 관찰, 원인 설명, 답안 노출,
  학습 완료 기준 검토
- Visual/Accessibility reviewer: 명령-장치 인과관계, 3D 강조, StageRail,
  반응형·접근성 검토
- Controller: 서로의 지적을 교차 전달하고 최종 범위와 구현 순서를 확정

세 검토자는 서로 독립적으로 1차 의견을 작성한 뒤, 다른 관점의 지적을
받아 동의·반대와 최소 구현안을 다시 검토했다.

## 프로젝트 목적에 대한 합의

프로젝트의 목적은 실제 차량 공격 도구를 제공하는 것이 아니라, 격리된
Toy CAN 환경에서 학습자가 다음 인과관계를 증거로 설명하게 하는 것이다.

```text
명령 입력
→ 가상 터미널 결과
→ Toy 경로 입력 여부
→ IDS 관찰
→ Gateway/대상 ECU 처리
→ ECU 판정
→ GLB 차량 영향
→ Monitor/Inspector/Activity 증거와 자기 설명
```

현재 방향은 이 목적에 대체로 맞지만, 기존 계획에는 최종 결과 선공개,
기술 성공과 학습 완료의 혼동, 실제 CAN을 연상시키는 과장 표현, 일부
공격 단계 건너뜀이 남아 있었다.

## 확인된 기술 근거

- Linux-CAN `cansend`는 CAN_RAW socket에 frame을 `write()`하고 종료하며,
  ECU application verdict를 읽어 출력하지 않는다. 소스도 receive filter를
  끄며 socket을 읽지 않는다고 명시한다:
  <https://github.com/linux-can/can-utils/blob/master/cansend.c>
- Linux kernel SocketCAN 문서는 CAN이 broadcast-only medium이며 CAN
  identifier가 MAC 주소 같은 송신자 주소가 아니라 arbitration에 사용된다고
  설명한다. 따라서 CAN ID를 인증된 ECU identity라고 표현하면 안 된다:
  <https://docs.kernel.org/networking/can.html>

이 프로젝트는 실제 SocketCAN을 사용하지 않는 in-memory Toy interpreter다.
따라서 UI의 성공 표현은 `가상 CAN 경로 입력 성공`으로 제한하고, 물리 CAN
전송, ACK, Toy ECU application acceptance를 서로 다른 사실로 취급한다.

## 만장일치 필수 수정

1. Replay preflight 실패는 attempt, IDS verdict, OBD/ECU 경로를 만들지 않는다.
2. Door script 문법/local 오류는 IDS `ALERT`가 아니라 `idsStatus=null`이다.
3. Door multi-frame 전체 IDS verdict는 마지막 trace에서만 공개한다.
4. `cansend`/`canplayer`의 silent terminal과 Toy ECU/IDS 설명을 분리한다.
5. `CAN 프레임 전송 성공`을 `가상 CAN 경로 입력 성공`으로 교정한다.
6. Spoofing은 `송신자 ID 사칭`이 아니라 `정상 기능의 message identifier를
   재사용한 공격자 프레임 주입`으로 설명한다.
7. IDS `NORMAL`은 `관찰됨 · Toy 규칙 경보 없음`, `ALERT`는
   `관찰/탐지됨 · 차단 근거 없음`으로 표시한다.
8. IDS·ECU·effect 정보는 각 노드 도달 후에만 공개한다.
9. 현재 multi-frame 명령을 HUD에 표시하고 node 600 ms, trace final hold
   900 ms를 적용한다.
10. Toy IDS를 amber/dashed observer로 표현하고 ECU rejection의 red 상태와
    구분한다.
11. Dynamic callout에도 `교육용 논리 ECU · 실제 OEM 위치 아님`을 유지한다.
12. Spoofing의 `ECU 수락`, Replay의 `재전송`, Door의 제작/IDS 단계가 실제
    playback 동안 current가 되도록 stage를 보정한다.
13. Terminal은 100개, Activity는 20개로 제한하며 local/preflight는
    Network Monitor가 아니라 Activity에 보존한다.
14. Backend `completed`는 `Toy 기술 결과 달성`으로 표시하고, prediction,
    선택한 evidence, learner explanation을 요구하는 별도 `학습 확인 완료`
    자가 점검을 둔다. 자동 의미 채점은 하지 않는다.
15. 학습자 문서에서 instructor solution 링크를 제거하고 production bundle에
    exact completion command가 포함되지 않았는지 검증한다.

## 디자인 검증 기준

- active callout은 한 개만 존재하고 Canvas 네 변에서 8 px 이상 안쪽이다.
- active node는 double halo, active edge는 idle보다 굵은 선을 사용한다.
- IDS observer, ECU reject, effect applied는 색 외 텍스트/상태로 구분한다.
- connector rectangle은 stage label rectangle과 교차하지 않는다.
- leader geometry는 callout text bounds를 통과하지 않는다.
- 1440×900의 100%, 125%, 150% zoom과 820 px, 390 px 폭에서 검증한다.
- reduced motion은 이동 애니메이션만 생략하고 동일한 최종 의미를 제공한다.

## 이번 구현에서 제외

- 실제 SocketCAN, 물리 CAN ACK, 실제 ECU hop telemetry
- 실제 OEM ECU 위치나 실차 공격 가능성 주장
- 초기 침투, RCE/LPE, Gateway compromise, UDS/OTA exploit
- runnable DoS lab와 실제 IDS/IPS 차단 기능
- expected counter/payload를 제공하는 advanced hint
- 자연어 자동 채점, SQLite 학습 reflection 저장, LMS 연동
- 소스 전체를 받은 학습자에 대한 강한 답안 비밀성

## 결론

세 검토자의 공통 결론은 `조건부 승인`이었다. 위 필수 수정은 승인 명세와
구현 계획에 반영했으며, 구현 후 동일한 세 관점으로 전체 branch를 다시
검토한다. 최종 합격 기준은 “차량 부품이 움직인다”가 아니라, 학습자가
명령·경로·판정·증거·한계를 서로 모순 없이 설명할 수 있는 화면과 상태
계약이다.
