# SWUpdate multipart 실습: 직접 요청하고 실제 응답 읽기

이 페이지는 CVE-2026-28525 관련 파서 동작을 **격리된 로컬 SWUpdate 원본**에서 비교한다. 사용자는 HTTP 요청의 끝부분을 만들고 실제 프로세스의 응답을 읽는다. 가상 펌웨어 설치·차량 3D 상태는 만들지 않는다.

## 먼저 알아야 할 것

- `multipart/form-data`의 `boundary`는 본문에서 각 부분과 종료 지점을 구분하는 문자열이다.
- `Content-Length`는 **HTTP 본문 전체**의 바이트 수다. 첫 전송 조각의 헤더 바이트는 여기에 포함되지 않는다.
- 입력창의 `\r\n`은 백슬래시 네 글자 표기지만, 실제 전송 조각에는 `CR LF` 두 바이트(`0d 0a`)가 들어간다.
- 이 실습의 종료 조각은 `\r\n--<boundary>--` 또는 끝에 `\r\n`을 한 번 더 붙인 두 형식만 허용한다. 임의 파일·URL·셸·펌웨어 내용은 받지 않는다.

## 사용자 실습 순서

1. **공격 실습 → SWUpdate 업로드**로 간다. 기본값 `boundary=ABC`, 마지막 조각 `\r\n--ABC--`, `Content-Length=125`를 확인한다. 예상: 취약 원본의 응답 표시값이 수정 원본과 다를까?
2. 일부러 길이를 `124`로 바꾼다. 화면에 “선언한 124바이트와 실제 125바이트가 다릅니다”가 나오고 전송 버튼이 비활성화되는지 확인한다. `125`로 돌린다.
3. **취약 버전에 전송**을 누른다. 전송된 마지막 조각의 hex `0d0a2d2d4142432d2d`, HTTP 응답의 `-2 bytes.`, 새 연결 수락, 무효 이미지 미설치 로그를 각각 확인한다.
4. 입력을 바꾸지 않고 **같은 입력을 수정 버전에 전송**한다. 요청의 `firstChunkHex`와 `finalChunkHex`가 두 실행에서 같은지 비교한다. 수정 응답에는 `0 bytes.`가 보여야 한다.
5. 마지막 조각을 `\r\n--ABC--\r\n`으로 **직접** 바꾼다. 화면이 계산한 실제 본문 길이는 `127`이므로 `Content-Length`도 `127`로 바꾼다. 취약 버전에 다시 보내면 이 환경에서는 `0 bytes.`가 보인다. 입력을 고치면 이전 결과가 지워져 다른 요청의 결과를 같은 비교에 붙이지 않는다.
6. 아래의 실제 HTTP 요청·응답 영역에서 첫/마지막 전송 조각 버튼을 눌러 각 hex를 읽는다. 3D 모듈은 `HTTP 입력 → multipart 파서 → HTTP 응답` 위치와 **실제 응답 표시값**을 보여 준다. WebGL이 없으면 같은 값을 평면으로 보여 준다.

## 확인한 증거와 한계

2026-09-30, Ubuntu 22.04 WSL에 미리 빌드한 SWUpdate 취약 커밋 `e3b3c977e200283c4eaacb7aa70b28f0cfbde704`와 수정 커밋 `beee2dc0feef1cfe84f1aa6fc980e104b2e47a74`를 사용했다. 각 실행은 바이너리 버전·원본 추적 소스·포트 점유를 검사하고, `-n` dry-run과 `127.0.0.1`의 `/upload`만 이용한다. 유효한 `.swu` 이미지는 보내지 않았다. 이 빌드의 최초 준비부터 새 WSL에서 다시 수행하는 검증은 하지 않았다.

| 실제 요청 | 응답에 표시된 길이 | 별도 확인 |
| --- | --- | --- |
| 취약, `\r\n--ABC--`, 본문 125바이트 | `-2 bytes.` | 새 연결 수락, `Image invalid or corrupted. Not installing` |
| 수정, **동일 바이트** | `0 bytes.` | 새 연결 수락, 무효 이미지 미설치 |
| 취약, `\r\n--ABC--\r\n`, 본문 127바이트 | `0 bytes.` | 새 연결 수락, 무효 이미지 미설치 |

`-2 bytes`는 HTTP 응답에 **표시된 숫자**이지 실제 업로드 길이, 파서 내부 `io->len`, 메모리 읽기 위치의 직접 계측값이 아니다. 마지막 **송신 조각 길이** 9/11바이트와 소스의 `B+6`/`B+8` 계산을 동일한 런타임 값으로 부르지 않는다. 이 관찰만으로 Out-of-bounds read(경계 밖 읽기), 버퍼 오버플로 쓰기, 서비스 거부, 코드 실행, 업데이트 설치를 입증할 수 없다. 새 연결이 수락된 실행에서 지속적 DoS가 있었다고 적어서는 안 된다.

화면의 송신 hex는 로컬 소켓의 `sendall()`이 두 조각 모두에 대해 반환됐을 때만 결과로 표시한다. 이는 로컬 송신 완료 확인이지, 상대 프로세스가 모든 바이트를 처리했다는 증명은 아니다. 전송이 중간에 실패하면 서버가 결과를 거부하고, 재실행이 실패하면 화면에 이전 응답을 현재 결과처럼 남기지 않는다.

재현 가능 여부는 다음처럼 확인한다. 환경 변수와 전체 빌드 절차는 [원본 준비 문서](cve-upstream-build.md)를 따른다.

```powershell
$env:CANLITE_SWUPDATE_REPRO_ROOT = "/home/dddd/.cache/cangraph-swupdate-repro"
& .\.venv\Scripts\python.exe -m pytest -q server/tests/test_swupdate_hands_on_live.py
```

위 환경에서 결과는 `3 passed, 0 skipped`였다. 백엔드 전체는 KUKSA·SWUpdate 실물 검증을 포함해 `277 passed`였다. 브라우저에서도 입력 오류 차단, 취약 `-2`, 수정 `0`, 완전 종료 `0`, 390px 화면 가로 넘침 없음까지 확인했다. 프론트 기본 병렬 실행은 기존 Spoofing/Replay·Door 사례 3건이 간헐 실패했으나, 해당 두 파일 단독은 `83 passed`, 작업자 1개·10초 제한의 전체 재검증은 `40 files, 362 passed`였다. 따라서 **기본 병렬 명령까지 안정적으로 통과한다고 주장하지 않는다.**

```powershell
$env:COREPACK_ENABLE_PROJECT_SPEC = "0"
corepack pnpm@10.34.3 exec vitest run --maxWorkers=1 --testTimeout=10000 --reporter=dot
```

원본 근거: [SWUpdate 공식 수정 커밋](https://github.com/sbabic/swupdate/commit/beee2dc0feef1cfe84f1aa6fc980e104b2e47a74), [공개 취약점 분석](https://www.vulncheck.com/advisories/swupdate-integer-underflow-in-multipart-upload-parser).

스스로 답할 질문: 왜 `Content-Length=124` 요청은 이 실습에서 아예 전송되지 않는가? 같은 바이트에서 `-2`와 `0`이 다르게 보이는 사실만으로 서비스 거부가 일어났다고 할 수 없는 이유는 무엇인가?
