# KUKSA 문 표시값 실습 — 실제 Databroker 요청 기록

검증일: 2026-09-30. 이 페이지와 실물 테스트는 AI가 로컬 격리 환경에서 구현·실행했다. 사용자가 직접 제품 PoC를 수행했다는 기록은 아니다.

## 무엇을 확인하는 실습인가

학습자는 `Vehicle.Cabin.Door.Row1.DriverSide.IsOpen`의 메타데이터와 값을 실제 gRPC로 조회한다. 그다음 `read` 토큰으로 boolean `true`를 제공하는 provider를 등록하고, **다시 조회한 결과**를 3D 계기판에 표시한다. 등록 승인 응답만으로 계기판을 열림 처리하지 않는다. 수정 버전에서는 같은 `read` 입력의 등록이 `PermissionDenied`로 거절된다.

이것은 공개 [Eclipse 신고·PoC](https://gitlab.eclipse.org/security/vulnerability-reports/-/issues/384)의 `Kuksa.Databroker.CargoVersion` 실증을 문 신호에 그대로 인용한 결과가 아니다. 문 신호는 번들 VSS 4.0과 고정 커밋의 Databroker를 사용해 **별도로 검증한 로컬 실험**이다. 원본 수정 근거는 [제공 권한 검사 PR](https://github.com/eclipse-kuksa/kuksa-databroker/pull/190)이다.

| 항목 | 취약 원본 | 수정 원본 |
| --- | --- | --- |
| 고정 커밋 | `2936b2511bfadc519694e25d12f92402bdd763f6` | `c2d1a3d931a9343d8d98f9727b3007786ac0028b` |
| `read` 토큰의 provider 등록 | 승인 | `PermissionDenied` |
| 등록 후 별도 `GetValue` | boolean `true`를 두 번 확인 | 승인된 provider가 없으므로 `true`를 확인하지 못함 |
| `provide` 토큰 비교군 | 등록 가능 | 등록 가능 |

패치의 등록 거부만으로 “실제 문이 닫혔다”, “물리 센서값이 유지됐다” 또는 “CAN 프레임이 차단됐다”고 쓰지 않는다. 계기판은 Databroker의 소프트웨어 **표시값**을 시각화한 것이다. 물리 도어·차량 ECU·CAN Bus는 이 실습에 없다.

## 직접 실행하는 순서

1. README와 [WSL 빌드 안내](cve-upstream-build.md)를 따라 고정 원본 두 버전과 `repro/kuksa_door_session.rs` 예제를 준비한다. 백엔드를 시작하기 전에 `CANLITE_KUKSA_REPRO_ROOT`를 WSL 절대 경로로 설정한다.
2. 브라우저에서 **공격 실습 → KUKSA 권한 → 취약 버전 → 실습 시작**을 누른다. 세션 시작에는 원본 소스·빌드·토큰·VSS 검증과 loopback Databroker 시작이 포함된다.
3. **메타데이터 확인**을 누른다. `boolean`과 신호 ID가 실제 응답에 표시되어야 제공자 등록 버튼이 활성화된다. 이를 건너뛰면 등록 클라이언트의 `FailedPrecondition`이 나올 수 있으며, 이것은 취약점의 권한 거부가 아니다.
4. **값 재조회**로 초기 상태를 관찰한다. 값이 없으면 `미조회`로 남고 닫힘이라고 단정하지 않는다.
5. 토큰 권한 `read`, 제공할 표시값 `문 열림`을 선택해 **제공자 등록**을 누른다. 취약 원본에서 `등록 승인`이 나타나도 계기판은 아직 그대로여야 한다.
6. **다시 읽어 비교**를 누른다. 이 별도 gRPC `GetValue` 응답이 `readValue: true`일 때만 계기판의 문 열림 표시가 바뀐다. 요청·응답·브로커 로그를 같은 transcript에서 확인한다.
7. **수정 버전**으로 전환하면 이전 세션을 종료하고 새 버전으로 시작한다. 같은 `read`/`true` 입력을 유지한 채 메타데이터 확인 → 제공자 등록을 실행해 `PermissionDenied`를 확인한다. **실습 초기화**로 owned 프로세스를 종료한다.

## 실제 관찰과 검증

Windows + Ubuntu-22.04 WSL의 기존 준비 빌드에서 다음 테스트를 실행했다. 새 WSL을 처음부터 설치·전체 빌드해 재검증한 것은 아니다.

```powershell
$env:CANLITE_KUKSA_REPRO_ROOT = "/home/dddd/.cache/cangraph-kuksa-repro"
& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_kuksa_hands_on_flow.py
```

결과: **3 passed, 0 skipped**. 취약 원본의 초기 `readValue: null`, 등록 승인, 연속 `GetValue(true)` 두 번, 수정 원본의 실제 `PermissionDenied`, reset 후 재시작을 확인했다. 별도 manager/API 단위·실물 테스트는 `server/tests/test_kuksa_hands_on.py`, `test_kuksa_hands_on_api.py`, `test_kuksa_door_live.py`에 있다.

브라우저에서도 사용자 순서로 실제 버튼을 눌렀다. 취약 등록 직후 계기판은 `미조회`, 재조회 직후 `문 열림`이었다. 수정 버전은 같은 입력에 `PermissionDenied`였고 계기판을 열림으로 바꾸지 않았다. 데스크톱 및 390px 레이아웃을 확인했고, 앱 오류 overlay나 콘솔 error는 없었다. 기존 Three.js의 `THREE.Clock` deprecation warning은 남아 있다.

API는 localhost에서만 열리며, 브라우저는 고정된 메타데이터·조회·등록 명령만 보낼 수 있다. 한 API 프로세스에 활성 세션 하나, 증가 revision, 유휴 300초 TTL, 초기화·서버 종료 시 자식 프로세스 정리를 적용했다. 임의 주소·토큰·경로·gRPC 명령은 받지 않는다.

## 스스로 확인할 질문

`register`가 승인됐다는 응답과 계기판의 `readValue: true`는 왜 서로 다른 증거인가? 수정 버전의 `PermissionDenied`와 메타데이터를 건너뛰었을 때의 `FailedPrecondition`은 무엇이 다른가?
