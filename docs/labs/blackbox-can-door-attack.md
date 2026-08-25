# Black-box CAN Door Attack 실습 가이드

이 실습은 격리된 로컬 환경에서 CAN 기록을 관찰하고, Toy Body ECU의 메시지 규칙을 추론한 뒤, Toy IDS가 허용하는 프레임 시퀀스를 만드는 교육용 실습이다. 실제 차량, OEM ECU, 실제 IDS의 우회를 재현하거나 주장하지 않는다.

이 Toy scenario는 학습자가 **Training OBD-II에 추상화된 injection access(주입 접근)** 를 이미 가진 상태에서 시작한다. 최초 접근(initial access), 원격 취약점 악용, Toy Gateway 장악, 물리 차량 접근을 획득하는 과정은 실습 범위 밖이다.

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

### 화면의 세 증거 채널

- **Virtual Terminal**: 입력한 command echo와 가상 stdout/stderr만 보여 준다.
- **Vehicle Flow**: backend가 반환한 `flowTraces`를 교육용 slow-motion으로 재생하며 현재 Toy device를 보여 준다. 실제 CAN hop telemetry가 아니다.
- **왜 이런 결과가 발생했나요?**: `Terminal`, `Toy ECU`, `Toy IDS`, `교육용 분석` source label로 판정의 출처를 구분한다.

정상 형식의 `cansend`가 가상 CAN 경로에 들어가면 transcript가 **silent(출력 없음)** 일 수 있다. 이는 CAN ACK, Toy ECU 수락, 차량 효과를 증명하지 않는다. Vehicle Flow의 도달 지점, Network Monitor의 frame, Binary Inspector의 DATA, source-labelled explanation을 함께 대조해야 한다.

### 실습 진행

1. 차량 모델에서 빨간 **Toy Body ECU**와 **Left Door** 표식을 확인한다.
2. 제한 터미널에서 파일 목록과 두 캡처를 확인한다.
3. 캡처를 CAN ID별로 묶고, 같은 ID의 각 바이트가 시간에 따라 어떻게 변하는지 표로 적는다.
4. **Prediction(예측)**: 실행 전에 예상 route, Toy ECU verdict, Toy IDS verdict, GLB 변화를 기록한다.
5. **Execution(실행)**: 캡처의 프레임 하나를 그대로 제출해 replay 결과를 확인하고, 이후 code 입력창에서 3개 프레임과 전송 간격 가설을 한 번에 하나씩 검증한다.
6. **Evidence selection(근거 선택)**: Network Monitor에서 해당 frame을 선택하고 Binary Inspector DATA, Vehicle Flow, source-labelled explanation, ECU/IDS 상태를 같은 action 기준으로 확인한다.
7. **Comparison/reflection(비교·성찰)**: 예상과 실제 결과가 달랐던 이유를 20자 이상으로 적고 Learning Check를 완료한다.

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
- replay 실패 프레임, `Toy ECU verdict`, `Toy IDS verdict`, 실패 원인 설명
- 최종 3프레임 script와 전송 간격
- 세 프레임의 `EXECUTED`, Toy IDS `NORMAL`, 완료 evidence가 함께 보이는 화면
- “실제 차량에서도 같은 ID/데이터가 동작한다”라고 일반화할 수 없는 이유

Evidence의 **공격 조건 충족**은 backend Toy scenario의 기술적 성공을 뜻한다. **학습 확인 완료**는 실행 전에 예측을 남기고, 같은 action의 evidence를 선택하고, 결과와 비교한 설명을 작성한 뒤 직접 확인한 별도 로컬 상태다. 전자만 달성해도 실습 학습이 완료된 것은 아니다.

### 안전 경계와 한계

- **Toy ECU/Toy IDS**: 이 저장소 전용 메시지 계약과 단순 규칙이다. OEM 규격, SecOC/E2E, 상용 IDS 검증 결과가 아니다.
- **교육용 논리 위치**: 빨간 ECU 표식은 학습 흐름을 설명하는 overlay이며 실제 차종의 물리 ECU 위치를 보증하지 않는다.
- **GLB 시각화**: 문 애니메이션은 승인된 상태 이벤트의 화면 표현이다. 물리 차량 문을 열었다는 증거가 아니다.
- **단일 사용자/메모리 상태**: 세션과 진행 상태는 한 Uvicorn process의 메모리에만 있다. 재시작하면 사라지며 다중 사용자 격리를 제공하지 않는다.
- **로컬 HTTP 전용 MVP**: nginx와 FastAPI는 TLS를 종료하지 않는다. `http://127.0.0.1` 밖으로 공개하지 않는다.
- Docker image나 open source repository checkout을 볼 수 있는 사용자는 server 구현과 교사용 자료에서 private contract를 찾을 수 있다. 따라서 이 구성은 강한 assessment secrecy(평가 정답 비밀성)를 제공하지 않는다. 다만 학습자 UI와 production bundle에는 교사용 완료 command를 포함하지 않는다. 여기서 “black-box”는 분석 순서를 가르치는 장치이지 강한 source/image secrecy 또는 멀티테넌트 보안 경계가 아니다.

### 문제 해결

- `Cannot connect to the Docker daemon`: Docker Desktop/Engine을 시작한 뒤 `docker version`의 Server 항목을 확인한다.
- `8447` 또는 `8010` 포트 충돌: 해당 포트를 쓰는 로컬 프로세스를 종료한다. 임의의 공개 인터페이스(`0.0.0.0`)로 바꾸지 않는다.
- 페이지에 API offline 표시: `docker compose ps`에서 backend health를 확인하고 `docker compose logs backend`를 본다.
- GLB가 보이지 않음: 브라우저 WebGL 지원을 확인하고 강력 새로고침한다. 모델 파일은 frontend image에 포함된다.
- 실습이 완료되지 않음: `Virtual terminal stderr`, `Toy ECU verdict`, `Toy IDS verdict`, `교육용 분석`을 출처별로 구분하고 각 프레임의 interval을 확인한다. 단일 승인 프레임은 상태를 바꿀 수 있어도 IDS 완료 조건은 아니다.

## 정답 노출 경계

정확한 Toy message contract와 완료 command는 학습자 UI/production bundle에서 제외한다. 그러나 open source checkout 자체는 강한 정답 비밀성을 보장할 수 없으므로, 평가자는 저장소 접근 통제나 별도 평가 인스턴스를 독립적으로 설계해야 한다.
