# SWUpdate Hands-on Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학습자가 multipart boundary·마지막 송신 조각·`Content-Length`를 직접 구성하고, 동일한 실제 HTTP 요청의 취약/수정 SWUpdate 응답을 3D 업로드 모듈과 transcript에서 비교한다.

**Architecture:** 제한된 요청 편집기가 바이트 미리보기를 만든다. FastAPI가 독립 검증한 입력을 WSL 러너에 전달하면, 러너가 고정 커밋 SWUpdate를 dry-run·loopback으로 시작하여 분할 HTTP 요청을 보내고 실제 요청 바이트·응답·프로세스 로그를 반환한다. React는 실제 전송 결과만 시각화한다.

**Tech Stack:** Python socket/subprocess/FastAPI/pytest, WSL Ubuntu 22.04, React/TypeScript/Vitest, React Three Fiber.

**Spec:** `docs/superpowers/specs/2026-09-30-cve-hands-on-labs-design.md`

## Global Constraints

- 기존 미커밋 작업을 보존한다. 시작 전 `git status --short`와 관련 파일 diff를 확인하고 해당 단계의 파일/헌크만 스테이징한다. `git add .`를 쓰지 않는다. 현재 원본 재현 코드는 미커밋 상태이므로 이를 잃는 새 worktree에서 무작정 시작하지 않는다.
- SWUpdate는 고정 취약 커밋 `e3b3c977e200283c4eaacb7aa70b28f0cfbde704`와 수정 커밋 `beee2dc0feef1cfe84f1aa6fc980e104b2e47a74`만 사용한다. `/upload`, `127.0.0.1`, `-n` dry-run, 유효하지 않은 짧은 이미지, 기존 커밋/바이너리/추적 소스 검증을 유지한다. 임의 URL·파일 경로·셸·펌웨어 바이트를 브라우저에서 받지 않는다.
- 입력은 ASCII 영숫자 boundary 1~24자, escaped 종료 조각 최대 40자 `\r\n--<boundary>--` 또는 `\r\n--<boundary>--\r\n`, `Content-Length` 정수 1~512로 제한한다. 사용자가 **직접 편집**하되 오타·불일치는 자동 교정하지 않고 명시적 형식 오류를 보여 준다. 서버가 실제 송신 본문 바이트 길이와 일치하는지 재검사하고 불일치 요청은 프로세스를 띄우기 전에 422로 거절한다.
- 같은 바이트로 두 버전을 비교한다. 기존 원샷 API/테스트는 새 경로 검증 전까지 유지한다. SWUpdate의 공용 IPC 때문에 구버전·신버전·기존 API 모두 **같은 lock**으로 직렬화한다.
- 현재 관찰 가능한 범위는 취약 응답의 `-2 bytes`, 수정 응답의 `0 bytes`, 새 연결 수락 여부, invalid image 미설치 로그다. 마지막 **송신 조각 길이**는 파서 내부 `io->len`이 아니다. 소스의 `B+8`/`B+6`은 설명이지 런타임 계측값이 아니다. DoS·OOB read·펌웨어 설치·ECU 장애를 성공 표시하지 않는다.
- 원본 프로세스 실행 실패·응답 없음·로그 누락은 결과 `unknown/error`이며 성공 애니메이션으로 대체하지 않는다. 단위 테스트 skip은 실물 재현 통과가 아니다.

## Review Focus

1. escaped `\r\n`와 실제 `CRLF` 바이트, 문자 길이와 byte 길이, 헤더 `Content-Length`가 불일치하는가? → Task 1~3.
2. boundary 오타·유니코드·과대 입력·임의 경로·길이 조작이 프로세스/네트워크로 넘어가는가? → Task 1~2.
3. 두 variant에 서로 다른 요청이 보내졌는데 비교라고 표시하거나 이전 결과가 수정된 draft에 붙는가? → Task 3~4.
4. 로그 `-2 bytes`를 서비스 거부, 메모리 손상 또는 설치 진행으로 과장하는가? 응답이 없을 때도 음수라고 표시하는가? → Task 3~5.
5. 타임아웃·프로세스 오류·WebGL 실패·390px 화면·기존 Spoofing/Replay에서 실제 입력과 결과를 확인할 수 있는가? → Task 2, 4~5.

---

## Task 1: 편집한 요청을 정확한 바이트로 만들기

**Files**
- Modify: `repro/swupdate_http_probe.py`, `server/tests/test_swupdate_repro.py`
- Create: `server/tests/test_swupdate_request_bytes.py`

**Interfaces**
- `decode_terminal_chunk(*, boundary: str, terminal_chunk_escaped: str) -> bytes`: 위 두 종료 형식만 허용하고 ASCII bytes 반환.
- `build_request(*, boundary: str, terminal_chunk_escaped: str, declared_content_length: int) -> RequestParts`: `header`, `prefix`, `final_chunk`, `actual_body_length`를 갖는 불변 구조. `len(prefix) + len(final_chunk) == declared_content_length`가 아니면 `ValueError`.
- `probe_custom(*, port: int, request: RequestParts) -> dict[str, object]`: `header+prefix`와 마지막 조각을 기존처럼 350ms 간격으로 전송하고 bounded HTTP 응답 및 새 연결 수락 여부를 반환. 기존 `probe(port,boundary,mode)`는 compatibility wrapper로 남긴다.

**Steps**

- [ ] `test_decodes_escaped_final_chunk`, `test_declared_length_matches_sent_body`, `test_rejects_bad_boundary_or_escape`, `test_rejects_wrong_content_length`를 작성한다. 핵심 assertion은 `b"\r\n--ABC--"`, 완전 종료 조각은 +2 bytes, `declared == len(prefix)+len(final_chunk)`, 오류 케이스 `ValueError`다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_request_bytes.py` 실행. 기대: 새 함수 부재로 FAIL.
- [ ] 기존 HTTP 헤더·prefix·분할 전송 방식을 재사용해 builder/decoder를 구현한다. `Content-Length`를 문자열 추정이 아닌 실제 `bytes` 길이에서 계산·대조한다. 전송 trace에는 `firstChunk`, `finalChunk` 외에 `firstChunkHex`, `finalChunkHex`, `declaredContentLength`, `actualBodyLength`를 추가하고 로그 크기를 제한한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_request_bytes.py server/tests/test_swupdate_repro.py` 실행. 기대: 전부 PASS, 기존 `truncated`/`complete` 요청 바이트 동일.
- [ ] 변경 파일만 diff 검토·스테이징 후 `feat: build bounded SWUpdate request bytes from learner input`으로 커밋한다.

## Task 2: 새 실제 요청 실행 경로와 localhost API

**Files**
- Modify: `repro/swupdate_live_run.py`, `server/labs/swupdate_repro.py`, `server/routers/swupdate_repro.py`, `server/tests/test_swupdate_repro_api.py`
- Create: `server/tests/test_swupdate_hands_on_api.py`

**Interfaces**
- `run_custom(root: Path, variant: str, boundary: str, terminal_chunk_escaped: str, declared_content_length: int) -> dict[str, object]` in `repro/swupdate_live_run.py`; 기존 `run(root, variant, boundary, mode)`는 유지한다.
- `run_custom_repro_process(*, root: str, distro: str, variant: str, boundary: str, terminal_chunk_escaped: str, declared_content_length: int) -> dict[str, object]` in `server/labs/swupdate_repro.py`; 기존 `run_repro_process`와 module-level `_lock` 공유.
- `POST /labs/repro/swupdate/send` body `{variant: "vulnerable"|"patched", boundary: str, terminalChunkEscaped: str, declaredContentLength: int}` → 200 기존 `actual_process` 결과 + 정확한 request byte trace. 입력 오류 422, 실행 준비/타임아웃 503.

**Steps**

- [ ] `test_accepts_valid_custom_request`, `test_rejects_remote_or_malformed_input`, `test_missing_build_is_503`, `test_old_and_new_routes_share_lock`, `test_timeout_releases_lock`를 작성한다. 기대 status는 200, 403/422, 503, 직렬 실행, 후속 실행 가능이다. 위조된 runner 출력은 실패로 단언한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_hands_on_api.py` 실행. 기대: 새 route 부재로 FAIL.
- [ ] 원본 소스 무결성/바이너리 SHA/포트 점유 검사, `-n`과 loopback 실행, bounded 응답·로그·75초 내부/90초 외부 timeout을 재사용한다. 새 CLI 인자는 strict 검증 뒤 `argv`로 전달한다. 길이 불일치가 발견되면 SWUpdate를 시작하기 전 거절한다. 반환값에 실제 요청 trace와 기존 `observation`을 포함한다.
- [ ] router에서 원격 주소와 Pydantic strict 모델을 검증하고, 형식 오류 422와 프로세스 오류 503을 구별한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_hands_on_api.py server/tests/test_swupdate_repro_api.py server/tests/test_swupdate_repro.py` 실행. 기대: 전부 PASS.
- [ ] 변경 파일만 diff 검토·스테이징 후 `feat: expose custom local SWUpdate upload request`로 커밋한다.

## Task 3: 같은 바이트의 실물 취약/수정 비교

**Files**
- Create: `server/tests/test_swupdate_hands_on_live.py`
- Modify: `docs/labs/cve-upstream-build.md` (입력 예제·검증 환경 기록)

**Interfaces**
- Live assertion은 두 결과의 `request.firstChunkHex` 및 `request.finalChunkHex`가 **완전히 동일함**을 확인한다. HTTP 버전별 비교는 `observation.reportedBytes`, `request.httpResponse`, `serverLog`, `serverAcceptsNewConnections`, `invalidImageNotInstalled`를 각각 독립 확인한다.

**Steps**

- [ ] `test_live_same_bytes_vulnerable_and_patched`, `test_live_complete_final_chunk`, `test_live_server_stays_available`를 작성한다. 기대값은 요청 hex 완전 동일, 취약 `reportedBytes == -2`, 패치 `== 0`, 완전 종료 조각 `== 0`, 새 연결 허용 및 invalid image 미설치다. 환경 변수 없이 skip이면 실물 gate 미통과로 기록한다.
- [ ] 준비된 WSL에서 `CANLITE_SWUPDATE_REPRO_ROOT`를 설정하고 `& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_hands_on_live.py` 실행. 기대: skip 0개·전부 PASS. 실패하거나 응답이 없다면 `reportedBytes=null`로 남기고 원인을 조사하며 DoS라고 쓰지 않는다.
- [ ] 문서에 테스트 환경/커밋/실제 관찰 결과와 미검증 항목을 분리한다. 새 WSL 전체 재빌드를 수행하지 않았다면 하지 않았다고 적는다.
- [ ] 변경 파일만 diff 검토·스테이징 후 `test: verify live SWUpdate request comparison`으로 커밋한다.

## Task 4: 입력 편집기·3D 업로드 모듈·실제 transcript

**Files**
- Modify: `src/features/cve-labs/SwupdateLabPage.tsx`, `src/features/cve-labs/SwupdateLabPage.test.tsx`, `src/features/cve-labs/cveLabs.css`
- Create: `src/features/cve-labs/swupdateRequestDraft.ts`, `src/features/cve-labs/SwupdateModuleViewport.tsx`, `src/features/cve-labs/SwupdateModuleViewport.test.tsx`
- Reuse: `src/features/attack-lab/AttackStageRail.tsx`, `src/features/cve-labs/ProcessLogEvidence.tsx`

**Interfaces**
- `previewSwupdateDraft(boundary: string, terminalChunkEscaped: string, declaredContentLength: string) -> {valid: boolean, actualBodyLength: number|null, firstChunkEscaped: string|null, finalChunkHex: string|null, error: string|null}`; 프론트 미리보기이며 서버 바이트 검증이 최종 권위다.
- `SwupdateModuleViewport` props `{phase: "draft"|"sent"|"response"|"error", sentChunkHex: string|null, httpResponse: string|null, reportedBytes: number|null}`. phase/result는 실제 `send` 결과에서만 올라가고, 파서 내부 `io->len`이나 설치 진행률을 표현하지 않는다. WebGL 실패 시 같은 값의 2D fallback.

**Steps**

- [ ] `test_edits_bytes_and_declared_length`, `test_rejects_mismatch_without_fetch`, `test_compares_exact_same_draft`, `test_ignores_stale_response`, `test_unknown_on_missing_http`, `test_flat_fallback`을 작성한다. mismatch일 때 fetch 0회, 비교 때 request hex 동일, stale 결과/응답 없음에서는 성공 표시 0개를 단언한다.
- [ ] `corepack pnpm@10.34.3 exec vitest run src/features/cve-labs/SwupdateLabPage.test.tsx src/features/cve-labs/SwupdateModuleViewport.test.tsx` 실행. 기대: 현재 교육 모델 UI 때문에 FAIL.
- [ ] 페이지를 Spoofing/Replay와 같은 목표·단계 rail → 왼쪽 3D 투명 업로더(`HTTP 입력 → multipart 파서 → 응답`) + 오른쪽 제한 편집기 → 아래 실제 HTTP 요청/응답/프로세스 로그/근거 체크포인트로 구성한다. 학습자가 마지막 구간을 클릭하면 해당 실제 hex/escaped bytes를 강조하되 가짜 parser memory state를 생성하지 않는다.
- [ ] `관찰 결과`, `실습 요청 기록`, `내 말로 설명하기`, 숫자만 입력하는 교육 모델, 가상 업로드·서비스 장애는 새 주 화면에서 제거한다. 코드의 `B+8`/`B+6`은 접이식 소스 설명으로만 둔다. 응답 `-2`는 **응답에 표시된 길이**, 새 연결 수락은 별도 확인, 설치/DoS/OOB read는 미입증이라고 표시한다.
- [ ] `AbortController`와 draft fingerprint/generation을 사용해 오랜 요청의 결과가 수정된 입력/버전에 붙지 않게 한다. 색상 없이도 ingress/response 상태를 텍스트로 읽을 수 있어야 한다.
- [ ] `COREPACK_ENABLE_PROJECT_SPEC=0` 환경에서 `corepack pnpm@10.34.3 exec vitest run src/features/cve-labs/SwupdateLabPage.test.tsx src/features/cve-labs/SwupdateModuleViewport.test.tsx` 실행. 기대: 전부 PASS.
- [ ] 같은 환경에서 `corepack pnpm@10.34.3 run typecheck`와 `corepack pnpm@10.34.3 run build` 실행. 기대: 오류 0개.
- [ ] 변경 파일만 diff 검토·스테이징 후 `feat: teach SWUpdate through editable live HTTP requests`로 커밋한다.

## Task 5: 사용자 시연·회귀·중복 정리

**Files**
- Modify: `docs/labs/cve-education-labs.md`, `docs/labs/cve-upstream-build.md`, `README.md`
- Update/remove after green: `src/features/cve-labs/SwupdateReproPanel.tsx`, `SwupdateReproPanel.test.tsx`, `CveLabShell.tsx`, `CveLabShell.test.tsx`, `server/routers/cve_labs.py` 등 *실제 미사용 여부를 검색으로 확인한 항목만*.

**Interfaces**
- 문서의 관찰 표는 요청 바이트/선언·실제 본문 길이, 응답에 표시된 길이, 프로세스 로그, 서비스 생존, 미설치, 미검증 영향으로 분리한다. 소스 식 `B+8`/`B+6`과 송신 chunk 길이는 같은 값으로 쓰지 않는다.

**Steps**

- [ ] 데스크톱·390px 브라우저에서 사용자가 아무 도움 없이 예측 → 문자열 편집 → 길이 확인 → 취약 전송 → 같은 입력 패치 전송 → 실제 로그 근거 선택을 수행할 수 있는지 테스트한다. 요청/응답/3D 강조가 같은 실행을 가리키는지 검토한다. WebGL 강제 실패, 네트워크 오류, 잘못된 입력도 점검한다.
- [ ] Spoofing·Replay 회귀 테스트와 KUKSA 페이지를 확인한다. `CveLabShell` 및 공통 교육 모델의 삭제는 **KUKSA 새 페이지도 green이고 양쪽 참조가 0개일 때만** 수행한다. 그렇지 않으면 구 코드는 주 UI에서만 분리하고 삭제를 보류한다.
- [ ] `& .\.venv\Scripts\python.exe -m pytest -q server/tests`를 실행한다. 기대: 실패 0개, live skip 0개.
- [ ] 전체 `corepack pnpm@10.34.3 test`, `corepack pnpm@10.34.3 run typecheck`, `corepack pnpm@10.34.3 run build`를 실행한다. 기대: 실패/타입/빌드 오류 0개.
- [ ] 문서에 재현 절차·실제 관찰·한계·사용자가 직접 설명해야 할 질문을 남긴다. live skip이 있으면 완료라고 주장하지 않는다.
- [ ] 변경 파일만 diff 검토·스테이징 후 `docs: record verified SWUpdate hands-on flow`로 커밋한다.

## Completion Gate

사용자가 작성한 정확한 HTTP 바이트와 길이를 취약/수정 원본에 동일하게 보냈고, 실제 응답·로그·서버 생존을 확인했으며, 화면이 이 관찰보다 강한 영향(DoS/OOB read/설치)을 주장하지 않을 때 완료다.
