# CANLite: CAN 프레임 기초에서 공격 실습·1-day 분석까지

이 문서는 Classical CAN의 기본 프레임 구조만 아는 학습자가 CANLite를 단순히 따라 치는 데서 끝내지 않고, 명령의 의미와 데이터 흐름을 설명하고 직접 고칠 수 있게 만드는 순서표다. 기간보다 **관찰 가능한 완료 기준**을 우선한다.

## 먼저 구분할 네 가지 범위

1. **반드시 지금:** Shell, 프로세스, 포트, SocketCAN/`vcan`, `can-utils`, ECU/Gateway/IDS 의미, Spoofing과 Replay 증거를 익힌다.
2. **플랫폼을 수정하려면:** Python, FastAPI, WebSocket, React/TypeScript, Three.js/R3F, GLB, 테스트, 로그, Docker를 익힌다.
3. **나중에 확장:** ISO-TP/UDS, DoIP, SOME/IP, keyless/RF-to-CAN 모델을 배운다.
4. **1-day 분석:** 공개된 정확한 버전의 취약 소프트웨어를 격리해 ASan/GDB로 재현하고, 크래시·취약점·악용 가능성을 분리해 판단한다.

권장 순서는 다음과 같다.

```text
PowerShell/WSL/Linux Shell
  → process·port·HTTP 기초
  → SocketCAN/vcan
  → candump/cansend/canplayer
  → ECU·Gateway·Body message contract
  → Spoofing·Replay·DoS·IDS·freshness
  → CANLite 실행 및 증거 수집
  → Python/FastAPI/WebSocket
  → React/TypeScript/R3F/GLB
  → pytest/Vitest/browser/Docker
  → ISO-TP/UDS → DoIP/SOME/IP
  → 공개 1-day의 ASan/GDB 분석
```

---

## 0. 안전 경계와 현재 플랫폼의 정체

CANLite에서 실행하는 명령은 **교육용 whitelist를 적용한 in-memory virtual terminal**의 입력이다. Windows PowerShell이나 WSL의 실제 Shell이 아니며, 현재 Replay 성공은 특정 OEM이나 실제 차량 취약점을 입증하지 않는다.

실습은 아래 환경에서만 수행한다.

- 본인이 소유한 PC의 `localhost`
- Docker 컨테이너나 로컬 가상머신
- Linux `vcan` 같은 가상 CAN 인터페이스
- 프로젝트가 제공하는 Toy ECU/Toy IDS
- 공개 CTF 또는 명시적으로 허가된 교육 장비

실제 차량, 공도 차량, 타인의 장비, 허가받지 않은 CAN 네트워크에서는 캡처·주입·재생하지 않는다.

### CANLite의 실제 학습 데이터 흐름

```text
학습자 명령
  → FastAPI whitelist parser
  → Toy IDS / Toy Gateway / Toy ECU 판정
  → authoritative educational flow trace
  → WebSocket monitor event
  → React state
  → GLB 차량 효과
```

여기서 3D 하이라이트와 문 애니메이션은 **서버가 판정한 Toy 상태의 시각화**다. 물리 CAN wire telemetry나 실제 actuator의 증거가 아니다.

`vcan`은 실제 CAN controller 없이 프레임 송수신을 연습하는 virtual local CAN interface다. 물리 계층의 전압, termination, 정확한 arbitration timing, ACK, error counter, bus-off를 그대로 재현하지 않는다. Linux 공식 문서는 `vcan`을 실제 controller hardware 없이 프레임을 송수신하는 가상 인터페이스로 설명한다: [Linux SocketCAN](https://docs.kernel.org/networking/can.html#the-virtual-can-driver-vcan).

---

# 반드시 지금 배울 것

## 1. PowerShell·WSL·Linux Shell 구분

### 핵심 정의

- **PowerShell:** Windows 프로세스와 파일을 다루는 Shell. `PS>` 프롬프트에서 실행한다.
- **WSL:** Windows 안에서 Linux 사용자 공간과 커널 환경을 제공한다.
- **Bash:** 주로 WSL/Linux에서 쓰는 Shell. `$` 프롬프트에서 실행한다.
- **CANLite Virtual terminal:** 몇 개의 허용된 교육 명령만 해석하는 Toy 입력창이다.

같은 모양의 명령이라도 실행 환경이 다르면 경로, 권한, 프로세스, 네트워크 인터페이스가 다르다.

### 목표

현재 작업 디렉터리, 파일, 표준입출력, 종료 코드, 프로세스가 무엇인지 설명한다.

### 직접 실습

PowerShell:

```powershell
Get-Location
Get-ChildItem
Set-Location .\work\whysocscs-CAN-replay-lab
Test-Path .\README.md
Get-Content .\README.md -TotalCount 10
$LASTEXITCODE
Get-Process python, node -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8010,8447 -ErrorAction SilentlyContinue
```

WSL/Bash:

```bash
pwd
ls -la
cd /tmp
mkdir -p canlite-shell-practice
printf 'CANLite\n' > canlite-shell-practice/note.txt
cat canlite-shell-practice/note.txt
echo $?
ps aux | head
ss -lntp
```

반드시 이해할 기호:

- `>`: 표준출력(stdout)을 새 파일로 저장한다. 기존 파일을 덮어쓸 수 있다.
- `>>`: 표준출력을 파일 끝에 추가한다.
- `|`: 앞 명령의 출력을 뒤 명령의 입력으로 연결한다.
- `2>`: 표준오류(stderr)를 저장한다.
- 종료 코드 `0`: 일반적으로 성공. 0 이외 값은 실패 또는 별도 상태다.
- PowerShell의 `&`: 문자열 또는 경로로 지정한 실행 파일을 호출하는 call operator다.

### 관찰할 증거

- PowerShell과 WSL의 경로 표기가 다르다.
- `cat`으로 출력한 내용과 파일 내용이 일치한다.
- 정상 명령 뒤 종료 코드는 `0`이고, 존재하지 않는 파일을 읽으면 오류와 다른 종료 상태가 나타난다.

### 완료 기준

명령을 보기 전에 “어느 Shell에서 실행하는지”, “어떤 파일 또는 프로세스가 바뀌는지”, “성공 여부를 무엇으로 확인하는지”를 말할 수 있다.

### 흔한 오해

- CANLite Virtual terminal에서 `ls`가 된다고 실제 컨테이너 Shell 권한을 얻은 것은 아니다.
- Docker 컨테이너는 가상머신(VM)과 동일하지 않다.
- 서버 창에 로그가 보인다는 것과 서버가 올바른 포트에서 응답한다는 것은 별도다.

### 스스로 답할 질문

`candump ... > capture.log`에서 화면에 프레임이 안 보이는 것이 왜 정상일 수 있는가?

공식 참고: [Microsoft WSL 기본 명령](https://learn.microsoft.com/en-us/windows/wsl/basic-commands), [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html).

## 2. 프로세스·포트·HTTP/WebSocket 기초

### 목표

FastAPI와 Vite가 서로 다른 프로세스·포트로 실행되며 브라우저가 두 서비스와 통신한다는 것을 설명한다.

### 선수지식

IP 주소, `127.0.0.1`, TCP port, client/server, HTTP request/response의 뜻.

### 직접 실습

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
Get-NetTCPConnection -LocalPort 8010,8447 -State Listen
```

WSL/Bash에서 서버 접근을 확인할 때:

```bash
curl -i http://127.0.0.1:8010/health
ss -lntp | grep -E '8010|8447'
```

WSL2의 네트워크 방식은 설정에 따라 NAT 또는 mirrored mode일 수 있다. Windows와 WSL 사이 연결이 안 되면 무조건 코드를 고치지 말고 먼저 어느 쪽에서 서버를 띄웠고 어느 주소에 bind했는지 확인한다. [Microsoft WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking).

### 관찰할 증거

- `/health`의 HTTP 성공 응답
- `8010`과 `8447`을 LISTEN하는 프로세스
- 브라우저 Network/Console에서 REST와 WebSocket의 연결 상태

### 완료 기준

“웹 화면은 열리지만 실습이 안 됨”을 frontend, backend, CORS/origin, WebSocket, Toy domain 중 어느 층부터 확인할지 순서대로 말할 수 있다.

### 스스로 답할 질문

`127.0.0.1:8447`과 `127.0.0.1:8010`은 각각 누구이며, 브라우저는 왜 둘 다 필요로 하는가?

## 3. SocketCAN과 `vcan`

### 핵심 정의

SocketCAN은 Linux 네트워크 스택과 socket API를 통해 CAN을 다루는 인터페이스다. CAN은 Ethernet처럼 MAC 목적지 주소를 갖는 방식이 아니라 broadcast medium이며, CAN ID는 arbitration과 message 의미에 사용된다. ID만으로 실제 송신 ECU가 인증되지는 않는다. [Linux SocketCAN 개요](https://docs.kernel.org/networking/can.html).

### 목표

가상 CAN 인터페이스를 생성하고 상태를 확인하며 두 프로세스가 같은 버스에서 프레임을 주고받는 것을 관찰한다.

### 직접 실습

아래 명령은 **WSL/Linux/Ubuntu VM**에서 실행한다.

```bash
uname -r
modinfo vcan
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set dev vcan0 up
ip -details -statistics link show vcan0
```

정리할 때:

```bash
sudo ip link del dev vcan0
```

WSL 커널에서 `vcan` module이 제공되는지는 WSL 및 커널 설정에 따라 달라질 수 있다. `modinfo vcan` 또는 `sudo modprobe vcan`이 실패하면 오류 원문과 `uname -r`을 기록한다. 지원되지 않는 커널을 억지로 가정하지 말고, `vcan`을 지원하는 Ubuntu VM이나 Docker/Linux 환경을 선택한다.

### 관찰할 증거

- `ip link show vcan0`에 인터페이스와 `UP` 상태가 보인다.
- 잘못된 인터페이스 이름을 주면 명확한 오류가 발생한다.
- 두 터미널에서 송신과 수신을 독립적으로 수행할 수 있다.

### 완료 기준

`vcan0`이 “CAN 시뮬레이터 전체”가 아니라 Linux가 제공하는 virtual CAN network interface임을 설명하고, 물리 계층에서 재현하지 못하는 항목을 세 가지 이상 말할 수 있다.

### 스스로 답할 질문

`vcan`에서 프레임 전송이 성공했다는 사실로 실제 버스의 ACK와 bus-off 동작까지 검증했다고 할 수 없는 이유는 무엇인가?

## 4. `can-utils`: 관찰·송신·기록·재생

공식 `can-utils` 저장소는 `candump`를 표시·필터·로그, `cansend`를 단일 프레임 송신, `canplayer`를 로그 재생 도구로 분류한다: [linux-can/can-utils](https://github.com/linux-can/can-utils).

### 목표

명령 문자열을 암기하는 것이 아니라 각 명령의 입력, 출력, 부작용, 검증 증거를 구분한다.

### 직접 실습

Ubuntu/WSL/VM:

```bash
sudo apt update
sudo apt install can-utils
```

터미널 A:

```bash
candump -L vcan0
```

터미널 B:

```bash
cansend vcan0 123#11223344
```

캡처 파일 만들기:

```bash
candump -L vcan0 > capture.log
```

다른 터미널에서 격리된 `vcan0`에 프레임 하나를 보낸 뒤 캡처를 종료하고 확인한다.

```bash
cat capture.log
wc -l capture.log
```

기록을 가상 버스에 재생한다.

```bash
canplayer -I capture.log -l 1
```

### 명령 해석

- `candump`: 현재 이후 관찰되는 프레임을 읽는다.
- `-L`: `canplayer`가 읽을 수 있는 log format으로 timestamp를 포함해 출력한다.
- `vcan0`: 어느 interface를 관찰·송신할지 지정한다.
- `123#11223344`: CAN ID `0x123`, payload `11 22 33 44`를 뜻한다.
- `-I capture.log`: 입력 파일을 지정한다.
- `-l 1`: 해당 로그를 한 번 재생한다.

### 관찰할 증거

- 송신 전후 `candump`의 timestamp, CAN ID, payload
- `capture.log`에 저장된 원본과 재생 때 관찰한 프레임의 ID·길이·byte
- 기록 시각과 재생 시각의 차이

### 완료 기준

직접 만든 임의의 가상 프레임을 캡처하고 재생한 뒤, 원본과 재생본이 byte-identical인지 표로 비교할 수 있다.

### 흔한 오해

- 예제 payload를 새로 작성해 보내는 행위는 injection/spoofing일 수 있지만, “과거에 캡처한 동일 프레임을 다시 사용했다”는 증거가 없으면 Replay라고 부르기 어렵다.
- `candump`에 보였다는 사실은 ECU가 명령을 실행했다는 뜻이 아니다.
- ID가 같다는 사실은 같은 ECU가 보냈다는 인증이 아니다.

### 스스로 답할 질문

Replay를 입증하려면 캡처와 재생 사이에서 무엇이 같아야 하고, 무엇은 달라질 수 있는가?

## 5. ECU·Gateway·message contract·상태 머신

### 목표

raw frame을 차량 기능과 연결하려면 프로젝트가 명시한 message contract와 state transition이 필요함을 이해한다.

### 선수지식

- byte, bit mask, hexadecimal
- endianness
- signed/unsigned integer
- scale, offset, range
- enum과 state machine

### 직접 실습

본인이 만든 Toy 규격으로 아래 표를 작성한다. 실제 OEM 규격처럼 표현하지 않는다.

| 항목 | 예시 질문 |
|---|---|
| CAN ID | 어떤 message family인가? |
| DLC/length | payload는 몇 byte여야 하는가? |
| byte/bit | 어느 bit가 어떤 signal인가? |
| byte order | little-endian인가 big-endian인가? |
| valid values | 허용·거부 값은 무엇인가? |
| producer | 설계상 어느 ECU가 보내기로 했는가? |
| consumer | 어느 ECU가 해석하는가? |
| precondition | 속도, ignition, session 같은 조건이 있는가? |
| state transition | locked→unlocked와 closed→open을 어떻게 구분하는가? |

간단한 Python decoder를 직접 작성한다.

```python
def decode_toy_door(payload: bytes) -> str:
    if len(payload) != 2:
        raise ValueError("INVALID_LENGTH")
    if payload == bytes.fromhex("0001"):
        return "UNLOCK_REQUEST"
    raise ValueError("INVALID_PAYLOAD")
```

### 관찰할 증거

- 정상 길이·정상 값의 결과
- 짧은 payload, 긴 payload, 미정의 값의 거부
- 거부된 입력에서 차량 상태가 변하지 않음

### 완료 기준

“CAN ID를 봤다”와 “payload 의미를 검증했다”, “ECU가 상태를 바꿨다”를 서로 다른 사건으로 설명할 수 있다.

### 흔한 오해

- `unlock`과 물리적인 `door open`은 보통 같은 상태가 아니다.
- DBC 또는 Toy contract 없이 임의 byte의 의미를 확정하면 안 된다.
- CAN ID는 Ethernet destination address도, 암호학적으로 인증된 sender identity도 아니다.

### 스스로 답할 질문

문이 열렸다는 3D 화면만으로 Gateway와 Body ECU가 올바르게 동작했다고 입증할 수 없는 이유는 무엇인가?

## 6. 위협 모델과 공격 유형

실습을 만들기 전에 다음을 한 장으로 작성한다.

- 보호할 자산(asset)
- 보호 목표: confidentiality, integrity, availability 중 무엇인가?
- 공격자 위치와 초기 권한
- 공격자가 통제 가능한 입력
- 신뢰 경계(trust boundary)
- 전제조건
- 성공 조건과 실패 조건
- 관찰·탐지 지점
- 완화 방법
- 실습이 입증하지 않는 것

### 6.1 Spoofing

**정의:** 공격자가 신뢰받는 message identity 또는 예상 형식을 흉내 낸 프레임을 주입해 수신자가 잘못된 출처·상태로 해석하게 하는 것.

**실습 증거:** 공격자 위치, 주입한 raw frame, Gateway/ECU 판정, 정상 송신자와 구분하지 못한 이유, 상태 전이.

**완료 기준:** “CAN ID가 같아서 spoofing”이라고 끝내지 않고, 어떤 신뢰 가정이 깨졌는지 설명한다.

### 6.2 Replay

**정의:** 과거에 유효했던 message를 캡처해, 나중에 원래 byte를 그대로 또는 프로토콜이 허용하는 형태로 재전송하여 다시 수락시키는 것.

**실습 증거:** capture provenance, 원본과 재생본의 ID·DLC·DATA 비교, 시간 차이, freshness 검사 유무, ECU verdict.

**완료 기준:** 새 payload를 추측해 보낸 injection과 캡처 기반 Replay를 구분한다.

### 6.3 DoS

**정의:** 버스·Gateway·ECU·애플리케이션의 가용성(availability)을 저하시켜 정상 message 처리를 방해하는 것.

**실습 증거:** 정상 기준선, 입력률, latency/drop 변화, queue/CPU 상태, 정상 복구 여부.

**주의:** `vcan` 트래픽 폭주는 실제 CAN arbitration, error counter, bus-off를 증명하지 않는다. 실제 물리 버스 영향처럼 표현하지 않는다.

### 6.4 IDS와 prevention

IDS(Intrusion Detection System)는 기본적으로 관찰하고 경보를 만든다. Inline gateway/IPS처럼 실제 forwarding을 차단하려면 별도 enforcement 경로와 로그가 필요하다.

**완료 기준:** `OBSERVED`, `ALERTED`, `DROPPED`, `ACCEPTED`, `EXECUTED`, `EFFECT APPLIED`를 하나의 성공 상태로 뭉치지 않고 구분한다.

### 6.5 Freshness와 인증

Replay 완화 후보에는 monotonic counter, nonce/challenge, timestamp/window, authenticated message/MAC가 있다. 단순 counter만 추가하면 wrap-around, reset, desynchronization, state storage 문제를 검토해야 한다. ID allowlist만으로는 같은 ID를 재생하는 공격을 인증하지 못한다.

### 스스로 답할 질문

IDS가 Replay를 경보했다고 해서 Body ECU 명령이 자동으로 차단됐다고 말할 수 없는 이유는 무엇인가?

---

# 현재 CANLite 실습을 직접 실행하고 설명하기

## 7. 로컬 서버 실행

Docker daemon이 실행 중이면 프로젝트 root의 PowerShell에서:

```powershell
docker compose up --build
```

직접 실행할 때 backend용 PowerShell:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r server\requirements.txt -r server\requirements-dev.txt
$env:CANLITE_CAN_MODE = "loopback"
$env:CANLITE_ENABLE_REAL_TERMINAL = "false"
& .\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8010
```

별도 frontend용 PowerShell:

```powershell
$env:COREPACK_ENABLE_PROJECT_SPEC = "0"
corepack pnpm@10.34.3 install --frozen-lockfile
corepack pnpm@10.34.3 dev:ver4
```

브라우저에서 `http://127.0.0.1:8447`을 연다. 이 프로젝트에서 `dev:ver4`를 쓰는 이유는 backend origin allowlist와 맞는 포트로 실행하기 위해서다.

### 관찰할 증거

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health
Get-NetTCPConnection -LocalPort 8010,8447 -State Listen
```

### 완료 기준

backend, frontend, 브라우저를 각각 종료·재시작하고, 어느 로그가 어느 프로세스에서 나온 것인지 구분할 수 있다.

### 스스로 답할 질문

브라우저 화면만 열리고 Network monitor가 갱신되지 않을 때 첫 세 가지 확인 지점은 무엇인가?

## 8. Guided Replay 실습

### 목표

캡처 증거, 원본 확인, 재전송, Toy IDS/Gateway/ECU 판정, 마지막 GLB 효과를 순서대로 연결한다.

### 직접 실습

1. `공격 실습 → Replay`에서 **초보자용(Guided)**을 선택한다.
2. 공격 스크립트에 먼저 `canplayer -I capture.log -l 1`을 실행해 `CAPTURE_REQUIRED`가 발생하는 negative route를 확인한다.
3. 실습을 초기화한다.
4. Virtual terminal에 다음을 입력한다.

```text
candump -L vcan0 > capture.log
```

5. `한 단계 진행`으로 `Lab Terminal → Training OBD-II → CAN Monitor`를 끝까지 확인한다.
6. Virtual terminal에 다음을 입력한다.

```text
cat capture.log
```

7. Binary inspector와 monitor에서 capture의 ID·DLC·DATA를 기록한다.
8. 실행 전 예상에 “어디에서 수락/거부되고 차량 효과가 언제 적용될지”를 먼저 적는다.
9. Restricted lab script에 다음을 입력한다.

```text
canplayer -I capture.log -l 1
```

10. 한 번 클릭할 때 한 node만 진행되는지 확인한다.

```text
Lab Terminal
  → Training OBD-II
  → Toy IDS
  → Toy Gateway
  → Toy Body ECU
  → Left Door Effect
```

11. 마지막 node 전에는 GLB effect가 적용되지 않고, 마지막 node에서만 `EFFECT APPLIED`가 되는지 확인한다.
12. 캡처와 재생의 ID·DLC·DATA, Toy IDS, Toy ECU verdict, 차량 효과, Toy 환경의 한계를 자기 말로 기록한다.

### 관찰할 증거

- capture 전 재생: `CAPTURE_REQUIRED`
- capture: `CAPTURED`
- 원본 확인: `OBSERVED`
- 재생 제출: `EXECUTED`
- Toy IDS: 이 시나리오의 실제 runtime verdict
- Toy ECU: `ACCEPTED/EXECUTED` 또는 거부 이유
- 최종 node: `Left Door Effect · EFFECT APPLIED`
- capture와 replay의 byte-identical 비교

### 완료 기준

명령 세 줄을 보지 않고 다시 입력하는 것만으로는 부족하다. 다음 문장을 직접 완성해야 한다.

> 나는 ______ 위치에서 ______를 캡처했고, 원본과 재생본의 ______가 일치했다. Toy IDS는 ______했고, Toy Gateway/Body ECU는 ______했다. freshness protection이 ______했기 때문에 재생이 수락됐다. GLB는 ______의 시각화이며 실제 차량 ______를 입증하지 않는다.

### 흔한 오해

- backend가 기술 결과를 먼저 계산해도 Guided 화면의 effect는 마지막 node에서 적용되어야 한다.
- `NORMAL`은 “차량 전체가 안전함”이 아니라 해당 Toy rule에서 경보가 없었다는 뜻이다.
- 문 3D 효과는 실제 문 잠금장치가 움직였다는 증거가 아니다.

### 스스로 답할 질문

왜 capture 없이 `canplayer`만 실행했을 때 실패하는 것이 중요한 학습 증거인가?

## 9. Spoofing·전체 공격 체인으로 반복

Replay를 설명할 수 있게 된 뒤 동일한 분석 틀을 Spoofing과 전체 공격 체인에 적용한다.

### 목표

정답 frame을 복사하는 대신 정상 기준선, 공격 입력, stop node, ECU verdict, effect를 비교한다.

### 직접 실습

각 페이지에서 다음 표를 먼저 빈칸으로 작성하고, 명령 실행 후 실제 결과로 채운다.

| 항목 | 실행 전 예상 | 실행 후 관찰 |
|---|---|---|
| 입력 위치 |  |  |
| raw CAN ID/DLC/DATA |  |  |
| IDS 관찰·경보 |  |  |
| Gateway 전달·차단 |  |  |
| ECU 판정 |  |  |
| GLB effect |  |  |
| 입증한 것 |  |  |
| 입증하지 못한 것 |  |  |

정답 포함 명령은 학습자 문서와 분리된 교사용 문서에서만 확인한다.

- 학습자용: [Black-box CAN Door Attack 실습 가이드](../labs/blackbox-can-door-attack.md)
- 학습자용: [CAN Spoofing·Replay 기초 실습 가이드](../labs/can-spoofing-replay-basics.md)
- **교사용/정답 포함:** [CAN 공격 실습 빠른 통과표](../instructors/can-attack-lab-quick-pass.md)
- **교사용/정답 포함:** [CAN Attack Lab 검증 가이드](../instructors/can-attack-lab-validation.md)

### 완료 기준

Replay와 Spoofing을 “둘 다 프레임을 보낸다” 수준이 아니라 입력의 provenance와 깨진 신뢰 가정으로 구분한다.

### 스스로 답할 질문

동일한 raw frame이 상황에 따라 정상 명령, spoofed injection, replay 중 하나가 될 수 있는 이유는 무엇인가?

---

# 플랫폼을 수정하려면 배울 것

## 10. Python: byte decoder와 상태 머신

### 목표

사용자 문자열을 검증된 frame object로 바꾸고, 순수 함수로 ECU 판정을 계산한다.

### 배울 항목

- `bytes`, `bytearray`, `bytes.fromhex()`, `.hex()`
- dataclass/Pydantic model
- exception과 명시적 error code
- enum, immutable input, state transition
- logging과 correlation/attempt ID
- unit test에서 정상·경계·실패 입력 분리

### 직접 실습

Toy decoder에 아래 테스트를 먼저 작성한다.

1. 정상 ID·정상 길이·정상 payload는 의도한 semantic을 반환한다.
2. 표준 ID 범위를 벗어나면 거부한다.
3. 홀수 개 hex, non-hex, 잘못된 byte 길이를 거부한다.
4. 미정의 payload에서 차량 state는 유지된다.
5. 같은 입력과 같은 초기 state는 같은 verdict를 만든다.

### 관찰할 증거

pytest의 pass/fail, exception type, state before/after, 구조화 로그.

### 완료 기준

UI 없이 pure domain test만으로 Toy ECU의 수락·거부를 증명할 수 있다.

### 스스로 답할 질문

Pydantic 입력 검증과 ECU business rule 검증은 왜 별도 계층이어야 하는가?

공식 참고: [Python `bytes`](https://docs.python.org/3/library/stdtypes.html#bytes-objects), [Python logging](https://docs.python.org/3/howto/logging.html), [pytest](https://docs.pytest.org/en/stable/getting-started.html).

## 11. `asyncio`, FastAPI, REST, WebSocket

### 목표

명령 request, domain decision, live event broadcast의 시점과 실패 모드를 추적한다.

### 배울 항목

- coroutine, `async`/`await`, task, cancellation, timeout
- HTTP method/status/body
- FastAPI dependency와 Pydantic schema
- WebSocket connect/message/disconnect/reconnect
- CORS와 WebSocket origin
- authoritative server state와 client snapshot

### 직접 실습

1. `/health` REST 요청의 status/body를 기록한다.
2. 브라우저 Network에서 공격 실행 request와 response를 찾는다.
3. WebSocket event의 attempt ID와 REST response의 attempt ID를 비교한다.
4. backend를 종료했을 때 UI가 success가 아니라 disconnected/unknown을 표시하는지 확인한다.
5. 재접속 snapshot이 새 공격 실행처럼 채점되지 않는지 확인한다.

### 관찰할 증거

HTTP status, JSON schema, WebSocket frame, timestamp, correlation ID, disconnect log.

### 완료 기준

“버튼을 눌렀다”부터 “GLB가 변했다”까지 어떤 data가 어느 함수와 네트워크 경계를 지나는지 그릴 수 있다.

### 흔한 오해

- WebSocket을 쓴다고 인증(authentication)과 인가(authorization)가 생기지 않는다.
- 연결 성공은 CAN bus 정상이나 ECU 실행 성공과 동일하지 않다.

### 스스로 답할 질문

REST response와 WebSocket event의 순서가 바뀌어도 같은 attempt를 안전하게 연결하려면 무엇이 필요한가?

공식 참고: [Python asyncio](https://docs.python.org/3/library/asyncio-task.html), [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/).

## 12. TypeScript·React 상태 관리

### 목표

backend event를 runtime validation한 뒤 화면 상태로 만들고, 오래된 event나 중복 event가 잘못된 effect를 적용하지 않게 한다.

### 배울 항목

- TypeScript union/narrowing/generic
- runtime schema validation
- React component, props, hook, effect, cleanup
- reducer/state machine
- stale closure, duplicate subscription, race condition
- loading/error/empty/disconnected state

### 직접 실습

1. unknown JSON을 바로 type assertion하지 않고 validator를 통과시킨다.
2. 잘못된 trace node가 들어오면 GLB state가 변하지 않는 테스트를 작성한다.
3. 같은 event를 두 번 받아도 effect가 두 번 누적되지 않는지 확인한다.
4. component unmount 후 WebSocket listener가 제거되는지 확인한다.

### 관찰할 증거

Vitest assertion, React test DOM, console error 0건, listener count 또는 cleanup 증거.

### 완료 기준

TypeScript compile 성공과 runtime input 안전성이 다른 이유를 설명하고 실패 event용 테스트를 작성할 수 있다.

### 스스로 답할 질문

`as VehicleEvent`라고 쓰는 것이 외부 JSON을 실제로 검증하지 못하는 이유는 무엇인가?

공식 참고: [TypeScript Handbook](https://www.typescriptlang.org/docs/), [React with TypeScript](https://react.dev/learn/typescript).

## 13. Three.js·React Three Fiber·GLB

### 목표

GLB scene graph의 node를 안정적으로 식별하고, 확정된 ECU state만 시각 효과로 적용한다.

### 배울 항목

- scene, camera, light, mesh, material, transform
- glTF/GLB scene graph와 node naming
- React Three Fiber component/hook
- model loading/error/fallback
- mesh highlight와 actual part transform 분리
- animation lifecycle과 frame-rate independence

### 직접 실습

1. GLB node 이름을 목록으로 출력하고 문 mesh 후보를 기록한다.
2. 존재하지 않는 node 이름을 주면 명시적 fallback이 보이는 테스트를 만든다.
3. Guided의 각 node에서 active highlight가 하나만 강하게 보이는지 확인한다.
4. final effect 전 door transform이 변하지 않는지 확인한다.
5. 같은 실습을 여러 번 reset해 model이 떨리거나 transform이 누적되지 않는지 확인한다.

### 관찰할 증거

scene node 목록, before/after transform, screenshot, animation state, browser console.

### 완료 기준

“차량이 움직였다”가 아니라 어떤 authoritative event가 어떤 node/transform을 변경했는지 추적할 수 있다.

### 스스로 답할 질문

WebSocket frame을 받자마자 GLB를 직접 바꾸는 대신 domain state와 staged trace를 거치는 이유는 무엇인가?

공식 참고: [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [React Three Fiber 첫 scene](https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/your-first-scene.mdx).

## 14. 테스트·로그·장애 분석

### 목표

성공 화면이 아니라 독립적인 테스트와 로그로 기능을 검증한다.

### 테스트 피라미드

1. **Pure domain:** frame parse, ECU rule, state transition
2. **API integration:** request/response, session, reset, WebSocket event
3. **Component:** timeline, monitor, binary inspector, learning check
4. **Browser E2E:** 실제 클릭·입력·GLB endpoint
5. **Manual visual QA:** highlight, text overlap, narrow viewport, model jitter

### 직접 실습

PowerShell, 프로젝트 root:

```powershell
& .\.venv\Scripts\python.exe -m pytest server\tests -q
& .\.venv\Scripts\python.exe -m compileall -q server

$env:COREPACK_ENABLE_PROJECT_SPEC = "0"
corepack pnpm@10.34.3 test
corepack pnpm@10.34.3 typecheck
corepack pnpm@10.34.3 build

docker compose config --quiet
```

병렬 Vitest가 제한된 I/O 환경에서 timeout나면 실패를 숨기지 않는다. 해당 테스트를 단독 재현하고, source 변경 없이 `corepack pnpm@10.34.3 exec vitest run --maxWorkers=1`로 직렬 실행해 contention인지 실제 결함인지 분리한다.

### 관찰할 증거

- 실행한 정확한 명령과 exit code
- test count와 실패 test 이름
- 예상 결과와 실제 결과
- backend log의 attempt/session/generation
- browser console error/warning
- 동일 실패의 최소 재현

### 완료 기준

테스트가 실패했을 때 즉시 코드를 바꾸지 않고 재현 → 증거 → root cause 가설 → 최소 수정 → 회귀 테스트 순서로 처리한다.

### 스스로 답할 질문

전체 병렬 suite에서 timeout난 테스트가 단독·직렬 실행에서 통과했다면 무엇을 입증했고 무엇은 아직 입증하지 못했는가?

공식 참고: [Vitest](https://vitest.dev/guide/), [Playwright test 실행](https://playwright.dev/docs/running-tests).

## 15. Docker와 격리

### 목표

frontend/backend의 재현 가능한 실행 환경을 만들되, 컨테이너 실행이 곧 보안 경계 완성은 아님을 이해한다.

### 배울 항목

- image, container, volume, network, port mapping
- build context와 layer cache
- environment variable과 secret 구분
- non-root user, read-only filesystem, capability
- healthcheck와 dependency readiness
- VM과 container의 isolation 차이

### 직접 실습

```powershell
docker compose config --quiet
docker compose up --build
docker compose ps
docker compose logs --tail 100 backend
docker compose logs --tail 100 frontend
```

### 관찰할 증거

Compose가 해석한 최종 설정, image build result, container state, port mapping, healthcheck, startup log.

### 완료 기준

Docker daemon 미실행, image build 실패, container exit, healthcheck 실패, 애플리케이션 오류를 구분할 수 있다.

### 흔한 오해

- `docker compose config` 성공은 컨테이너가 실제로 시작됐다는 뜻이 아니다.
- Docker는 VM과 동일하지 않으며 privileged container는 위험 범위를 키운다.
- 실습 terminal을 실제 host Shell에 연결하는 것은 별도의 고위험 기능이다.

### 스스로 답할 질문

현재 CANLite가 `CANLITE_ENABLE_REAL_TERMINAL=false`를 기본으로 유지해야 하는 이유는 무엇인가?

공식 참고: [Docker Engine security](https://docs.docker.com/engine/security/), [Docker rootless mode](https://docs.docker.com/engine/security/rootless/).

---

# 나중에 확장할 자동차 통신

## 16. ISO-TP와 UDS

### 진입 기준

raw CAN capture/replay, byte/length 검증, Gateway/ECU state, 테스트를 스스로 설명할 수 있을 때 시작한다.

### 목표

8 byte를 넘는 진단 payload가 ISO-TP의 Single/First/Consecutive/Flow Control frame으로 전달되고, 그 위에서 UDS service가 동작함을 이해한다.

### 배울 항목

- ISO-TP: SF, FF, CF, FC, sequence number, block size, STmin, timeout
- addressing: physical/functional, normal/extended/mixed
- UDS: tester/client와 ECU/server, session, DID, DTC, RoutineControl, SecurityAccess의 목적
- positive/negative response와 NRC
- session/security precondition과 timeout

Linux 공식 문서는 ISO-TP를 CAN 위의 진단용 transport protocol이며 UDSonCAN에 널리 사용된다고 설명한다: [Linux ISO-TP](https://docs.kernel.org/networking/iso15765-2.html). UDS의 공식 범위는 [ISO 14229-1](https://www.iso.org/standard/87962.html)에서 확인한다.

### 직접 실습

Toy UDS ECU 두 개를 `vcan`에 두고, multi-frame request를 캡처해 PCI nibble, length, sequence를 표로 복원한다. 처음에는 read-only Toy DID만 사용한다.

### 관찰할 증거

raw CAN frame sequence, 재조립한 PDU, request/response correlation, timeout·sequence error.

### 완료 기준

raw frame 하나의 CAN ID와 UDS service ID를 혼동하지 않고, 어느 계층이 무엇을 책임지는지 그릴 수 있다.

### 스스로 답할 질문

UDS request가 20 byte라면 Classical CAN frame 하나만 보고 전체 요청을 해석할 수 없는 이유는 무엇인가?

## 17. DoIP와 SOME/IP

### 진입 기준

TCP/UDP, IP address/port, packet capture, ISO-TP/UDS 계층을 설명할 수 있어야 한다.

### 목표

- DoIP: IP 기반 진단 transport와 UDS payload의 관계를 이해한다.
- SOME/IP: service-oriented communication의 message, service discovery, event/request-response를 이해한다.

### 직접 실습

localhost 또는 격리된 Docker network에서 Toy client/server를 구성하고 Wireshark/tcpdump로 request, response, reconnect, malformed length를 관찰한다. 실제 차량 IP망에는 연결하지 않는다.

### 관찰할 증거

5-tuple, protocol header, length, request/response ID, routing activation 또는 service discovery 상태, application verdict.

### 완료 기준

“자동차 Ethernet 공격”이라고 뭉뚱그리지 않고 DoIP와 SOME/IP의 목적과 신뢰 경계를 구분한다.

### 스스로 답할 질문

DoIP를 사용한다는 사실만으로 UDS authorization이 자동으로 해결되지 않는 이유는 무엇인가?

공식 참고: [ISO 13400-2 DoIP](https://www.iso.org/standard/13400-2), [AUTOSAR SOME/IP Protocol](https://www.autosar.org/fileadmin/standards/R25-11/FO/AUTOSAR_FO_PRS_SOMEIPProtocol.pdf), [AUTOSAR SOME/IP Service Discovery](https://www.autosar.org/fileadmin/standards/R25-11/FO/AUTOSAR_FO_PRS_SOMEIPServiceDiscoveryProtocol.pdf).

## 18. Toy keyless/RF-to-CAN 실습

### 진입 기준

CAN Replay, RF Replay, relay attack을 서로 다른 공격으로 설명할 수 있어야 한다.

### 목표

```text
Toy RF message
  → receiver/authentication decision
  → Gateway request
  → Body ECU lock state
  → optional simulated handle action
  → GLB door effect
```

### 직접 실습 설계

1. 정상 fresh message는 허용한다.
2. 과거 message 재사용은 vulnerable mode에서 수락된다.
3. freshness-aware mode에서는 과거 message를 거부한다.
4. 방어 모드에서도 새 정상 message는 허용한다.
5. lock/unlock 상태와 물리 open/closed 효과를 분리한다.

### 관찰할 증거

RF-side provenance, authentication/freshness verdict, 생성된 내부 CAN request, Body ECU state, GLB effect.

### 완료 기준

임의 문자열 비교를 실제 rolling code 암호나 OEM keyless 취약점처럼 주장하지 않는다.

### 스스로 답할 질문

RF message의 Replay와 이미 차량 내부 CAN bus에서 캡처한 frame의 Replay는 공격자 위치가 어떻게 다른가?

---

# 공개 1-day 분석으로 확장하기

## 19. 1-day 선정 기준

다음 조건을 모두 만족하는 공개 대상을 고른다.

- 정확한 repository와 license
- vulnerable commit/tag와 fixed commit/tag
- 공개 advisory, CVE/GHSA 또는 upstream patch
- 로컬 파일이나 localhost 입력으로 도달 가능한 parser
- 실제 차량·공도·외부 서비스 연결이 필요 없음
- sanitizer build가 가능하거나 명확한 crash evidence를 수집할 수 있음
- 수정 전후 비교와 정상 입력 regression test가 가능함

파일 parser 취약점은 차량 관련 형식을 처리하더라도 곧바로 remote vehicle attack을 의미하지 않는다. 실제 도달 경로가 별도로 입증돼야 한다.

## 20. ASan·GDB 기반 분석 절차

### 목표

크래시 재현, root cause, 보안 영향, exploitability를 분리해 보고한다.

### 직접 실습

1. 정확한 OS, compiler, architecture, commit을 기록한다.
2. 정상 입력의 baseline을 먼저 실행한다.
3. AddressSanitizer를 켠 debug build를 만든다.

```bash
cmake -S . -B build-asan \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_C_FLAGS='-fsanitize=address -fno-omit-frame-pointer -g' \
  -DCMAKE_CXX_FLAGS='-fsanitize=address -fno-omit-frame-pointer -g'
cmake --build build-asan -j
```

4. 공개된 최소 입력 또는 본인이 합법적으로 만든 입력으로 crash를 재현한다.
5. ASan report에서 error class, faulting access, allocation/free stack, first relevant source line을 기록한다.
6. GDB에서 실행 흐름을 확인한다.

```gdb
set pagination off
run <arguments>
bt
thread apply all bt
frame 0
info args
info locals
info registers
x/i $pc
list
up
down
```

7. 입력 byte가 parser의 length/index/pointer에 도달하는 data flow를 추적한다.
8. 입력을 줄여도 같은 root cause가 유지되는지 확인한다.
9. fixed version 또는 patch 적용 build에서 같은 입력이 안전하게 처리되는지 확인한다.
10. 정상 corpus regression test를 실행한다.

### 관찰할 증거

- 정확한 build command와 commit hash
- 정상 입력 결과
- ASan 원문 로그
- GDB backtrace/register/source context
- 입력에서 fault까지의 data flow
- 최소 재현 입력 hash
- vulnerable/fixed 비교
- 정상 입력 regression 결과

### 영향 분류

각 항목을 별도로 판단한다.

1. 단순 비정상 종료
2. Denial of Service
3. Out-of-bounds read
4. Information disclosure 가능성
5. Out-of-bounds write
6. Control-flow corruption
7. 권한 상승(Privilege escalation)
8. 임의 코드 실행(Arbitrary code execution)

ASan crash는 메모리 오류의 중요한 증거지만 곧바로 RCE 또는 exploit 완성을 의미하지 않는다. PoC는 결함을 재현·입증하는 최소 프로그램/입력이고, exploit은 보안 효과를 의도적으로 달성하는 추가 단계다. [Clang AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html), [GDB 공식 매뉴얼](https://sourceware.org/gdb/current/onlinedocs/gdb.html/).

### 완료 기준

다른 사람이 같은 commit과 명령으로 재현할 수 있고, 확인된 사실·가설·미확인 exploitability를 명확히 분리한 보고서를 작성한다.

### 스스로 답할 질문

ASan이 heap-buffer-overflow를 보고했다면 RCE를 주장하기 전에 어떤 추가 증거가 필요한가?

## 21. 1-day를 CANLite에 연결하는 방법

1-day 컨테이너와 Toy CAN engine을 직접 섞지 않는다. 다음 세 층으로 분리한다.

```text
분석 컨테이너
  ├─ vulnerable parser + fixed parser
  ├─ corpus/minimal input
  └─ ASan/GDB evidence

교육 API
  ├─ 실행 요청 validation
  ├─ timeout/resource limit
  ├─ stdout/stderr/exit status 구조화
  └─ attempt ID와 artifact 저장

CANLite UI
  ├─ 입력·binary view
  ├─ stack trace/source 위치
  ├─ expected vs actual
  └─ GLB는 입증된 차량 subsystem 맥락만 시각화
```

### 목표

실제 분석 증거와 교육용 자동차 맥락을 연결하되, GLB 애니메이션을 exploit evidence로 사용하지 않는다.

### 완료 기준

- vulnerable build에서 재현
- fixed build에서 미재현 또는 안전한 거부
- 정상 입력 회귀 통과
- timeout와 resource limit 검증
- 외부 네트워크와 실제 CAN 장치 접근 없음
- CVE/advisory가 말하는 영향 이상으로 과장하지 않음

### 스스로 답할 질문

parser crash 화면 옆에 차량 ECU를 하이라이트하려면 그 parser가 해당 ECU attack surface에 실제로 포함된다는 어떤 근거가 필요한가?

---

# 문제를 만났을 때의 공통 진단 순서

1. **정상 상태 정의:** 무엇이 보여야 성공인가?
2. **정확한 입력 기록:** command, frame, file, request body.
3. **가장 가까운 증거 확인:** exit code, stderr, HTTP status.
4. **계층 분리:** Shell → interface → tool → API → domain → event → React → GLB.
5. **correlation 확인:** session, generation, attempt ID, timestamp.
6. **최소 재현:** 불필요한 frame·click·component를 제거한다.
7. **가설 하나 세우기:** “아마”가 아니라 반증 가능한 문장으로 쓴다.
8. **실험 하나 수행:** 한 번에 변수 하나만 바꾼다.
9. **root cause 후 최소 수정:** 화면만 억지로 바꾸지 않는다.
10. **회귀 테스트:** 정상, 실패, reset, reconnect를 다시 확인한다.

## 현재 단계 체크리스트

아래가 모두 가능하면 현재 Replay 실습을 “스스로 할 수 있다”고 판단한다.

- [ ] PowerShell, WSL/Bash, CANLite Virtual terminal을 구분한다.
- [ ] `>`, stdout, stderr, exit code를 설명한다.
- [ ] `vcan0`을 만들고 상태를 확인할 수 있다. 지원되지 않으면 근거를 기록하고 VM 대안을 선택한다.
- [ ] `candump`, `cansend`, `canplayer`의 입력·출력·부작용을 설명한다.
- [ ] 캡처와 재생 frame의 ID·DLC·DATA를 비교한다.
- [ ] CAN ID가 인증된 sender가 아님을 설명한다.
- [ ] Replay와 Spoofing을 provenance와 신뢰 가정으로 구분한다.
- [ ] IDS의 관찰과 Gateway의 차단을 구분한다.
- [ ] Gateway verdict, ECU verdict, state transition, GLB effect를 구분한다.
- [ ] `CAPTURE_REQUIRED` negative route를 재현한다.
- [ ] Guided의 node를 한 번에 하나씩 진행해 final effect 시점을 확인한다.
- [ ] `vcan`과 Toy ECU 결과를 실제 차량 취약점으로 일반화하지 않는다.
- [ ] backend/frontend health와 port를 확인한다.
- [ ] pytest/Vitest/typecheck/build의 pass/fail을 증거로 남긴다.

## 학습 기록 템플릿

각 실습마다 아래 형식으로 한 페이지를 남긴다.

```text
목표:
환경/버전:
위협 모델:
실행 전 예상:
입력 명령/프레임:
관찰한 raw evidence:
Gateway/IDS/ECU 판정:
상태 변화/GLB 효과:
예상과 다른 점:
root cause 또는 남은 가설:
입증한 것:
입증하지 못한 것:
다시 재현하는 명령:
다음 실험:
```

## 가장 먼저 할 최소 과제

1. WSL 또는 Ubuntu VM에서 `vcan0` 지원 여부를 확인하고 결과를 저장한다.
2. 터미널 두 개로 임의 Toy frame 한 개를 `candump`/`cansend`한다.
3. 같은 frame을 파일로 저장하고 `canplayer`로 한 번 재생한다.
4. 원본과 재생본의 ID·length·data·timestamp를 비교한다.
5. CANLite Guided Replay를 다시 수행하고 여섯 node의 역할을 자기 말로 적는다.
6. 마지막으로 코드 없이 “왜 이 결과가 Replay이며, 왜 실제 차량 취약점 증거는 아닌지” 설명한다.

이 여섯 항목을 통과한 뒤에야 Python decoder 수정으로 넘어간다.

## 공식 자료 모음

- [Linux SocketCAN](https://docs.kernel.org/networking/can.html)
- [linux-can/can-utils](https://github.com/linux-can/can-utils)
- [Microsoft WSL 기본 명령](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)
- [Microsoft WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [Python asyncio](https://docs.python.org/3/library/asyncio-task.html)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [React TypeScript](https://react.dev/learn/typescript)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [pytest](https://docs.pytest.org/en/stable/getting-started.html)
- [Playwright](https://playwright.dev/docs/running-tests)
- [Docker security](https://docs.docker.com/engine/security/)
- [Linux ISO-TP](https://docs.kernel.org/networking/iso15765-2.html)
- [ISO 14229-1 UDS](https://www.iso.org/standard/87962.html)
- [ISO 13400-2 DoIP](https://www.iso.org/standard/13400-2)
- [AUTOSAR SOME/IP](https://www.autosar.org/fileadmin/standards/R25-11/FO/AUTOSAR_FO_PRS_SOMEIPProtocol.pdf)
- [Clang AddressSanitizer](https://clang.llvm.org/docs/AddressSanitizer.html)
- [GDB 공식 매뉴얼](https://sourceware.org/gdb/current/onlinedocs/gdb.html/)
