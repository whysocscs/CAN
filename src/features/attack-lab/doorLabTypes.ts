export type DoorLabStage = "정찰" | "분석" | "Replay 실패" | "프레임 제작" | "IDS 검증" | "증거"
export type DoorLabMessageContractStatus = "UNKNOWN" | "OBSERVED" | "INFERRED"
export type DoorLabDoorState = "open" | "closed"
export type DoorLabIdsStatus = "NORMAL" | "ALERT"

export interface DoorLabVehicleState {
  leftDoor: DoorLabDoorState
  rightDoor: DoorLabDoorState
}

export interface DoorLabEvidence {
  kind: "capture" | "attempt" | "toy_ids"
  status: "observed" | "recorded" | "normal"
}

/** Public state returned by POST /sessions, GET /sessions/{id}, and reset. */
export interface DoorLabSessionState {
  sessionId: string
  generation: number
  stage: DoorLabStage
  targetLabel: "Toy Body ECU"
  messageContractStatus: DoorLabMessageContractStatus
  vehicleState: DoorLabVehicleState
  evidence: DoorLabEvidence[]
  attemptCount: number
  completed: boolean
}

/** One CAN frame observed or attempted by the restricted Toy ECU lab. */
export interface DoorLabFrameAttempt {
  attemptId: string
  timestamp: number
  canId: string
  data: string[]
  verdict: string
}

export interface DoorLabTerminalResult {
  ok: boolean
  code: string
  output: string
  frames: DoorLabFrameAttempt[]
}

export interface DoorLabScriptResult {
  attempts: DoorLabFrameAttempt[]
  idsStatus: DoorLabIdsStatus
  state: DoorLabSessionState
  error: string | null
}

/** A literal candump -L record parsed for the lab monitor. */
export interface DoorLabCapturedFrame {
  timestamp: number
  channel: string
  frame: {
    canId: string
    dlc: number
    data: string[]
  }
}
