import type {
  BeginnerCanAttackScenario,
  BeginnerCanAttackUiConfig,
} from "./beginnerCanAttackTypes"

// 실습 화면과 설명 화면이 같은 원본을 쓰도록 시나리오 문구를 여기에 둔다.

export const DOOR_ATTACK_STAGES = [
  "정찰",
  "캡처",
  "분석",
  "Replay 실패",
  "프레임 제작",
  "IDS 검증",
  "증거",
] as const

export const DOOR_ATTACK_HINTS = [
  "먼저 baseline.log와 door-open.log의 반복되는 필드와 변하는 필드를 구분하세요.",
  "연속 프레임에서 한 바이트가 어떻게 변하고 다른 바이트가 함께 변하는지 표로 적어 보세요.",
  "한 번에 하나의 가설만 시험하고 BLOCKED reason을 다음 입력의 근거로 사용하세요.",
] as const

export const BEGINNER_CAN_ATTACK_CONFIG: Record<BeginnerCanAttackScenario, BeginnerCanAttackUiConfig> = {
  spoofing: {
    scenario: "spoofing",
    title: "CAN Spoofing Basics",
    targetSummary: "REAR ECU",
    effectSummary: "TAILGATE",
    routeId: "spoofing",
    targetId: "rear",
    effectId: "tailgate",
    definition:
      "공격자가 정상 기능 프레임에 사용되는 CAN ID(송신자 인증값 아님)로 새 상태 payload를 구성해 전송합니다. 이 Toy contract에는 source authentication(송신자 인증)이 없습니다.",
    stages: ["목표 확인", "정상 관찰", "Payload 작성", "ECU 수락", "증거"],
    initialScript:
      "# 관찰한 근거로 새 상태 프레임을 작성하세요.\n# cansend vcan0 <ID>#<DATA>",
    hints: [
      "가상 작업 공간의 항목을 먼저 ls로 확인하세요.",
      "candump -L vcan0로 정상 상태 프레임을 관찰하세요.",
      "제공된 message-map 파일을 직접 읽고 ID와 byte 의미를 구분하세요.",
    ],
    objective:
      "관찰한 메시지 계약을 근거로 새 프레임과 원본 재사용의 차이를 설명합니다.",
    accent: "#2563eb",
  },
  replay: {
    scenario: "replay",
    title: "CAN Replay Basics",
    targetSummary: "BODY ECU",
    effectSummary: "LEFT DOOR",
    routeId: "replay",
    targetId: "body",
    effectId: "leftDoor",
    definition:
      "공격자가 이전에 캡처한 유효 프레임을 byte-for-byte(바이트 그대로) 다시 전송합니다. 이 Toy contract에는 freshness protection(신선도 보호)이 없습니다.",
    stages: ["목표 확인", "프레임 캡처", "원본 확인", "재전송", "증거"],
    initialScript:
      "# 관찰한 캡처를 그대로 재생하는 명령을 작성하세요.\n# canplayer -I <FILE> -l <COUNT>",
    hints: [
      "먼저 virtual capture를 생성하는 제한 명령을 찾아 실행하세요.",
      "생성된 항목을 목록에서 확인한 뒤 내용을 직접 관찰하세요.",
      "재생 전 원본의 ID, DLC, DATA가 바뀌지 않았는지 확인하세요.",
    ],
    objective:
      "캡처 provenance(출처)와 동일 바이트 재전송이 필요한 이유를 설명합니다.",
    accent: "#7c3aed",
  },
}
