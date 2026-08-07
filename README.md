# CANLite

자동차 사이버보안 교육 플랫폼의 프론트엔드 프리뷰입니다.

현재 저장소에는 다음 범위만 포함합니다.

- 학습 과정과 대시보드 화면
- CAN 프로토콜, CAN 프레임, ECU와 Gateway 기초 학습
- CAN 실습, 공격 실습, IDS 실습 및 관리 메뉴의 화면 틀
- 라이트·다크 테마와 반응형 레이아웃

FastAPI, Django, 데이터베이스, GLB 처리, API 호출, CAN 시뮬레이션 로직은 포함하지 않습니다.

## 실행

```bash
corepack pnpm install
corepack pnpm dev
```

기본 실행 화면은 VER4 Route Atlas입니다.

## 검사와 빌드

```bash
corepack pnpm typecheck
corepack pnpm build
```

기존 디자인 비교가 필요할 때만 아래 명령을 사용할 수 있습니다.

```bash
corepack pnpm dev:ver1
corepack pnpm dev:ver2
corepack pnpm dev:ver3
corepack pnpm dev:ver4
```
