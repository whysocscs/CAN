# CANLite Zero-to-Lab Learning Roadmap Specification

## Problem and learner

현재 공격 실습은 동작하지만 기존 학습자 문서는 CAN frame과 Linux 기본 명령을 이미 안다고 가정한다. 대상 학습자는 Classical CAN의 기본 frame 구조만 알고 Linux/WSL, SocketCAN, `can-utils`, 웹 애플리케이션, 3D 모델, 테스트와 취약점 재현 경험은 없는 자동차 보안 입문자다.

## Goal

학습자가 답안 명령을 복사하는 데서 끝나지 않고 다음을 직접 설명하고 재현하도록 만드는 단일 학습 로드맵을 제공한다.

1. CANLite를 안전하게 실행하고 장애를 진단한다.
2. `vcan`, `candump`, `cansend`, `canplayer`의 입력과 출력을 이해한다.
3. Spoofing과 Replay의 전제조건·증거·한계를 구분한다.
4. Toy Gateway, Toy ECU, Toy IDS, WebSocket, React, GLB 사이의 데이터 흐름을 추적한다.
5. 테스트와 로그로 실습 결과를 독립적으로 검증한다.
6. 이후 UDS/ISO-TP, DoIP, SOME/IP와 격리된 1-day 분석으로 확장한다.

## Success criteria

- 문서는 한국어로 작성하고 핵심 기술 용어는 영어 원문을 병기한다.
- `반드시 지금`, `플랫폼을 수정하려면`, `나중에 확장`, `1-day 분석`을 구분한다.
- 각 단계에 목표, 선수지식, 직접 실습, 명령, 예상 증거, 완료 기준, 오해 방지를 포함한다.
- Windows/PowerShell, WSL/Linux, Docker 명령이 어느 환경에서 실행되는지 표시한다.
- WSL 커널에서 `vcan` 지원 여부가 버전·설정에 따라 달라짐을 확인 절차와 함께 설명한다.
- 공식 문서·표준·공식 저장소를 우선 인용한다.
- 실제 차량, 공도, 타인 소유 장비에서 캡처·주입·재생하지 않도록 안전 경계를 먼저 제시한다.
- `vcan`이 물리 계층·arbitration timing·ACK·bus-off를 재현하지 않는다는 한계를 명시한다.
- CAN ID를 인증된 송신자나 Ethernet 목적지 주소로 설명하지 않는다.
- Toy 실습 성공을 실제 OEM 차량 취약점이나 IDS 우회로 일반화하지 않는다.
- ASan crash, 취약점, exploitability, RCE를 별개의 판단 단계로 설명한다.
- 기존 학습자 문서와 정답 포함 교사용 문서를 명확히 구분해 링크한다.

## Curriculum shape

권장 순서는 다음과 같다.

```text
환경·Shell → Linux network → SocketCAN/vcan → can-utils
→ ECU/Gateway/Body 의미 모델 → 위협 모델
→ Python/FastAPI/WebSocket → React/TypeScript → Three.js/GLB
→ 테스트·로그·Docker → CANLite 전체 재현
→ ISO-TP/UDS → DoIP/SOME-IP → 격리된 1-day 분석
```

기간은 학습 속도에 맞춰 조절할 수 있지만, 앞 단계의 관찰 가능한 완료 기준을 충족하기 전에 뒤 단계로 넘어가지 않는다.

## Deliverables

- `docs/learning/canlite-zero-to-lab-roadmap.md`: 학습자·개발자 통합 로드맵
- `README.md`: 로드맵 링크와 Windows PowerShell 실행 명령 교정
- 실행 검증 기록: frontend test/typecheck/build, backend pytest/compile, Compose config, 브라우저에서 Guided Replay 흐름

## Explicit exclusions

- 실제 차량 또는 물리 CAN에 공격 명령을 전송하는 절차
- 특정 OEM CAN ID/DBC를 실제 계약처럼 제시하는 내용
- 공개되지 않은 취약점이나 검증되지 않은 CVE 주장
- exploit 또는 RCE 완성 코드를 학습 시작점으로 제공하는 것
- 사용자가 이해하지 않은 전체 플랫폼을 대신 재작성하는 것
