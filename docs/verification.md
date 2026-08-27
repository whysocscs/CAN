# 검증 절차

## 기준 환경

- Node.js 22
- pnpm `10.34.3` (`pnpm-lock.yaml` 고정)
- Python 3.12 권장
- Docker Compose v2 (컨테이너 검증 시)

의존성 버전을 임의로 갱신하지 않고 `--frozen-lockfile`로 설치한다.

```bash
export COREPACK_ENABLE_PROJECT_SPEC=0
corepack pnpm@10.34.3 install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt -r server/requirements-dev.txt
```

Windows PowerShell에서는 Python 경로만 `.venv\Scripts\python.exe`로 바꾼다.
backend 실행 script도 OS별로 `terminal:server:unix`, `terminal:server:windows`를 제공한다.

## 자동 검사

프로젝트 루트에서 아래 순서로 실행한다.

```bash
CANLITE_CAN_MODE=loopback .venv/bin/python -m pytest server/tests -q
.venv/bin/python -m compileall -q server
corepack pnpm@10.34.3 test
corepack pnpm@10.34.3 typecheck
corepack pnpm@10.34.3 build
docker compose config --quiet
git diff --check
```

합격 조건은 다음과 같다.

- pytest와 Vitest가 skip으로 기능 실패를 숨기지 않고 모두 통과한다.
- TypeScript strict 검사와 Python bytecode compile이 오류 없이 끝난다.
- Vite가 `dist/`를 만들고 unresolved import를 남기지 않는다.
- Compose 설정이 유효하고 공개 인터페이스가 아닌 `127.0.0.1`에만 port를 publish한다.
- `git diff --check`가 conflict marker, trailing whitespace, 잘못된 EOF를 보고하지 않는다.

Vite의 500 kB chunk 경고는 현재 알려진 성능 경고이며 빌드 실패는 아니다. 기능 회귀와
혼동하지 않되, 배포 성능 작업에서는 별도 개선 대상으로 기록한다.

## 수동 smoke test

### 정상 CAN

1. backend를 `CANLITE_CAN_MODE=loopback`으로, frontend를 `dev:ver4`로 실행한다.
2. `정상 CAN 송수신`에서 `ip link show vcan0`, `candump vcan0`를 차례로 입력한다.
3. `cansend vcan0 101#00` 후 monitor에 `0x101`, inspector에 DATA `00`, 차량에 도어 effect가 보이는지 확인한다.
4. `cansend vcan0 200#01` 후 같은 세 화면이 트렁크 event 하나를 가리키는지 확인한다.
5. ECU Name/CAN Bus 토글, 자동 회전, Reset View가 Canvas를 재마운트하지 않고 동작하는지 확인한다.

### 공격 실습

1. `전체 공격 체인`에서 session 생성, 명령 실행, reset을 반복해 이전 generation의 결과가 돌아오지 않는지 확인한다.
2. 거부된 frame의 rail이 거부 지점에서 멈추고 차량 effect가 없는지 확인한다.
3. 실행된 frame만 도어 effect를 적용하고 monitor verdict·IDS 상태와 일치하는지 확인한다.
4. Spoofing과 Replay에서 각 script를 실행해 trace 순서, 자동 재생, 모션 축소 모드의 즉시 완료가 같은 최종 상태인지 확인한다.

### 보안 경계

1. 기본 설정에서 `/ws/terminal` 연결이 policy violation으로 닫히는지 확인한다.
2. backend opt-in만 켜고 Origin을 빼거나 외부 Origin을 보내도 import/accept 전에 닫히는지 확인한다.
3. Docker Compose에서는 실제 PTY가 계속 비활성화되어 있는지 확인한다.
