export type CanEventOrigin = "mock" | "backend"

export type CanNodeId =
  | "gateway"
  | "body"
  | "dashboard"
  | "rear"
  | "ids"
  | "obd"

export type CanCommand =
  | "DOOR_LOCK"
  | "TRUNK_OPEN"
  | "DASHBOARD_SYNC"
  | "DIAGNOSTIC_SESSION"

export type CanFilterResult = "ACCEPT" | "DROP" | "NOT_CHECKED"
export type CanExecutionResult = "EXECUTED" | "BLOCKED" | "PENDING"
export type CanMonitoringStatus = "NORMAL" | "SUSPICIOUS" | "ALERT"

export interface CanLabMetadata {
  labId?: string
  scenario?: "spoofing" | "replay"
  sessionId?: string
  generation?: number
  attemptId?: string
  stage?: string
}

export interface CanFrameData {
  canId: string
  dlc: number
  data: string[]
}

export interface CanEvent {
  eventId: string
  timestamp: number
  channel: string
  origin: CanEventOrigin
  /**
   * 접속 직후 서버가 재생해 준 스냅샷 프레임입니다.
   * 지금 버스에서 일어난 일이 아니므로 트래픽 목록에는 넣지 않습니다.
   */
  replay?: boolean
  frame: CanFrameData
  /** Optional verdict metadata for educational lab attempts. */
  reasonCode?: string
  ruleIds?: string[]
  lab?: CanLabMetadata
  context: {
    command?: CanCommand
    source?: CanNodeId
    target?: CanNodeId
    route?: CanNodeId[]
    meaning?: string
    action?: string
  }
  processing?: {
    filterResult?: CanFilterResult
    executionResult?: CanExecutionResult
  }
  monitoring?: {
    idsObserved?: boolean
    status?: CanMonitoringStatus
  }
}

export interface CanMessageDefinition {
  command: CanCommand
  label: string
  terminalCommand: string
  frame: CanFrameData
  context: Required<Pick<CanEvent["context"], "source" | "target" | "route" | "meaning" | "action">> & {
    command: CanCommand
  }
  processing: Required<NonNullable<CanEvent["processing"]>>
  monitoring: Required<NonNullable<CanEvent["monitoring"]>>
  ui: {
    title: string
    vehicleStatus: string
    busStatus: string
    effects: string[]
  }
}

export function validateCanFrame(frame: CanFrameData) {
  if (frame.dlc < 0 || frame.dlc > 8) {
    throw new Error(`Classical CAN DLC must be between 0 and 8. Received ${frame.dlc}.`)
  }

  if (frame.dlc !== frame.data.length) {
    throw new Error(
      `CAN frame DLC/data mismatch: dlc=${frame.dlc}, data.length=${frame.data.length}.`,
    )
  }
}
