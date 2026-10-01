import type { LabIntroContent } from "@/features/lab-layout/LabIntro"

// 문구는 각 IDS/IPS 실습의 미션·힌트·완료 설명에서 가져왔다.

const SIMULATION_NOTE = (
  <p>
    교육용 시뮬레이션입니다. 실제 차량에서는 IDS/IPS 파이프라인이 탐지·판정 로직을 선행합니다. 실습 화면의
    [시작] 버튼을 누르면 시나리오가 처음부터 진행됩니다.
  </p>
)

export const RULE_BASED_IDS_INTRO: LabIntroContent = {
  kicker: "IDS / IPS 실습 · STEP 1",
  title: "규칙 기반 IDS · ID White List",
  description:
    "CAN ID 화이트리스트로 허용되지 않은 ID를 차단하는 IDS를 직접 시험합니다. 허용된 ID를 그대로 사용하는 공격이 이 규칙을 어떻게 통과하는지 확인합니다.",
  flowLabel: "DETECTION FLOW",
  flow: ["Terminal", "IDS · ID 화이트리스트", "Rear ECU", "Trunk"],
  flowNote: "CAN ID가 화이트리스트에 없으면 ALERT로 차단하고, 있으면 PASS로 ECU에 전달합니다.",
  objectives: [
    "cat whitelist.yaml로 허용된 CAN ID(0x101 DOOR · 0x200 TRUNK · 0x201 DASHBOARD)를 확인합니다.",
    "허용되지 않은 ID는 ALERT, 허용된 ID는 PASS로 판정되는 것을 터미널과 IDS Log에서 비교합니다.",
    "허용된 Rear ECU ID로 트렁크를 3번 닫아, 화이트리스트가 정상 ID 악용은 구분하지 못함을 설명합니다.",
  ],
  facts: [
    { label: "허용 ID", value: "0x101 · 0x200 · 0x201" },
    { label: "미션", value: "트렁크 닫기 ×3" },
  ],
  notes: SIMULATION_NOTE,
}

export const PERIOD_BASED_IDS_INTRO: LabIntroContent = {
  kicker: "IDS / IPS 실습 · STEP 2",
  title: "주기(Period) 기반 IDS",
  description:
    "정상 ECU는 0x101 Frame을 100ms마다 보냅니다. 정상 주기를 관찰한 뒤 별도의 Frame을 주입해, 주기가 깨지는 순간 IDS가 이상을 탐지하는지 확인합니다.",
  flowLabel: "DETECTION FLOW",
  flow: ["정상 ECU · 100ms", "Spoofing Frame 주입", "IDS 주기 검사", "ANOMALY"],
  flowNote: "100ms 기준에서 80ms 미만 간격으로 도착한 Frame을 이상으로 탐지합니다.",
  objectives: [
    "타임라인에서 정상 Frame이 100ms 간격으로 도착하는 것을 관찰합니다.",
    "cansend vcan0 101#00으로 Frame을 주입해 주기를 깨뜨리고 IDS 판정을 확인합니다.",
    "타임라인에서 비정상적으로 삽입된 Frame을 골라, 단순 Spoofing이 주기 검사로 탐지되는 이유를 설명합니다.",
  ],
  facts: [
    { label: "감시 ID", value: "0x101" },
    { label: "기준 주기", value: "100 ms" },
    { label: "탐지 기준", value: "< 80 ms" },
  ],
  notes: SIMULATION_NOTE,
}

export const COUNTER_STATUS_IDS_INTRO: LabIntroContent = {
  kicker: "IDS / IPS 실습 · STEP 3",
  title: "카운터/상태 검증 IDS",
  description:
    "0x456 Frame의 Counter가 매번 하나씩 증가하는 것을 관찰한 뒤, 과거 Frame을 캡처해 다시 보내는 Replay가 Counter 검증으로 탐지되는 과정을 확인합니다. 마지막으로 Counter가 맞아도 현재 상태와 맞지 않는 명령을 상태 검증으로 걸러냅니다.",
  flowLabel: "DETECTION FLOW",
  flow: ["Counter 관찰", "Frame 2 캡처", "Replay", "Counter 검증", "상태 검증"],
  flowNote: "Counter는 이전 값보다 하나씩 증가해야 합니다. 이미 지나간 값을 가진 Frame은 ALERT입니다.",
  objectives: [
    "정상 Frame의 Counter가 10 → 11 → 12 → 13으로 증가하는 것을 관찰합니다.",
    "candump로 Frame 2를 캡처하고 canplayer로 재전송해 Counter 불일치 탐지를 확인합니다.",
    "이미 열린 도어를 다시 여는 명령이 Counter가 맞아도 상태 검증에서 탐지되는 이유를 설명합니다.",
  ],
  facts: [
    { label: "감시 ID", value: "0x456" },
    { label: "단계", value: "관찰 · Replay · 문제 · 상태" },
  ],
  notes: SIMULATION_NOTE,
}

export const IPS_BLOCKING_INTRO: LabIntroContent = {
  kicker: "IDS / IPS 실습 · STEP 4",
  title: "IPS 차단",
  description:
    "IDS가 탐지한 공격 Frame에 IPS 규칙을 적용해 실제로 차단합니다. 탐지 이유에 맞는 규칙을 고르지 않으면 정상 통신까지 막히는 과잉 차단이 생깁니다.",
  flowLabel: "BLOCKING FLOW",
  flow: ["IDS 탐지", "IPS 규칙 선택", "공격 Frame 차단", "정상 통신 유지"],
  flowNote: "타임라인에서 탐지된 공격 Frame(빨간 ×)을 클릭해 IPS 규칙을 적용합니다.",
  objectives: [
    "시나리오 1(Replay)에서 공격 Frame만 차단하고 정상 Frame 4개는 그대로 전달합니다.",
    "시나리오 2(주기 이상)에서 탐지 이유에 맞는 다른 규칙을 골라 같은 결과를 만듭니다.",
    "CAN ID 전체 차단 규칙이 정상 기능까지 멈추게 하는 이유를 설명합니다.",
  ],
  facts: [
    { label: "시나리오", value: "Replay · 주기 이상" },
    { label: "성공 조건", value: "정상 4/4 · 공격 0/1" },
  ],
  notes: SIMULATION_NOTE,
}
