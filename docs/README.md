# CANLite 문서 지도

문서는 독자와 공개 범위에 따라 나눈다. 같은 실습을 설명하더라도 학습자 문서에는
정답 프레임을 싣지 않고, 교사용 문서에는 검증 절차와 기대 결과를 명시한다.

| 독자 | 문서 | 다루는 범위 |
|---|---|---|
| 처음 실행하는 사람 | [프로젝트 README](../README.md) | 설치, 실행, 현재 범위, 전체 검사 명령 |
| 개발자·리뷰어 | [프로젝트 구조](architecture.md) | 모듈 책임, 의존 방향, 상태 소유자, 핵심 데이터 흐름 |
| 개발자·리뷰어 | [기능 구현 현황](feature-status.md) | 화면별 구현/스캐폴드 구분, API, 테스트 근거 |
| 개발자·리뷰어 | [검증 절차](verification.md) | 자동 검사와 수동 smoke test의 합격 조건 |
| 평가자·리뷰어 | [코드 품질 기준](quality-review.md) | 100점 검토표, 확인 근거, 감점 조건 |
| 학습자 | [Black-box Door 실습](labs/blackbox-can-door-attack.md) | 정답을 노출하지 않는 도어 공격 절차 |
| 학습자 | [Spoofing·Replay 기초](labs/can-spoofing-replay-basics.md) | 정답을 노출하지 않는 두 입문 시나리오 |
| 교사 | [빠른 통과표](instructors/can-attack-lab-quick-pass.md) | 정답 포함 최소 검증 경로 |
| 교사 | [공격 실습 검증](instructors/can-attack-lab-validation.md) | API·UI·격리 조건의 상세 검증 |
| 운영자 | [로컬 실제 터미널](../LOCAL_TERMINAL.md) | opt-in PTY와 보안 경계 |
| API 사용자 | [차량 제어 API](../VEHICLE_CONTROL.md) | CAN/도어/트렁크 endpoint와 frame 계약 |

`docs/superpowers/`와 `.superpowers/`는 구현 당시의 설계·작업 기록이다. 현재 동작을
판단할 때는 위의 운영 문서, 코드, 자동 테스트 순으로 확인한다.
