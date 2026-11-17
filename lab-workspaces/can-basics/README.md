# CANLite 정상 CAN 송수신 Linux 실습

이 쉘은 호스트가 아닌 격리된 실습 컨테이너 안에서 실행됩니다.

```bash
ip link show vcan0
candump vcan0 &
cansend vcan0 101#00
cansend vcan0 200#00
```

커널이 `vcan`을 지원하면 실제 SocketCAN을 사용합니다. Docker Desktop/WSL처럼
모듈이 없는 환경에서는 같은 명령과 프레임 흐름을 제공하는 격리된 사용자 공간
CAN 버스로 자동 전환됩니다. 버스에서 실제로 관측된 프레임만 CAN Monitor와
차량 화면에 반영됩니다.
