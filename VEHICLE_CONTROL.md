# 차량 제어 API

화면의 3D 차량을 코드에서 여닫는 방법입니다.

HTTP 요청 한 번이면 됩니다. 3D나 프론트엔드를 몰라도 됩니다.

```bash
curl -X POST localhost:8010/can/trunk \
  -H 'Content-Type: application/json' \
  -d '{"action":"open"}'
```

---

## 할 수 있는 것

| 기능 | 엔드포인트 |
|---|---|
| 도어 열기 / 닫기 (양쪽) | `POST /can/door` |
| 도어 한쪽만 열기 / 닫기 | `POST /can/door` + `side` |
| 트렁크 열기 / 닫기 | `POST /can/trunk` |
| 임의 CAN 프레임 보내기 | `POST /can/send` |
| 현재 상태 확인 | `GET /can/status` |
| 상태 초기화 | `DELETE /can/snapshot` |

기본 주소는 `http://127.0.0.1:8010` 입니다.

---

## 준비

터미널 두 개를 띄웁니다.

```bash
corepack pnpm terminal:server        # 백엔드 :8010
```

```bash
corepack pnpm dev:ver4               # 화면 :8447
```

`http://127.0.0.1:8447` 를 열고 사이드바에서 **3D 모델 관리** 를 선택합니다. 툴바에 `CAN 연결됨` 이 보이면 준비 끝입니다.

처음이라면 파이썬 환경을 한 번 만들어야 합니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements.txt
```

---

## 도어

```
POST /can/door
```

| 필드 | 값 | 필수 | 기본값 |
|---|---|---|---|
| `action` | `open` / `close` | O | — |
| `side` | `both` / `L` / `R` | X | `both` |

```bash
# 양쪽 열기
curl -X POST localhost:8010/can/door \
  -H 'Content-Type: application/json' \
  -d '{"action":"open"}'

# 오른쪽만 닫기
curl -X POST localhost:8010/can/door \
  -H 'Content-Type: application/json' \
  -d '{"action":"close","side":"R"}'
```

파이썬에서:

```python
import httpx

httpx.post("http://127.0.0.1:8010/can/door", json={"action": "open", "side": "L"})
```

---

## 트렁크

```
POST /can/trunk
```

| 필드 | 값 | 필수 |
|---|---|---|
| `action` | `open` / `close` | O |

```bash
curl -X POST localhost:8010/can/trunk \
  -H 'Content-Type: application/json' \
  -d '{"action":"open"}'
```

리어 글라스와 테일게이트가 한 덩어리로 위로 들립니다.

---

## 임의 프레임

도어·트렁크 외의 CAN ID를 쓸 때입니다.

```
POST /can/send
```

| 필드 | 값 | 필수 |
|---|---|---|
| `can_id` | `"0x200"` 또는 `"200"` | O |
| `data` | 최대 8바이트 배열 | X |

```bash
curl -X POST localhost:8010/can/send \
  -H 'Content-Type: application/json' \
  -d '{"can_id":"0x200","data":["01"]}'
```

지금 화면이 반응하는 ID는 `0x101`(도어)과 `0x200`(트렁크) 두 개뿐입니다. 다른 ID를 보내면 버스에는 올라가지만 차량은 움직이지 않습니다.

---

## 상태 확인

```
GET /can/status
```

```json
{ "mode": "socketcan", "channel": "vcan0", "clients": 1, "snapshot": 2 }
```

| 필드 | 의미 |
|---|---|
| `clients` | 지금 화면을 보고 있는 브라우저 수 |
| `snapshot` | 기억하고 있는 CAN ID 개수 |
| `mode` | 동작 모드 (아래 참고) |

`clients` 가 `0` 이어도 명령을 보내는 건 의미가 있습니다. 나중에 접속하는 브라우저가 그 상태를 그대로 받습니다.

---

## 응답

성공하면 이렇게 돌아옵니다.

```json
{
  "ok": true,
  "can_id": "0x101",
  "data": ["00", "00"],
  "mode": "socketcan",
  "channel": "vcan0"
}
```

`data` 는 실제로 버스에 나간 바이트입니다. 의도한 대로 나갔는지 확인할 때 씁니다.

도어는 한쪽만 지정해도 응답에 양쪽 상태가 나옵니다.

```bash
curl -X POST localhost:8010/can/door -H 'Content-Type: application/json' \
  -d '{"action":"open","side":"L"}'
# {"ok":true,"can_id":"0x101","data":["00","01"], ...}
#                                      ↑좌 열림  ↑우는 직전 상태 유지
```

잘못된 입력은 `422` 로 거부됩니다.

```bash
curl -X POST localhost:8010/can/door -H 'Content-Type: application/json' \
  -d '{"action":"jump"}'
# 422 — action은 open 또는 close만 됩니다
```

`action` 오타나 범위를 벗어난 `can_id` 가 조용히 통과하는 일은 없습니다.

---

## 터미널에서 직접

`cansend` 로 같은 프레임을 쏴도 결과는 똑같습니다. 실습생이 배우는 방식이 이쪽입니다.

### `0x101` — 도어

프레임 하나가 **양쪽 상태를 모두** 담습니다.

| 바이트 | 의미 | 값 |
|---|---|---|
| 1번째 | 왼쪽 도어 | `00` 열림 / `01` 닫힘 |
| 2번째 | 오른쪽 도어 | `00` 열림 / `01` 닫힘 |

```bash
cansend vcan0 101#0000     # 양쪽 열림
cansend vcan0 101#0001     # 왼쪽만 열림
cansend vcan0 101#0101     # 양쪽 닫힘
cansend vcan0 101#01       # 1바이트로 보내면 양쪽 같은 값
```

"왼쪽을 열어라" 같은 명령이 아니라 "왼쪽 열림, 오른쪽 닫힘" 같은 **상태**입니다. 그래서 한쪽만 바꾸고 싶으면 반대쪽 값도 같이 실어야 합니다.

`POST /can/door` 를 쓰면 이 계산을 서버가 해 줍니다. `side` 로 한쪽만 지정해도 반대쪽은 직전 상태가 유지됩니다.

### `0x200` — 트렁크

| 바이트 | 값 | 의미 |
|---|---|---|
| 1번째 | `01` | 열기 |
| | `00` | 닫기 |

```bash
cansend vcan0 200#01       # 열기
cansend vcan0 200#00       # 닫기
```

---

## 상태가 유지됩니다

한 번 보낸 명령은 서버가 기억합니다. 그래서:

- 트렁크를 열어 둔 채 페이지를 새로고침해도 **열린 상태로** 다시 그려집니다
- 브라우저를 여러 개 열어도 전부 같은 상태입니다
- 아무도 화면을 안 보고 있을 때 미리 열어두면, 나중에 접속하는 사람이 열린 상태로 시작합니다

다음 실습을 깨끗하게 시작하려면 초기화합니다.

```bash
curl -X DELETE localhost:8010/can/snapshot
```

이건 기억만 지웁니다. 이미 보고 있는 화면은 그대로입니다. 실제로 닫으려면 닫기 명령을 보내세요.

```bash
curl -X POST localhost:8010/can/door  -H 'Content-Type: application/json' -d '{"action":"close"}'
curl -X POST localhost:8010/can/trunk -H 'Content-Type: application/json' -d '{"action":"close"}'
```

서버를 재시작하면 기억은 사라집니다.

---

## 동작 모드

`GET /can/status` 의 `mode` 로 확인합니다. 설정 없이 자동으로 정해집니다.

| 모드 | 조건 | 차이 |
|---|---|---|
| `socketcan` | `can-utils` 설치됨 | 터미널 `cansend` 도 화면에 반영됩니다 |
| `loopback` | 설치 안 됨 | **HTTP API만** 동작합니다 |

`loopback` 에서도 이 문서의 모든 엔드포인트는 정상 동작합니다. 다만 터미널에서 친 `cansend` 는 화면에 반영되지 않습니다.

실습생 시나리오를 테스트하려면 `socketcan` 이 필요합니다.

```bash
sudo apt install -y can-utils
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

인터페이스 이름을 바꾸려면 `CANLITE_CAN_CHANNEL=vcan1` 을 씁니다.

---

## 자주 쓰는 조합

**시연 전 초기화**

```bash
curl -X DELETE localhost:8010/can/snapshot
curl -X POST localhost:8010/can/door  -H 'Content-Type: application/json' -d '{"action":"close"}'
curl -X POST localhost:8010/can/trunk -H 'Content-Type: application/json' -d '{"action":"close"}'
```

**순서대로 열기**

```bash
for body in '{"action":"open","side":"L"}' '{"action":"open","side":"R"}'; do
  curl -X POST localhost:8010/can/door -H 'Content-Type: application/json' -d "$body"
  sleep 1
done
curl -X POST localhost:8010/can/trunk -H 'Content-Type: application/json' -d '{"action":"open"}'
```

**화면을 보는 사람이 있는지 확인하고 실행**

```bash
if [ "$(curl -s localhost:8010/can/status | grep -o '"clients":[0-9]*' | cut -d: -f2)" -gt 0 ]; then
  curl -X POST localhost:8010/can/trunk -H 'Content-Type: application/json' -d '{"action":"open"}'
fi
```

---

## 주의

서버는 `127.0.0.1` 에서만 띄우세요. 이 프로젝트는 브라우저에서 실제 셸을 여는 기능도 포함하므로, 공유 네트워크나 공개 서버에 배포하면 안 됩니다.
