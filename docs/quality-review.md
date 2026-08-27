# 코드 품질 검토표

평가자가 같은 기준으로 확인할 수 있도록 100점 예시 배점을 둔다. 점수는 파일 수나
주석 줄 수가 아니라, 실제 책임 분리와 검증 근거를 기준으로 준다.

| 항목 | 배점 | 만점 기준 | 주요 감점 조건 |
|---|---:|---|---|
| 가독성 | 25 | 이름만으로 도메인이 드러나고 긴 조건은 작은 함수·타입으로 설명된다 | 축약어 남용, 중복 magic value, 한 함수의 여러 책임 |
| 주석 활용 | 20 | 보안·동시성·자원 소유권처럼 코드만으로 알기 어려운 이유를 설명한다 | 코드를 한국어로 되풀이, 오래된 TODO, 주석 처리한 미완성 코드 |
| 구조 합리성 | 25 | page/feature/provider/router/domain 경계와 의존 방향이 지켜진다 | page의 자원 관리, domain의 FastAPI 의존, GLTF 원본 공유 mutation |
| 기능 완성도 | 30 | 정상·오류·reset·취소·재접속이 테스트되고 문서와 실제 계약이 같다 | happy path만 검증, rejected effect 적용, 문서와 endpoint 불일치 |

## 현재 확인 근거

- 정상/공격 화면은 `SharedVehicleScene`을 통해 한 GLB·좌표·카메라 계약을 공유한다.
- xterm 자원 생명주기는 `CanCommandTerminal`로 분리되고, command 의미는 page에 남는다.
- 공격 effect는 서버의 `EXECUTED`와 `effectApplied`를 모두 확인한 뒤에만 적용한다.
- session/evidence/client queue에는 상한이 있고 reset generation과 취소 경합 테스트가 있다.
- 학습자 문서와 정답 포함 교사용 문서가 경로 수준에서 분리되어 있다.
- 전체 pytest, Vitest, typecheck, build, Compose 검사를 한 문서에서 재현할 수 있다.

## 남은 구조적 위험

- `CanFrameSenderPage.tsx`, `CanPracticeOnlyPage.tsx`, `VehicleNetworkViewport.tsx`,
  `server/routers/can.py`는 여전히 큰 파일이다. 기능 단위 테스트 없이 기계적으로 나누면
  오히려 상태 소유권을 흐릴 수 있으므로, 다음 분리는 각 경계의 characterization test와 함께 한다.
- frontend production bundle은 현재 단일 대형 chunk 경고가 난다. route 단위 lazy loading은
  기능과 별개의 성능 작업으로 다룬다.
- 과정 진행도는 프로필과 달리 영속화되지 않는다. 멀티 사용자·DB 지원으로 오해하지 않는다.
