# CAN Spoofing·Replay 기초 실습 가이드

이 문서는 정답을 포함하지 않는 학습자용 가이드다. 격리된 로컬 Toy 환경에서만 사용하고, 실제 차량·공용 서버·소유권이 없는 장비에는 입력을 보내지 않는다.

## 한 문장 정의와 차이

- **Spoofing(송신자 사칭)**: 정상 송신자의 identity/ID를 사칭하면서 공격자가 새 payload를 구성해 보내는 행위다.
- **Replay(재전송)**: 앞서 캡처한 유효 message를 나중에 byte-identical(바이트 동일)하게 다시 사용하는 행위다.

| 구분 | Spoofing | Replay |
| --- | --- | --- |
| 입력의 출처 | 관찰한 규칙을 바탕으로 새 payload를 제작 | 같은 세션에서 캡처한 유효 message |
| 바이트 동일성 | 원본과 같을 필요 없음 | 캡처 원본과 ID·DLC·DATA가 같아야 함 |
| 핵심 질문 | “수신자는 송신자를 인증하는가?” | “수신자는 이 message가 오래된 것인지 확인하는가?” |
| 이 실습의 Toy 효과 | Toy Rear ECU가 GLB Tailgate 상태를 바꿈 | Toy Body ECU가 GLB Left Door 상태를 바꿈 |

Classic CAN의 기본 frame에는 암호학적 sender authentication(송신자 인증), timestamp·nonce·counter 기반 freshness(신선도), MAC가 자동으로 제공되지 않는다. 그래서 그러한 보호를 별도로 적용하지 않은 수신 로직은 ID와 DATA만 보고 공격자 frame을 정상 message로 오인할 수 있다. 다만 실제 생산 차량에는 Gateway 정책, SecOC/E2E, IDS, 물리·진단 접근 통제 등 별도 보호가 있을 수 있으므로 이 Toy 결과를 모든 차량에 일반화하면 안 된다.

## 선수지식

시작 전에 다음을 자기 말로 설명할 수 있어야 한다.

- CAN frame의 ID, DLC, DATA와 hexadecimal byte 표기
- ECU와 Gateway의 역할 및 `OBD-II → IDS → Gateway → target ECU → effect` 데이터 흐름
- `ls`로 항목을 나열하고 `cat`으로 알려진 항목을 읽는 기본 개념
- 두 hexadecimal 문자(`00`처럼 보이는 값)가 한 byte라는 사실

## 페이지 이동과 시각 경로 범례

1. `http://127.0.0.1:8447`을 연다.
2. 데스크톱에서는 사이드바의 **공격 실습**을 선택하고, 모바일에서는 하단의 **공격 실습**을 선택한다.
3. 상단 탭에서 **Spoofing** 또는 **Replay**로 이동한다.

차량 Canvas 안의 작은 번호 pin과 얇은 선은 현재 route를 표시한다. Canvas 밖 **target map**은 번호별 역할과 상태를 설명한다.

- `OBD-II`: 교육용 공격 입력 지점
- `IDS`: Toy monitoring 지점
- `Gateway`: 교육용 routing 경계
- `Rear ECU` 또는 `Body ECU`: 이번 scenario의 Toy target
- `Tailgate` 또는 `Left Door`: GLB effect anchor

ECU·Gateway pin은 `Toy logical position · OEM placement 아님`이고, 문·테일게이트 표시는 `GLB effect anchor · actuator 물리 위치 아님`이다. **Target**, **Effect**, **Overview**, **Reset camera** 제어로 route와 효과 부위를 번갈아 확인한다.

## Virtual command 문법

화면의 terminal은 실제 Bash/PowerShell이 아니라 allowlist 기반 in-memory interpreter다. 표시되는 `vcan0`은 실제 Linux kernel `vcan0` interface가 아니며, 명령이 host shell·filesystem·SocketCAN으로 전달되지 않는다.

허용 문법은 다음 형태로 제한된다. `<...>`는 직접 관찰해 채울 placeholder이며 그대로 입력하는 문자열이 아니다.

```text
pwd
whoami
ls
cat <KNOWN_FILE>
candump -L vcan0
candump -L vcan0 > <CAPTURE_FILE>
cansend vcan0 <ID>#<DATA>
canplayer -I <CAPTURE_FILE> -l <COUNT>
```

Restricted lab script에는 빈 줄·주석과 scenario별 최종 action 한 개만 둔다. 명령 앞뒤 공백, pipeline, chaining, command substitution, host path, 임의 파일, 다른 interface는 거부된다. 한 command는 최대 512자, script는 최대 20줄·4096자다.

## Spoofing 실습

화면 제목은 **CAN Spoofing Basics**, target은 **REAR ECU**, GLB/Toy effect는 **TAILGATE**다.

1. **목표 확인**: target map에서 `OBD-II → IDS → Gateway → Rear ECU → Tailgate` route를 확인한다.
2. **정상 관찰**: `ls`와 관찰 명령으로 가상 작업 공간과 정상 closed-state frame을 확인한다.
3. **Payload 작성**: 알려진 message map을 읽고 ID, DLC, state byte의 의미를 표로 정리한다.
4. **ECU 수락**: 관찰한 legitimate ID와 새 state payload를 이용해 한 개의 `cansend` 후보를 직접 작성한다. 캡처 문자열을 그대로 복사하는 Replay가 아니라는 점을 설명한다.
5. **증거**: 성공·실패 결과를 아래 증거 항목으로 검증한다.

성공을 판단할 관찰 가능한 증거는 다음과 같다.

- Evidence의 Stage가 `EVIDENCE`, Last verdict가 `EXECUTED`, Completed가 `YES`
- Network monitor에 accepted live event 한 행이 있고 verdict가 `EXECUTED`
- 그 행을 선택했을 때 Binary inspector가 직접 구성한 한 byte를 표시
- target map의 Toy Rear ECU route가 현재 경로를 나타냄
- GLB에서는 Tailgate만 열리고 Left Door·Right Door는 닫힘
- **실습 초기화** 후 Stage `RECON`, Attempts `0`, Last verdict `NONE`, Completed `NO`; 세 문/테일게이트가 닫히고 monitor·terminal·editor가 초기 상태로 돌아옴

## Replay 실습

화면 제목은 **CAN Replay Basics**, target은 **BODY ECU**, GLB/Toy effect는 **LEFT DOOR**다.

1. **목표 확인**: target map에서 `OBD-II → IDS → Gateway → Body ECU → Left Door` route를 확인한다.
2. **프레임 캡처**: 제한된 capture 문법으로 같은 session/generation의 유효 frame을 가상 파일에 저장한다.
3. **원본 확인**: 목록과 `cat`으로 캡처 ID, DLC, DATA를 기록한다.
4. **재전송**: file과 repeat placeholder를 관찰 결과에 맞춰 채운 `canplayer` 명령을 작성한다. byte를 바꾸지 않는다.
5. **증거**: 캡처 행과 accepted live event를 구분해 아래 항목을 확인한다.

성공을 판단할 관찰 가능한 증거는 다음과 같다.

- 캡처 직후 Stage `CAPTURE`, Last verdict `CAPTURED`; 원본 확인 후 Stage `EXECUTE`
- 재전송 후 Stage `EVIDENCE`, Last verdict `EXECUTED`, Completed `YES`
- Network monitor에 REST capture 행과 accepted CAN stream 행이 서로 다른 source로 표시
- accepted 행을 선택했을 때 Binary inspector의 ID·DLC·DATA가 캡처 행과 byte-identical
- Toy Body ECU가 target으로 표시되고 GLB에서는 Left Door만 열리며 Right Door·Tailgate는 닫힘
- **실습 초기화** 후 generation이 증가하고 Stage `RECON`, Attempts `0`, Last verdict `NONE`, Completed `NO`; vehicle·monitor·terminal·editor가 초기화됨

## 흔한 실수

- **Spoofing과 Replay 혼동**: 정상 ID로 새 payload를 만들면 Spoofing, 과거 유효 message를 바이트 그대로 다시 쓰면 Replay다.
- **Replay byte 변경**: ID·DLC·DATA 가운데 하나라도 바꾸면 byte-identical Replay 증거가 아니다.
- **GLB 동작 과장**: GLB 문·테일게이트 이동은 Toy state의 화면 표현이며 물리 차량 actuation 증거가 아니다.
- **Toy IDS 결과 과장**: `NORMAL`은 이 제한된 Toy rule의 결과일 뿐 commercial IDS bypass(상용 IDS 우회)를 뜻하지 않는다.
- **거부 결과 무시**: `ALERT`나 rejected verdict가 나오면 먼저 monitor 행과 terminal code를 기록하고 한 번에 한 가설만 바꾼다.

## 안전 경계와 정답 노출 경계

- 로컬 VM 또는 본인이 소유한 격리 환경에서만 실행한다. 포트를 `0.0.0.0`으로 공개하지 않는다.
- 실제 shell, kernel CAN interface, 물리 차량, OEM message contract를 사용하지 않는다.
- 초기 UI, public API state, frontend production bundle에는 정답 ID·payload·solution command를 넣지 않는다.
- 그러나 repository 또는 backend image 소유자는 server source와 교사용 자료를 검사할 수 있다. 이 경계는 강한 source/image secrecy나 multi-tenant 비밀 보장이 아니다.

## 수동 증거 체크리스트

- [ ] 시작 화면 제목, target, effect, initial Stage를 기록했다.
- [ ] 관찰 frame의 ID·DLC·DATA와 출처를 직접 적었다.
- [ ] 최종 action 전 예상 verdict와 GLB 변화를 먼저 적었다.
- [ ] 실제 result code, monitor source/verdict, Binary inspector bytes를 캡처했다.
- [ ] 영향 대상 한 부분만 움직이고 다른 부분은 닫힌 것을 확인했다.
- [ ] reset 후 Stage·Attempts·vehicle·monitor·terminal·editor 초기화를 확인했다.

## 회상 질문

자료를 보지 않고 답해 보자: **새 payload를 만드는 Spoofing과 byte-identical Replay를 ID·DLC·DATA·freshness 관점에서 어떻게 구분하며, accepted event 하나만으로 실제 차량 취약점을 입증할 수 없는 이유는 무엇인가?**
