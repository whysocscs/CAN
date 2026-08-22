# Black-box CAN Door Attack 실습 가이드

이 실습은 격리된 로컬 환경에서 CAN 기록을 관찰하고, Toy Body ECU의 메시지 규칙을 추론한 뒤, Toy IDS가 허용하는 프레임 시퀀스를 만드는 교육용 실습이다. 실제 차량, OEM ECU, 실제 IDS의 우회를 재현하거나 주장하지 않는다.

## 학습자 가이드

### 학습 목표

실습을 마치면 다음을 근거와 함께 설명할 수 있어야 한다.

- 잡음이 섞인 candump 기록에서 동일 기능으로 보이는 CAN ID를 묶는 방법
- 상태 바이트, rolling counter, checksum 후보를 비교하는 방법
- 캡처 프레임을 그대로 재전송하는 replay가 freshness 검사에서 실패할 수 있는 이유
- ECU 승인(`EXECUTED`)과 IDS 시퀀스 판정(`NORMAL`)이 서로 다른 완료 조건인 이유
- 승인된 Toy CAN 이벤트가 Body ECU 경로를 거쳐 GLB 왼쪽 문 상태로 표현되는 흐름

### 준비물과 실행

Docker Compose v2와 최신 브라우저가 필요하다. 저장소 루트에서 다음 명령을 실행한다.

```bash
docker compose up --build
```

브라우저에서 `http://127.0.0.1:8447`을 열고 사이드바의 **공격 실습 → 전체 공격 체인**으로 이동한다. 백엔드 상태만 확인하려면 `http://127.0.0.1:8010/health`을 연다.

실습 종료 후 컨테이너를 제거한다.

```bash
docker compose down
```

Compose는 두 포트를 모두 `127.0.0.1`에만 공개하고, Toy CAN bus는 `loopback` 모드로 실행한다. 물리 CAN 장치나 `vcan0` 커널 인터페이스를 만들지 않는다.

### 실습 진행

1. 차량 모델에서 빨간 **Toy Body ECU**와 **Left Door** 표식을 확인한다.
2. 제한 터미널에서 파일 목록과 두 캡처를 확인한다.
3. 캡처를 CAN ID별로 묶고, 같은 ID의 각 바이트가 시간에 따라 어떻게 변하는지 표로 적는다.
4. 캡처의 프레임 하나를 그대로 전송해 replay 결과와 reason code를 기록한다.
5. code 입력창에서 완료 후보인 3개 프레임과 전송 간격을 바꾸며 checksum/counter 가설을 검증한다.
6. Network Monitor와 Binary Inspector에서 ECU verdict, IDS status, 좌·우 문 상태를 확인한다.
7. Toy IDS가 `NORMAL`이고 왼쪽 문만 열린 상태가 됐을 때 증거를 저장한다.

### 허용되는 제한 명령

이 창은 Bash가 아니라 고정 문법을 해석하는 virtual terminal이다. 다음 명령만 허용된다.

```text
pwd
whoami
ls
cat baseline.log
cat door-open.log
ip link show dev vcan0
candump vcan0
candump -L vcan0
cansend vcan0 <1~3자리-hex-ID>#<1~8바이트-hex-data>
```

code 입력창은 주석, `interval_ms=10..2000`, `cansend vcan0 ...`만 처리한다. 최대 20줄, 4096자이며 Python/Bash/호스트 명령을 실행하지 않는다.

화면에 표시되는 `vcan0`, `candump`, 파일 내용은 Toy lab이 반환하는 고정된 교육 데이터다. 컨테이너의 실제 kernel interface나 host CAN traffic을 조회한 결과가 아니다.

### 제출할 증거

- `baseline.log`와 `door-open.log`에서 선택한 목표 ID 및 선택 근거
- 네 바이트 각각의 역할에 대한 가설과 비교표
- replay 실패 프레임, verdict/reason code, 실패 원인 설명
- 최종 3프레임 script와 전송 간격
- 세 프레임의 `EXECUTED`, Toy IDS `NORMAL`, 완료 evidence가 함께 보이는 화면
- “실제 차량에서도 같은 ID/데이터가 동작한다”라고 일반화할 수 없는 이유

### 안전 경계와 한계

- **Toy ECU/Toy IDS**: 이 저장소 전용 메시지 계약과 단순 규칙이다. OEM 규격, SecOC/E2E, 상용 IDS 검증 결과가 아니다.
- **교육용 논리 위치**: 빨간 ECU 표식은 학습 흐름을 설명하는 overlay이며 실제 차종의 물리 ECU 위치를 보증하지 않는다.
- **GLB 시각화**: 문 애니메이션은 승인된 상태 이벤트의 화면 표현이다. 물리 차량 문을 열었다는 증거가 아니다.
- **단일 사용자/메모리 상태**: 세션과 진행 상태는 한 Uvicorn process의 메모리에만 있다. 재시작하면 사라지며 다중 사용자 격리를 제공하지 않는다.
- **로컬 HTTP 전용 MVP**: nginx와 FastAPI는 TLS를 종료하지 않는다. `http://127.0.0.1` 밖으로 공개하지 않는다.
- Docker image나 repository source를 볼 수 있는 사용자는 server 구현과 별도 교사용 자료에서 private contract를 읽을 수 있다. 여기서 “black-box”는 분석 순서를 가르치는 장치이지 강한 source/image secrecy 또는 멀티테넌트 보안 경계가 아니다.

### 문제 해결

- `Cannot connect to the Docker daemon`: Docker Desktop/Engine을 시작한 뒤 `docker version`의 Server 항목을 확인한다.
- `8447` 또는 `8010` 포트 충돌: 해당 포트를 쓰는 로컬 프로세스를 종료한다. 임의의 공개 인터페이스(`0.0.0.0`)로 바꾸지 않는다.
- 페이지에 API offline 표시: `docker compose ps`에서 backend health를 확인하고 `docker compose logs backend`를 본다.
- GLB가 보이지 않음: 브라우저 WebGL 지원을 확인하고 강력 새로고침한다. 모델 파일은 frontend image에 포함된다.
- 실습이 완료되지 않음: 각 프레임의 ECU verdict와 interval을 먼저 확인한다. 단일 승인 프레임은 상태를 바꿀 수 있어도 IDS 완료 조건은 아니다.

## 교사용 정답 문서

정확한 Toy message contract, 정답 script, 기대 verdict와 reset 검증은 [교사용 CAN Attack Lab 검증 가이드](../instructors/can-attack-lab-validation.md)에 분리했다.

> **경고:** 연결된 교사용 문서는 Door·Spoofing·Replay 정답을 포함하므로 학습자에게 배포하지 않는다.
