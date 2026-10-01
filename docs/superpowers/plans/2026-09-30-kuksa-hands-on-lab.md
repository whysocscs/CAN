# KUKSA Hands-on Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습자가 제한된 gRPC 명령을 한 세션에서 직접 실행하고, Databroker의 실제 문 신호 재조회 결과만 3D 계기판에 반영한다.

**Architecture:** Windows FastAPI가 WSL의 지속형 호스트 프로세스 하나를 소유한다. 호스트가 고정 커밋 Databroker와 제한 Rust gRPC 클라이언트를 띄우고, 클라이언트는 등록된 provider stream을 유지한다. API는 명령별 실제 응답만 전달하고 React는 그 응답으로 transcript와 계기판을 갱신한다.

**Tech Stack:** FastAPI/Pydantic, Python subprocess/pytest, KUKSA Rust gRPC 예제, WSL Ubuntu 22.04, React/TypeScript/Vitest, React Three Fiber.

**Spec:** `docs/superpowers/specs/2026-09-30-cve-hands-on-labs-design.md`

## Global Constraints

- 기존 미커밋 작업을 보존한다. 시작 전 `git status --short`와 관련 파일 diff를 기록하고, `git add .`를 쓰지 않는다. 이 계획의 커밋에는 해당 단계의 정확한 파일/헌크만 넣는다. 원본 재현 코드는 현재 워크트리에만 있으므로, 별도 worktree를 쓸 때에는 그 코드가 누락되지 않도록 먼저 범위를 확인한다.
- 물리 차량·CAN·문 액추에이터를 건드리지 않는다. 브라우저 입력에는 임의 명령·경로·호스트·포트·토큰을 받지 않는다. Databroker는 `127.0.0.1`에만 바인딩하고 고정 커밋 `2936b2511bfadc519694e25d12f92402bdd763f6` / `c2d1a3d931a9343d8d98f9727b3007786ac0028b`, 번들 VSS 4.0, 기존 데모 JWT만 사용한다.
- 공개 PoC의 실증 대상은 `Kuksa.Databroker.CargoVersion`이다. `Vehicle.Cabin.Door.Row1.DriverSide.IsOpen`의 `read` 권한 우회는 **별도 로컬 실험**이다. Task 1의 실물 테스트가 실패하면 성공 UI를 만들지 않고 이 계획을 중단한다. 기존 CargoVersion 재현을 문 신호 성공의 대용 증거로 쓰지 않는다.
- 조회 전·값 없음·오류는 `unknown`이다. provider 등록 응답만으로 계기판을 변경하지 않는다. `bool true`의 실제 `GetValue` 응답을 받은 경우에만 `open`이다. 패치의 등록 거부만으로 “문이 닫혔다/값이 유지됐다”고 주장하지 않는다.
- 한 API 프로세스당 활성 KUKSA 세션 하나, 시작 45초·명령 10초·유휴 TTL 300초·한 줄 8192바이트·브로커 로그 20000자 상한, 요청 revision 검사를 적용한다. 초기화/버전 전환/서버 종료 시 자식·stream을 정리한다. 세션 충돌은 409, 준비/타임아웃은 명시적 실패다. 기존 원샷의 75초 전체 timeout을 지속형 세션에 그대로 씌우지 않는다.
- 단위 테스트 통과를 실물 재현으로 표현하지 않는다. 라이브 통합 테스트가 환경 변수 부재로 skip되면 완료로 간주하지 않는다. UI의 `actual_process`, 소스 설명, 학습자 예측은 별도 레이블을 쓴다.

## Review Focus

1. `GetValue`가 boolean 부재/null/오류일 때 계기판이 닫힘/열림으로 오인되지 않는가? → Task 1, 4.
2. provider stream이 등록 뒤 두 번 이상 조회할 때도 유지되는가? → Task 1, 2.
3. 다른 탭, stale revision, 유휴 만료, 초기화, FastAPI 종료에서 소유 프로세스가 남거나 이전 응답이 새 화면에 적용되는가? → Task 2~4.
4. 외부 주소/임의 토큰/명령/경로 또는 수정된 upstream 소스가 실행 경계에 들어오는가? → Task 1~3.
5. CargoVersion 공개 PoC와 문 신호 추가 실험, 실제 gRPC 결과와 교육용 표시가 섞이는가? → Task 4~5.

---

## Task 1: 문 신호 실물 재현 가능성부터 입증

**Files**
- Create: `repro/kuksa_door_session.rs`, `repro/kuksa_door_session.py`, `server/tests/test_kuksa_door_live.py`
- Modify: `docs/labs/cve-upstream-build.md` (새 Rust 예제 빌드/실행 준비만 기록)
- Read/reuse: `repro/kuksa_live_run.py`, `repro/source_integrity.py`, `repro/kuksa_read_scope_provider_hijack.rs`

**Interfaces**
- Rust stdin 한 줄 `SessionCommand = {"seq": positive int, "action": "metadata"|"read"|"register", "providerRole"?: "read"|"provide", "providedOpen"?: bool}`. 지정되지 않은 필드·행동은 거절한다.
- Rust stdout 한 줄 `SessionEvent = {"seq": int, "action": str, "outcome": "ok"|"denied"|"error", "grpcStatus": str|null, "signalPath": str, "readValue"?: bool|null, "registrationAccepted"?: bool, "signalType"?: str, "signalId"?: int}`. `readValue`는 실제 `GetValue`에서 boolean을 해석한 `read` 이벤트에만 존재한다. diagnostic/log는 stdout 프로토콜과 분리한다.
- WSL host CLI: `python3 -u repro/kuksa_door_session.py --root <고정 WSL 루트> --variant vulnerable|patched`. 첫 stdout은 sourceCommit이 들어간 `ready` 이벤트, 이후 위 명령/응답을 relay한다. EOF/INT/TERM에 자신이 시작한 broker/client만 정리한다.

**Steps**

- [ ] `test_rejects_missing_or_non_boolean_door_metadata`, `test_rejects_unpinned_source_or_bad_scope`, `test_stdout_is_one_event_per_command`를 작성한다. 각각 시작 실패, 시작 실패, 프레이밍 실패를 단언한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_door_live.py` 실행. 기대: 새 host/클라이언트 부재로 FAIL; WSL 환경 부재 skip만으로 red를 대체하지 않는다.
- [ ] Rust 예제를 번들 VSS 4.0의 `Vehicle.Cabin.Door.Row1.DriverSide.IsOpen`에 고정한다. `list_metadata` → 실제 `get_value` → `open_provider_stream`/`ProvideSignalRequest` → provider가 `TypedValue::Bool(providedOpen)`에 응답 → 실제 재조회가 가능하게 만든다. 첫 조회의 no-value/NotFound는 `unknown`으로 기록하고 stream은 여러 `read` 동안 유지한다. Python host는 기존 커밋/바이너리/JWT 확인을 재사용하며 **양 버전에 같은** `root/kuksa-databroker/data/vss-core/vss_release_4.0.json`을 `--vss`로 로드한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_door_live.py`를 재실행한다. 기대: mock 기반 세 테스트 PASS.
- [ ] WSL에서 새 Rust 예제를 `--locked --offline`로 빌드하고 실물 시퀀스 `metadata → read → register(read,true) → read → read`를 테스트에 추가한다. 기대: 취약/read 등록 승인, 두 조회 모두 `readValue is True`; 초기 조회는 `None` 허용. 패치/read의 실제 `PermissionDenied`, provide/true의 승인도 별도 단언한다.
- [ ] `CANLITE_KUKSA_REPRO_ROOT`를 설정한 상태에서 `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_door_live.py server/tests/test_kuksa_repro.py` 실행. 기대: live case skip 0개·전부 PASS. 하나라도 실패하면 여기서 중단하고 raw gRPC 상태를 보고한다.
- [ ] 문 신호 실험임을 빌드 문서에 표시하고, 정확한 새 예제 빌드 명령·실행 환경을 기록한다.
- [ ] 새/변경 파일만 diff를 검토하여 스테이징하고 `feat: prove live KUKSA door-signal probe`로 커밋한다.

## Task 2: 지속형 세션과 프로세스 수명 관리

**Files**
- Create: `server/labs/kuksa_hands_on.py`, `server/tests/test_kuksa_hands_on.py`
- Modify: `repro/kuksa_door_session.py` (bounded relay/cleanup)

**Interfaces**
- `KuksaSessionManager.start(*, root: str, distro: str, variant: Literal["vulnerable","patched"]) -> SessionState`.
- `KuksaSessionManager.execute(*, session_id: str, revision: int, command: SessionCommand) -> tuple[SessionState, SessionEvent]`.
- `KuksaSessionManager.close(*, session_id: str, revision: int) -> None`, `shutdown() -> None`; `SessionState`는 `sessionId`, `revision`, `variant`, `sourceCommit`, `targetPath`를 포함한다. manager는 `KuksaSessionConflict`와 `KuksaSessionUnavailable`을 구분해 던지고 router가 각각 409/503으로 바꾼다. UI나 API에서 브로커 포트·JWT·셸을 지정하지 않는다.

**Steps**

- [ ] fake WSL child 테스트 `test_single_active_session`, `test_stale_revision`, `test_stream_survives_two_reads`, `test_idle_expiry_and_shutdown`, `test_broken_pipe_and_oversize_output_close_child`를 작성한다. 기대값은 각각 `KuksaSessionConflict`, `KuksaSessionConflict`, 같은 PID, TTL 후 종료, 실패 후 종료다. stale `close`도 거부한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on.py` 실행. 기대: manager 부재로 FAIL.
- [ ] 단일 lock + 128비트 이상 서버 발급 난수 session ID + 증가 revision을 구현한다. Windows `wsl -d Ubuntu-22.04 -- ...`는 문자열 셸이 아닌 argv로 호출하고 `Popen`의 stdout/stderr를 별도 bounded reader로 소모한다. 별도 타이머로 TTL 만료를 처리하고, 클라이언트 종료 때 자신이 띄운 host/broker/stream이 끝났는지 확인한다. 타임아웃이나 host exit를 성공 응답으로 바꾸지 않는다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on.py` 실행. 기대: 전부 PASS.
- [ ] 실제 WSL에서 start/metadata/read/register/read/close 후 port 55565/55566 재바인딩과 소유 자식 종료를 확인한다. 포트가 원래 점유됐으면 사용자의 프로세스를 종료하지 않는다.
- [ ] 변경 파일만 스테이징·diff 검토 후 `feat: manage bounded KUKSA hands-on sessions`로 커밋한다.

## Task 3: 단계별 localhost API

**Files**
- Create: `server/routers/kuksa_hands_on.py`, `server/tests/test_kuksa_hands_on_api.py`
- Modify: `server/main.py`

**Interfaces**
- `POST /labs/repro/kuksa/session` body `{variant}` → 201 `SessionState`.
- `POST /labs/repro/kuksa/session/{session_id}/command` body `{revision, action, providerRole?, providedOpen?}` → 200 `{session: SessionState, event: SessionEvent, evidenceKind: "actual_process"}`.
- `POST /labs/repro/kuksa/session/{session_id}/reset` body `{revision}` → 200 `{closed: true}`. 버전 변경은 reset 뒤 start. API lifespan 종료는 manager `shutdown()`.

**Steps**

- [ ] FastAPI TestClient 테스트 `test_rejects_remote_or_extra_input`, `test_conflict_and_stale_revision`, `test_returns_actual_event`, `test_shutdown_closes_child`를 작성한다. 기대: 403/422, 409, 실제 event, 자식 종료; 환경 설정 누락은 503.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on_api.py` 실행. 기대: 새 route 부재로 FAIL.
- [ ] strict Pydantic 모델과 로컬 주소 확인을 구현하고 `server/main.py`에 router 및 shutdown을 연결한다. 오류 메시지는 학습자에게 다음 행동을 알려 주되 내부 토큰·호스트 명령·traceback을 노출하지 않는다. 기존 `/labs/repro/kuksa/run`은 새 UI가 안정화될 때까지 그대로 둔다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on_api.py server/tests/test_kuksa_repro_api.py` 실행. 기대: 전부 PASS.
- [ ] 실제 WSL API에서 `registrationAccepted=true` 다음 `readValue=true`가 별도 event이며, 패치 등록 거부에는 `readValue`가 없는지 확인한다.
- [ ] 변경 파일만 스테이징·diff 검토 후 `feat: expose local KUKSA command session API`로 커밋한다.

## Task 4: 학습자가 조작하는 페이지와 실제 조회값 계기판

**Files**
- Modify: `src/features/cve-labs/KuksaLabPage.tsx`, `src/features/cve-labs/KuksaLabPage.test.tsx`, `src/features/cve-labs/cveLabs.css`
- Reuse: `src/features/cve-labs/InstrumentClusterViewport.tsx`, `InstrumentClusterDisplay.tsx`, `src/features/attack-lab/AttackStageRail.tsx`, `ProcessLogEvidence.tsx`
- Create if needed: `src/features/cve-labs/kuksaHandsOnApi.ts`, `src/features/cve-labs/KuksaHandsOnTranscript.tsx`

**Interfaces**
- TS `KuksaStageResult`는 Task 3의 `{session,event,evidenceKind}`를 검증해 해석한다. `InstrumentClusterViewport`의 기존 `observedOpen: boolean|null`을 유지한다.
- UI 파생 규칙: 마지막 **현 세션**의 실제 `read` event 중 boolean이면 그 값을 표시, `metadata`/`register`/오류/초기화/버전 전환은 계기판을 임의 변경하지 않는다. 초기값은 `null`.

**Steps**

- [ ] `KuksaLabPage.test.tsx`를 실제 API fixture로 교체한다. `test_registration_does_not_open_cluster`, `test_real_read_opens_cluster`, `test_null_or_error_is_unknown`, `test_patch_denial_and_same_input`, `test_stale_response_and_flat_fallback`을 작성한다. 390px 배치는 별도 브라우저 체크다.
- [ ] `corepack pnpm@10.34.3 exec vitest run src/features/cve-labs/KuksaLabPage.test.tsx` 실행. 기대: 현재 교육 모델 UI 때문에 FAIL.
- [ ] 헤더/목표/예측 → 단계 rail → 왼쪽 기존 3D 계기판 + 오른쪽 역할/열림값/명령 컨트롤 → 아래 시간순 실제 gRPC transcript/근거 체크포인트로 재배치한다. `내 말로 설명하기`, `관찰 결과`, `실습 요청 기록`, 가상 CAN/교육 모델 이벤트는 이 페이지에서 제거한다. 원문·실습 한계는 접이식 안내로 둔다.
- [ ] fetch 취소와 session ID + revision + 화면 generation 검사를 넣는다. 다른 variant 선택 시 기존 세션 reset을 기다리고 새 세션을 연다. 네트워크/409/503/프로토콜 오류는 결과로 연출하지 않는다. 계기판에 “브로커가 돌려준 표시값이며 물리 문 상태가 아님”을 명시한다.
- [ ] `COREPACK_ENABLE_PROJECT_SPEC=0` 환경에서 `corepack pnpm@10.34.3 exec vitest run src/features/cve-labs/KuksaLabPage.test.tsx` 실행. 기대: 전부 PASS.
- [ ] 같은 환경에서 `corepack pnpm@10.34.3 run typecheck` 및 `corepack pnpm@10.34.3 run build` 실행. 기대: 오류 0개.
- [ ] 기존 Spoofing·Replay 테스트를 실행한다. 기대: 회귀 0개.
- [ ] 변경 파일만 스테이징·diff 검토 후 `feat: drive KUKSA cluster from live gRPC reads`로 커밋한다.

## Task 5: 사용자 경로 시연과 증거 정리

**Files**
- Modify: `docs/labs/cve-education-labs.md`, `docs/labs/cve-upstream-build.md`, `README.md`
- Update/remove after green: `src/features/cve-labs/KuksaReproPanel.tsx`, `KuksaReproPanel.test.tsx` (새 페이지에서 미사용임을 확인한 뒤)
- Create: `server/tests/test_kuksa_hands_on_flow.py` (실물 환경 gate)

**Interfaces**
- 문서의 결과 표는 `variant`, `providerRole`, `registration`, `readValue`, `sourceCommit`, `evidenceKind`, `미검증 효과`를 구분한다. 실제 값/로그는 실행 결과로만 채우며 샘플을 실측이라고 쓰지 않는다.

**Steps**

- [ ] `test_live_api_vulnerable_read_twice`, `test_live_api_patched_denied`, `test_live_api_reset_releases_port`를 작성한다. 각각 두 `readValue is True`, 실제 `PermissionDenied`, 재바인딩 가능을 단언한다. provide 비교군은 별도 case다.
- [ ] `CANLITE_KUKSA_REPRO_ROOT` 설정 후 `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on_flow.py` 실행. 기대: skip 0개·PASS; 실패하면 UI 완료로 간주하지 않고 실제 응답을 조사한다.
- [ ] 데스크톱과 390px 브라우저에서 학습자 순서로 직접 조작한다. 확인할 증거: 실제 요청·응답 시간순, 계기판은 재조회 때만 변경, 출처 `actual_process`, 오류/새로고침/탭 충돌/2D fallback. 동시에 Spoofing·Replay 페이지 회귀를 확인한다.
- [ ] 새 경로가 green일 때만 미사용 원샷 KUKSA 패널과 해당 테스트를 정리한다. CargoVersion 공개 PoC 검증 코드는 별도 근거로 남기되 주 UI에 중복 노출하지 않는다. README/실습 문서에 문 신호 추가 실험과 물리 도어 제어 불가를 기록한다.
- [ ] 전체 Python 테스트, 전체 Vitest, typecheck, build를 실행한다. 기대: 실패 0개이고 live 테스트 skip 0개; skip이 있으면 이 Task는 미완료다.
- [ ] 변경 파일만 스테이징·diff 검토 후 `docs: record verified KUKSA hands-on flow`로 커밋한다.

## Completion Gate

실제 WSL의 동일 세션에서 취약/read 등록 뒤 `GetValue(bool true)`가 관찰되고, 패치/read 거부가 확인되고, 계기판·transcript가 그 응답에만 연결될 때 완료다. 실패하면 원인·환경·gRPC 상태를 보고하고 UI를 성공한 것처럼 출시하지 않는다.
