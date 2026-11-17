# CANLite 격리 Linux 실습

이 Bash는 호스트가 아닌 실습 전용 컨테이너에서 비root 사용자로 실행됩니다.

기본 CAN 명령:

```bash
ip link show vcan0
candump vcan0 &
cansend vcan0 101#00
```

현재 실습 이름은 `echo $CANLITE_LAB_ID`로 확인할 수 있습니다.
