# CANLite 로컬 Linux 터미널

이 기능은 브라우저 안에서 **실제 Linux 셸**을 엽니다. 셸은 서버를 실행한 사용자와 동일한 권한으로 동작합니다.

서버는 반드시 로컬 루프백 주소(`127.0.0.1:8010`)에서만 실행하도록 구성되어 있습니다. 이 프로젝트를 공유 네트워크나 공개 서버에 배포하지 마세요. 8010번 포트를 사용하므로 모델 관리용 FastAPI(기본 8000)와 충돌하지 않습니다.

## 최초 한 번

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r server/requirements.txt
```

## 실행

터미널을 하나 열어 실제 PTY를 명시적으로 활성화한 뒤 서버를 시작합니다. 이 기능은 공격 실습의 제한형 virtual terminal과 다르며, 신뢰할 수 있는 로컬 환경에서만 활성화해야 합니다.

```bash
export CANLITE_ENABLE_REAL_TERMINAL=true
export CANLITE_TERMINAL_ORIGINS=http://127.0.0.1:8447,http://localhost:8447
export COREPACK_ENABLE_PROJECT_SPEC=0
corepack pnpm@10.34.3 terminal:server:unix
```

다른 터미널에서 웹앱을 실행합니다.

```bash
export COREPACK_ENABLE_PROJECT_SPEC=0
corepack pnpm@10.34.3 dev:ver4
```

그다음 `http://127.0.0.1:8447`을 열고 CAN 실습의 **Terminal** 탭을 선택합니다.

`CANLITE_SHELL_CWD` 환경 변수를 지정하면 셸의 시작 폴더를 바꿀 수 있습니다. 기본값은 서버를 시작한 프로젝트 폴더입니다.

`CANLITE_ENABLE_REAL_TERMINAL`의 기본값은 `false`입니다. Origin header가 없거나 `CANLITE_TERMINAL_ORIGINS`에 없는 요청은 WebSocket policy violation으로 종료됩니다.
