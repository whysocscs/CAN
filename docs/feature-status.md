# 기능 구현 현황

이 문서는 메뉴가 존재한다는 사실과 실제 기능이 연결됐다는 사실을 구분한다. 상태는
`구현`(API/상태까지 동작), `로컬 UI`(브라우저 상태만 사용), `스캐폴드`(정적 미리보기)로 표시한다.

## 화면별 상태

| route | 상태 | 주 구현 | backend·저장소 | 자동 검증 |
|---|---|---|---|---|
| `courses`, `dashboard` | 로컬 UI | `CoursePage`, `DashboardPage` | `AppContext` 메모리 | typecheck, build |
| `can-basics/protocol` | 로컬 UI | `ProtocolPage` | 없음 | typecheck, build |
| `can-basics/frame` | 로컬 UI | `FramePage` | 없음 | typecheck, build |
| `can-basics/ecu` | 로컬 UI | `ECUPage` | 없음 | typecheck, build |
| `practice/normal` | 구현 | `CanPracticeOnlyPage`, `CanCommandTerminal` | `/can/send`, `/ws/can` | page, stream, vehicle tests |
| `practice/sender` | 로컬 UI | `can-practices/CanFrameSenderPage` | shared frontend event state | typecheck, build |
| `practice/monitor` | 스캐폴드 | `ScaffoldPage` | 없음 | build |
| `attacks/chain` | 구현 | `DoorAttackLabPage` | `/labs/door-blackbox` | door domain/API/page tests |
| `attacks/spoofing` | 구현 | `BeginnerCanAttackLabPage` | `/labs/can-attacks/spoofing` | beginner domain/API/page tests |
| `attacks/replay` | 구현 | `BeginnerCanAttackLabPage` | `/labs/can-attacks/replay` | beginner domain/API/page tests |
| `ids/unknown-id`, `ids/frequency`, `ids/payload-jump`, `ids/gateway` | 스캐폴드 | `ScaffoldPage` | 없음 | build |
| `badges` | 로컬 UI | `BadgePage` | `AppContext` 메모리 | catalog/typecheck |
| `profile` | 로컬 UI | `ProfilePage` | browser `localStorage` | typecheck, build |
| `models` | 구현 | `ModelManagerPage` | `/can/*`, `/ws/can` | vehicle stream/store tests |
| `results`, `about` | 스캐폴드 | `ScaffoldPage` | 없음 | build |

## 정상 CAN 실습 계약

- 입력기는 실제 셸을 만들지 않으며 `ip link show vcan0`, `candump vcan0`, 정규식에 맞는
  `cansend vcan0 NNN#NN`만 해석한다.
- 현재 단계에서 차량 effect까지 허용하는 frame은 `101#00`과 `200#01`이다.
- 전송 성공은 HTTP 응답으로 확인하고, monitor/inspector/3D 갱신은 `/ws/can` event를 사용한다.
- WebSocket 재접속 snapshot은 차량 상태 복원에는 쓰지만 새 traffic 행으로 세지 않는다.
- ECU Name과 CAN Bus를 모두 끄면 shared GLB clone은 opaque presentation으로 돌아간다.

## 공격 실습 계약

- 모든 실습은 in-memory Toy session이며 실제 차량·호스트 shell을 제어하지 않는다.
- Door chain, Spoofing, Replay는 각자 허용 명령·frame·verdict가 고정되어 있다.
- 서버 session evidence와 frontend monitor는 각각 최근 300개까지만 유지한다.
- reset generation이 오래된 요청·WebSocket event보다 우선한다.
- rejected trace는 `stoppedAt`에서 끝나며 effect를 적용하지 않는다.

정답 frame과 빠른 통과 순서는 학습자 문서가 아닌 `docs/instructors/`에서만 관리한다.
