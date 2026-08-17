import type { CanCommand, CanMessageDefinition, CanNodeId } from "./types"

export const CAN_NODE_LABELS: Record<CanNodeId, string> = {
  gateway: "Gateway ECU",
  body: "Body ECU",
  dashboard: "Dashboard ECU",
  rear: "Rear Module",
  ids: "IDS ECU",
  obd: "Training OBD-II",
}

export const CAN_COMMAND_CATALOG: Record<CanCommand, CanMessageDefinition> = {
  DOOR_LOCK: {
    command: "DOOR_LOCK",
    label: "도어 잠금",
    terminalCommand: "cansend vcan0 101#01",
    frame: {
      canId: "0x101",
      dlc: 1,
      data: ["01"],
    },
    context: {
      command: "DOOR_LOCK",
      source: "gateway",
      target: "body",
      route: ["gateway", "body"],
      meaning: "Cabin control command",
      action: "DOOR_LOCK",
    },
    processing: {
      filterResult: "ACCEPT",
      executionResult: "EXECUTED",
    },
    monitoring: {
      idsObserved: true,
      status: "NORMAL",
    },
    ui: {
      title: "Body control route",
      vehicleStatus: "도어 잠금 실행",
      busStatus: "Gateway -> Body ECU 경로 강조",
      effects: [
        "Gateway ECU가 Body ECU로 도어 잠금 프레임을 전달합니다.",
        "차문 관련 제어가 Body ECU 쪽 경로에서 확인됩니다.",
      ],
    },
  },
  TRUNK_OPEN: {
    command: "TRUNK_OPEN",
    label: "트렁크 열기",
    terminalCommand: "cansend vcan0 200#01",
    frame: {
      canId: "0x200",
      dlc: 1,
      data: ["01"],
    },
    context: {
      command: "TRUNK_OPEN",
      source: "gateway",
      target: "rear",
      route: ["gateway", "rear"],
      meaning: "Rear access command",
      action: "TRUNK_OPEN",
    },
    processing: {
      filterResult: "ACCEPT",
      executionResult: "EXECUTED",
    },
    monitoring: {
      idsObserved: true,
      status: "NORMAL",
    },
    ui: {
      title: "Rear module route",
      vehicleStatus: "트렁크 열림",
      busStatus: "Gateway -> Rear Module 경로 강조",
      effects: [
        "Gateway ECU가 Rear Module로 트렁크 제어 프레임을 보냅니다.",
        "후방 기능은 Rear Module 경로에서 분리되어 동작합니다.",
      ],
    },
  },
  DASHBOARD_SYNC: {
    command: "DASHBOARD_SYNC",
    label: "계기판 갱신",
    terminalCommand: "cansend vcan0 201#3E01",
    frame: {
      canId: "0x201",
      dlc: 2,
      data: ["3E", "01"],
    },
    context: {
      command: "DASHBOARD_SYNC",
      source: "gateway",
      target: "dashboard",
      route: ["gateway", "dashboard"],
      meaning: "Cluster sync command",
      action: "DASHBOARD_SYNC",
    },
    processing: {
      filterResult: "ACCEPT",
      executionResult: "EXECUTED",
    },
    monitoring: {
      idsObserved: true,
      status: "NORMAL",
    },
    ui: {
      title: "Dashboard cluster route",
      vehicleStatus: "계기판 갱신 실행",
      busStatus: "Gateway -> Dashboard ECU 경로 강조",
      effects: [
        "Gateway ECU가 Dashboard ECU로 클러스터 갱신 프레임을 보냅니다.",
        "속도계와 경고등 표시 같은 UI 반영 경로를 확인할 수 있습니다.",
      ],
    },
  },
  DIAGNOSTIC_SESSION: {
    command: "DIAGNOSTIC_SESSION",
    label: "외부 진단 세션",
    terminalCommand: "cansend vcan0 7DF#0210030000000000",
    frame: {
      canId: "0x7DF",
      dlc: 8,
      data: ["02", "10", "03", "00", "00", "00", "00", "00"],
    },
    context: {
      command: "DIAGNOSTIC_SESSION",
      source: "obd",
      target: "ids",
      route: ["obd", "ids", "gateway"],
      meaning: "External diagnostic request",
      action: "DIAGNOSTIC_SESSION",
    },
    processing: {
      filterResult: "ACCEPT",
      executionResult: "PENDING",
    },
    monitoring: {
      idsObserved: true,
      status: "NORMAL",
    },
    ui: {
      title: "OBD diagnostic path",
      vehicleStatus: "외부 진단 세션 요청",
      busStatus: "Training OBD-II -> IDS ECU -> Gateway ECU 경로 강조",
      effects: [
        "외부 진단/패킷 주입은 Training OBD-II 포트에서 시작됩니다.",
        "진단 경로는 IDS ECU를 거쳐 Gateway ECU 방향으로 이어집니다.",
      ],
    },
  },
}

export const CAN_MESSAGE_CATALOG = Object.fromEntries(
  Object.values(CAN_COMMAND_CATALOG).map((definition) => [
    definition.frame.canId,
    {
      command: definition.command,
      target: definition.context.target,
      meaning: definition.context.meaning,
      action: definition.context.action,
    },
  ]),
) as Record<
  string,
  {
    command: CanCommand
    target: CanNodeId
    meaning: string
    action: string
  }
>

export const NORMAL_CAN_COMMANDS: CanCommand[] = [
  "DOOR_LOCK",
  "TRUNK_OPEN",
  "DASHBOARD_SYNC",
  "DIAGNOSTIC_SESSION",
]
