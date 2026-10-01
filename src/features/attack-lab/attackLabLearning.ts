export type AttackLabLearningScenario = "door" | "spoofing" | "replay"

export interface AttackLabStageGuidance {
  label: string
  purpose: string
  action: string
  evidence: string
  completion: string
}

export interface AttackLabScenarioLearning {
  predictionPrompt: string
  principleQuestion: string
  stages: readonly AttackLabStageGuidance[]
}

export const ATTACK_LAB_LEARNING = {
  door: {
    predictionPrompt:
      "후보 Frame n/N마다 예상 ECU 판정, 중단 장치, IDS 관찰 결과, Door 효과를 실행 전에 기록하세요. 정확한 숨은 값이 아니라 관찰 근거와 가설을 씁니다.",
    principleQuestion:
      "관찰한 rolling counter와 checksum 관계가 각 후보 프레임의 ECU 판정에 어떤 영향을 주는지 선택한 증거로 설명하세요.",
    stages: [
      {
        label: "정찰",
        purpose: "허용된 가상 터미널과 격리된 Toy 공격 범위를 확인합니다.",
        action:
          "허용된 관찰 명령으로 가상 작업 공간과 제공 자료의 종류를 확인하세요.",
        evidence:
          "Virtual Terminal의 명령 echo, stdout, 가상 파일 목록을 확인하세요.",
        completion:
          "분석에 사용할 자료와 차량 경로에 들어가는 입력을 구분해 설명할 수 있습니다.",
      },
      {
        label: "캡처",
        purpose:
          "정상 상태와 Door 상태 변화가 기록된 프레임 증거를 수집합니다.",
        action:
          "baseline과 상태 변화 자료를 관찰하고 비교할 프레임을 Monitor에서 선택하세요.",
        evidence:
          "선택한 프레임의 CAN ID, DLC, DATA와 Binary Inspector의 byte 표현을 확인하세요.",
        completion:
          "서로 비교할 정상·상태 변화 프레임을 같은 기준으로 기록했습니다.",
      },
      {
        label: "분석",
        purpose:
          "고정 필드와 변동 필드를 구분해 counter/checksum 관계의 가설을 세웁니다.",
        action:
          "연속 프레임에서 유지되는 byte와 함께 변하는 byte를 표로 정리하세요.",
        evidence:
          "Monitor의 순서, DATA 차이, 이전 거부 reason을 근거로 사용하세요.",
        completion:
          "정답 값을 보지 않고 다음 프레임의 판정을 예측할 가설을 한 문장으로 작성했습니다.",
      },
      {
        label: "Replay 실패",
        purpose:
          "과거의 유효해 보이는 프레임도 현재 상태 검증에서 거부될 수 있음을 확인합니다.",
        action:
          "관찰한 과거 프레임 후보를 제출하기 전에 terminal 결과와 ECU 판정을 각각 예상하세요.",
        evidence:
          "silent terminal, Toy ECU 거부 reason, 중단 장치, Door 효과 없음이 같은 action인지 확인하세요.",
        completion:
          "가상 경로 입력 성공과 Toy ECU application 수락이 서로 다른 사실임을 설명할 수 있습니다.",
      },
      {
        label: "프레임 제작",
        purpose: "관찰한 관계를 따르는 순서 있는 후보 프레임을 구성합니다.",
        action:
          "한 번에 하나의 가설만 바꾸고 각 후보 Frame n/N의 예상 판정을 먼저 기록하세요.",
        evidence:
          "HUD의 현재 command, Frame n/N, ID/DLC/DATA와 ECU verdict를 비교하세요.",
        completion: "각 후보의 입력·예상·실제 판정을 순서대로 대조했습니다.",
      },
      {
        label: "IDS 검증",
        purpose:
          "Toy IDS의 sequence 관찰 결과와 ECU 판정·차량 효과를 분리합니다.",
        action:
          "전체 프레임 순서가 처리되는 동안 IDS와 ECU 정보가 어느 노드에서 공개되는지 관찰하세요.",
        evidence:
          "Toy IDS source의 NORMAL/ALERT 의미, ECU source의 verdict, endpoint effect를 확인하세요.",
        completion:
          "IDS 관찰·탐지와 차단 여부를 혼동하지 않고 설명할 수 있습니다.",
      },
      {
        label: "증거",
        purpose:
          "실행 전 가설과 backend-authoritative 결과를 같은 action 증거로 비교합니다.",
        action:
          "해당 Monitor frame 또는 Activity 항목을 선택하고 예상과 실제의 차이를 작성하세요.",
        evidence:
          "Terminal, Vehicle Flow, Toy IDS, Toy ECU, 교육용 분석의 source label을 대조하세요.",
        completion:
          "선택한 증거로 거부 또는 효과 적용 원인과 Toy 환경의 한계를 설명했습니다.",
      },
    ],
  },
  spoofing: {
    predictionPrompt:
      "정상 관찰 프레임과 비교해 유지할 message identifier/DLC와 새로 구성할 payload/state를 구분하고, 예상 Rear ECU 판정·IDS 관찰·Tailgate 효과를 기록하세요.",
    principleQuestion:
      "정상 기능의 message identifier와 새 payload를 사용하는 시도를 Spoofing과 Replay 관점에서 어떻게 분류할 수 있는지 설명하세요. CAN ID는 인증된 송신자 identity가 아닙니다.",
    stages: [
      {
        label: "목표 확인",
        purpose:
          "Toy Rear ECU와 Tailgate effect까지의 교육용 경로와 공격 전제를 확인합니다.",
        action:
          "Target map에서 OBD, IDS, Gateway, Rear ECU, Tailgate의 역할을 순서대로 확인하세요.",
        evidence:
          "Target/Effect 요약과 각 논리 장치의 truth qualifier를 확인하세요.",
        completion:
          "초기 침투가 아니라 이미 주어진 Toy injection access에서 시작함을 설명할 수 있습니다.",
      },
      {
        label: "정상 관찰",
        purpose:
          "정상 기능 프레임의 message identifier, DLC, state byte 역할을 관찰합니다.",
        action:
          "가상 작업 공간과 message map을 확인하고 정상 상태 프레임을 Monitor에서 선택하세요.",
        evidence:
          "Virtual Terminal stdout, Monitor의 CAN ID/DATA, Binary Inspector를 확인하세요.",
        completion:
          "관찰한 사실과 아직 추정 중인 payload 의미를 구분해 기록했습니다.",
      },
      {
        label: "Payload 작성",
        purpose:
          "정상 기능의 identifier를 재사용하면서 새로운 상태 payload를 구성하는 가설을 세웁니다.",
        action:
          "Replay처럼 원본 전체를 복사하지 말고 유지할 필드와 바꿀 상태 필드를 먼저 적으세요.",
        evidence:
          "제출한 ID/DLC/DATA와 정상 관찰 프레임의 차이를 비교하세요. CAN ID는 인증된 송신자 identity가 아닙니다.",
        completion:
          "새 payload 구성과 과거 프레임의 byte-identical 재사용을 구분할 수 있습니다.",
      },
      {
        label: "ECU 수락",
        purpose:
          "Toy Rear ECU의 수락 또는 거부 판정과 Tailgate 효과를 확인합니다.",
        action:
          "명령을 제출하기 전에 terminal 형태, stop node, ECU verdict, effect를 예상하세요.",
        evidence:
          "silent/stderr terminal, Vehicle Flow, Toy IDS, Rear ECU verdict, Tailgate state를 대조하세요.",
        completion:
          "수락·거부 reason과 source authentication 부재의 관계를 과장 없이 설명할 수 있습니다.",
      },
      {
        label: "증거",
        purpose:
          "같은 action의 프레임·판정·차량 영향을 선택한 근거로 연결합니다.",
        action:
          "최신 Monitor frame 또는 차량 경로가 없는 Activity 항목을 선택하고 예상과 실제를 비교하세요.",
        evidence:
          "ID/DLC/DATA, IDS 의미, ECU verdict, Tailgate effect의 source를 확인하세요.",
        completion:
          "Spoofing과 Replay의 차이 및 CAN identifier가 인증값이 아닌 이유를 설명했습니다.",
      },
    ],
  },
  replay: {
    predictionPrompt:
      "재생할 capture의 provenance와 ID·DLC·DATA가 원본과 byte-identical인지 확인하고, 예상 preflight 결과·Body ECU 판정·IDS 관찰·Left Door 효과를 기록하세요.",
    principleQuestion:
      "캡처한 프레임을 byte-identical하게 재전송했을 때의 ECU 판정을 freshness protection 관점에서 어떻게 해석할 수 있는지 캡처와 재생 증거를 비교해 설명하세요.",
    stages: [
      {
        label: "목표 확인",
        purpose:
          "Toy Body ECU와 Left Door effect까지의 교육용 Replay 경로와 공격 전제를 확인합니다.",
        action:
          "Target map에서 capture 전 단계와 차량 injection 경로를 구분해 확인하세요.",
        evidence: "Target/Effect 요약, Stage, 초기 Evidence 상태를 확인하세요.",
        completion:
          "capture evidence와 차량 effect가 서로 다른 단계임을 설명할 수 있습니다.",
      },
      {
        label: "프레임 캡처",
        purpose:
          "현재 session/generation에 속한 유효 프레임 evidence를 생성합니다.",
        action:
          "허용된 capture 명령으로 가상 파일을 만들고 Activity와 Monitor 변화를 관찰하세요.",
        evidence:
          "capture source, 파일 생성 결과, effect가 적용되지 않은 관찰 경로를 확인하세요.",
        completion:
          "캡처가 기록됐지만 아직 ECU/차량 effect 경로에 들어가지 않았음을 설명할 수 있습니다.",
      },
      {
        label: "원본 확인",
        purpose: "재생 전 capture provenance와 원본 프레임 내용을 검증합니다.",
        action:
          "가상 파일의 session/generation 맥락과 ID·DLC·DATA를 직접 확인하세요.",
        evidence:
          "Virtual Terminal stdout과 선택한 capture frame의 Binary Inspector를 확인하세요.",
        completion:
          "재생할 원본과 현재 실습 맥락이 일치하며 byte를 변경하지 않았음을 기록했습니다.",
      },
      {
        label: "재전송",
        purpose:
          "local preflight와 실제 차량 경로 입력을 구분해 byte-identical Replay를 검증합니다.",
        action:
          "재생 전에 terminal 결과, stop node, ECU verdict, Left Door effect를 예상하세요.",
        evidence:
          "preflight stderr 또는 silent submission, Vehicle Flow, capture/replay ID·DLC·DATA를 대조하세요.",
        completion:
          "CAPTURE_REQUIRED 같은 local failure와 Body ECU에 도달한 Replay를 구분할 수 있습니다.",
      },
      {
        label: "증거",
        purpose:
          "capture와 replay action의 provenance·프레임·차량 결과를 연결합니다.",
        action:
          "같은 원본의 capture/replay evidence를 선택하고 예상과 실제를 비교하세요.",
        evidence:
          "byte-identical ID/DLC/DATA, IDS 의미, Body ECU verdict, Left Door effect를 확인하세요.",
        completion:
          "freshness protection 부재가 Replay 수락에 미친 영향과 Toy 환경의 한계를 설명했습니다.",
      },
    ],
  },
} as const satisfies Record<AttackLabLearningScenario, AttackLabScenarioLearning>

export const ATTACK_LAB_PREDICTION_PROMPTS = {
  door: ATTACK_LAB_LEARNING.door.predictionPrompt,
  spoofing: ATTACK_LAB_LEARNING.spoofing.predictionPrompt,
  replay: ATTACK_LAB_LEARNING.replay.predictionPrompt,
} as const satisfies Record<AttackLabLearningScenario, string>

export const ATTACK_LAB_PRINCIPLE_QUESTIONS = {
  door: ATTACK_LAB_LEARNING.door.principleQuestion,
  spoofing: ATTACK_LAB_LEARNING.spoofing.principleQuestion,
  replay: ATTACK_LAB_LEARNING.replay.principleQuestion,
} as const satisfies Record<AttackLabLearningScenario, string>
