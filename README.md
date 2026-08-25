# CANLite

CANLite는 자동차 보안 입문자가 CAN 프레임과 ECU 흐름을 학습하고, 격리된 Toy 환경에서 공격 가설을 검증하는 교육 플랫폼이다.

현재 저장소에는 다음이 구현되어 있다.

- React + TypeScript + Vite 기반 CAN 기초·실습 UI
- 실제 GLB 차량 모델과 CAN WebSocket 이벤트 시각화
- FastAPI 기반 loopback CAN event stream
- in-memory Toy ECU/Toy IDS 기반 Door, Spoofing, Replay 실습
- 제한 명령만 해석하는 공격 실습용 virtual terminal
- localhost 전용 Docker Compose 패키징

SQLite, 사용자 인증/진도 영속화, 실제 차량·물리 CAN 검증, OEM IDS, RCE/LPE 실습은 현재 범위에 포함되지 않는다.

## Docker로 빠르게 실행

Docker Compose v2가 필요하다.

```bash
docker compose up --build
```

`http://127.0.0.1:8447`을 열고 **공격 실습 → 전체 공격 체인**으로 이동한다. 종료할 때는 다음을 실행한다.

```bash
docker compose down
```

기본 배포는 `127.0.0.1:8447`(frontend), `127.0.0.1:8010`(backend), `CANLITE_CAN_MODE=loopback`만 사용한다. TLS/HTTPS를 제공하지 않으므로 외부 네트워크에 공개하지 않는다.

학습·검증 문서:

- 학습자용(정답 없음): [Black-box CAN Door Attack 실습 가이드](docs/labs/blackbox-can-door-attack.md)
- 학습자용(정답 없음): [CAN Spoofing·Replay 기초 실습 가이드](docs/labs/can-spoofing-replay-basics.md)
- **교사용(정답 포함, 학습자 배포 금지)**: [CAN 공격 실습 빠른 통과표](docs/instructors/can-attack-lab-quick-pass.md)
- **교사용(정답 포함, 학습자 배포 금지)**: [CAN Attack Lab 검증 가이드](docs/instructors/can-attack-lab-validation.md)

## 로컬 개발

Python 3.12, Node.js 22, pnpm `10.34.3` 기준이다. 먼저 backend 환경을 준비한다.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r server\requirements.txt -r server\requirements-dev.txt
$env:CANLITE_CAN_MODE = "loopback"
.venv\Scripts\python -m uvicorn server.main:app --host 127.0.0.1 --port 8010
```

다른 PowerShell에서 frontend를 실행한다. pnpm 버전을 명시해 Corepack의 자동 버전 선택을 피한다.

```powershell
$env:COREPACK_ENABLE_PROJECT_SPEC = "0"
corepack pnpm@10.34.3 install --frozen-lockfile
corepack pnpm@10.34.3 dev:ver4
```

개발 화면은 `http://127.0.0.1:8447`이다.

## 터미널 두 종류

공격 실습 페이지의 `/labs/door-blackbox/.../terminal`은 whitelist parser이며 실제 shell을 만들지 않는다. `pwd`, `ls`, `cat`, 제한된 `candump`/`cansend` 문법만 Toy 결과로 처리한다.

별도의 `/ws/terminal`은 호스트 권한으로 POSIX PTY를 여는 기존 기능이다. frontend의 `VITE_ENABLE_REAL_TERMINAL=true`와 backend의 `CANLITE_ENABLE_REAL_TERMINAL=true`를 모두 명시하고 허용된 `Origin`으로 접속한 경우에만 연결되며, Docker Compose에서는 항상 비활성화한다. 이 기능은 공격 실습에 필요하지 않으며 공개 서버에서 활성화하면 안 된다.

## 검사와 빌드

```powershell
.venv\Scripts\python -m pytest server\tests -q
.venv\Scripts\python -m compileall -q server
$env:COREPACK_ENABLE_PROJECT_SPEC = "0"
corepack pnpm@10.34.3 test
corepack pnpm@10.34.3 typecheck
corepack pnpm@10.34.3 build
docker compose config --quiet
```

실습은 교육용 논리 모델이다. GLB 문 움직임은 Toy ECU가 승인한 상태 이벤트의 시각화이며 실제 차량의 물리 동작이나 특정 차종의 취약점을 뜻하지 않는다.
