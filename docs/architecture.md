# CANLite 프로젝트 구조

## 목적과 경계

CANLite는 실제 차량 공격 도구가 아니라, loopback CAN과 in-memory Toy ECU로 CAN
프레임의 흐름과 방어 판단을 배우는 로컬 교육 플랫폼이다. 브라우저는 시각화와 입력을,
FastAPI는 세션·판정·CAN event의 권위 있는 상태를 맡는다.

```text
pages (화면 조합)
  -> features (CAN, 차량, 공격 실습의 도메인 기능)
    -> providers / HTTP API (전송 경계)
      -> FastAPI routers (검증·직렬화·동시성)
        -> labs / CAN service state (권위 있는 도메인 상태)
```

역방향 의존은 두지 않는다. 예를 들어 `server/labs/`는 FastAPI를 import하지 않고,
차량 3D 코드는 공격 실습 페이지를 import하지 않는다.

## 디렉터리 책임

| 경로 | 책임 | 변경 시 같이 볼 곳 |
|---|---|---|
| `src/pages/` | route 단위 화면 조합과 학습 단계 상태 | `src/App.tsx`, 해당 page test |
| `src/features/can/` | CAN event 타입·catalog·stream provider, 정상 실습 터미널 | `server/routers/can.py` |
| `src/features/vehicle/` | 차량 상태, GLB 자원, 토폴로지, flow 재생 | `public/models/`, vehicle test |
| `src/features/attack-lab/` | 공격 실습 API client, 화면, 응답 타입 | `server/routers/labs.py`, `can_attack_labs.py` |
| `src/context/` | 전역 navigation·진행도·알림 | dashboard/course/profile 화면 |
| `server/labs/` | HTTP와 무관한 Toy ECU·IDS·명령 판정 | 같은 이름의 단위 테스트 |
| `server/routers/` | HTTP/WebSocket 계약, 세션 상한, 동시성, CAN publish | API 테스트와 frontend 타입 |
| `docs/labs/` | 정답 없는 학습자 절차 | 교사용 문서와 답 노출 여부 |
| `docs/instructors/` | 정답·기대 verdict를 포함한 검증 절차 | 학습자 배포 금지 표시 |

## 상태 소유권

| 상태 | 소유자 | 수명·상한 |
|---|---|---|
| 현재 route, 과정 진행, 알림 | `AppContext` | 브라우저 탭 메모리 |
| 이름·소개·대표 배지 | `ProfilePage` | `localStorage`의 `canlite.profile.v1` |
| 도어·트렁크 UI 비율 | `vehicleStore` | 브라우저 런타임 singleton |
| CAN ID별 마지막 frame | `server/routers/can.py` | 서버 프로세스, 표준 ID 최대 2,048개 |
| Door lab session | `server/routers/labs.py` | in-memory LRU, 최대 128개 |
| Spoofing/Replay session | `server/routers/can_attack_labs.py` | scenario별 in-memory LRU, 각 128개 |
| 3D flow 재생 위치 | `useVehicleFlowPlayback` | 컴포넌트 수명, generation으로 이전 timer 무효화 |

서버 재시작 시 lab session과 CAN snapshot은 사라진다. 프로필 이외의 사용자 진행도를
영구 저장하거나 여러 서버 인스턴스 사이에서 공유하지 않는다.

## 정상 CAN 흐름

1. `CanCommandTerminal`은 한 줄을 모아 페이지의 제한형 command handler에 전달한다.
2. 페이지는 허용된 `cansend`만 `POST /can/send`로 전송한다.
3. CAN router가 loopback 또는 SocketCAN에 frame을 발행하고 마지막 frame을 보관한다.
4. `/ws/can` event를 `useCanVehicleStream`이 받아 monitor와 `vehicleStore`에 전달한다.
5. 정상 실습과 공격 실습은 `SharedVehicleScene`의 같은 GLB clone·좌표·카메라 계약을 쓴다.

정상 실습 터미널은 실제 셸이 아니다. 실제 PTY는 별도 `/ws/terminal`이며 frontend와
backend opt-in, 허용 Origin을 모두 만족할 때만 열린다.

## 공격 실습 흐름

1. frontend가 scenario session을 만들고 제한 명령 또는 script를 전송한다.
2. `server/labs/`가 Toy ECU/IDS 판정을 계산한다.
3. router가 verdict와 `flowTraces`를 한 응답으로 직렬화한다.
4. `parseVehicleFlowTraces`가 외부 데이터를 런타임에서 검증한다.
5. `useVehicleFlowPlayback`이 서버 route를 순서대로 재생한다.
6. 차량 effect는 서버가 `EXECUTED`와 `effectApplied=true`를 모두 보낸 경우에만 적용한다.

frontend가 payload를 다시 해석해 성공을 추측하지 않는 것이 핵심 경계다. 거부 trace는
거부 지점에서 멈추고 도어·트렁크 effect node에 도달할 수 없다.

## 구조 변경 원칙

- page에는 화면 조합과 짧은 UI 상태만 두고, 자원 생명주기나 도메인 판정은 feature로 옮긴다.
- CAN frame 계약을 바꾸면 backend router, frontend event 타입, 차량 매핑, 문서, 양쪽 테스트를 함께 바꾼다.
- GLTF cache 원본을 직접 수정하지 않는다. 화면별 clone과 clone 재질만 변경·dispose한다.
- 비동기 reset/cancel에는 session generation 또는 playback generation을 유지한다.
- 주석은 코드가 이미 말하는 동작보다 소유권·보안·동시성 같은 이유를 설명한다.
