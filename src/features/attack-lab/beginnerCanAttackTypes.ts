import type { VehicleRouteId } from "../vehicle/vehicleTopology"

export type BeginnerCanAttackScenario = "spoofing" | "replay"
export type BeginnerCanAttackDoorState = "open" | "closed"
export type BeginnerCanAttackStage =
  | "RECON"
  | "OBSERVE"
  | "CRAFT"
  | "CAPTURE"
  | "EXECUTE"
  | "EVIDENCE"
export type BeginnerCanAttackAttemptVerdict =
  | "EXECUTED"
  | "TARGET_ID_MISMATCH"
  | "LENGTH_INVALID"
  | "STATE_INVALID"
  | "STATE_NOT_ALTERED"
  | "CAPTURE_REQUIRED"
  | "CAPTURE_FILE_UNKNOWN"
  | "REPEAT_COUNT_INVALID"
  | "CAPTURE_SESSION_MISMATCH"
  | "CAPTURE_GENERATION_MISMATCH"
  | "CAPTURE_CONTENT_MISMATCH"
export type BeginnerCanAttackCaptureVerdict = "CAPTURED"
export type BeginnerCanAttackResultCode =
  | "OK"
  | "OBSERVED"
  | "CAPTURED"
  | "EXECUTED"
  | "COMMAND_TOO_LARGE"
  | "COMMAND_REJECTED"
  | "SCENARIO_COMMAND_UNSUPPORTED"
  | "UNSAFE_SYNTAX"
  | "HOST_PATH_REJECTED"
  | "FILE_NOT_FOUND"
  | "TARGET_ID_MISMATCH"
  | "LENGTH_INVALID"
  | "STATE_INVALID"
  | "STATE_NOT_ALTERED"
  | "CAPTURE_REQUIRED"
  | "CAPTURE_FILE_UNKNOWN"
  | "REPEAT_COUNT_INVALID"
  | "CAPTURE_SESSION_MISMATCH"
  | "CAPTURE_GENERATION_MISMATCH"
  | "CAPTURE_CONTENT_MISMATCH"
  | "SCRIPT_TOO_LARGE"
  | "SCRIPT_TOO_MANY_LINES"
  | "SCRIPT_COMMAND_INVALID"
  | "SCRIPT_EMPTY"
  | "SCRIPT_ACTION_COUNT_INVALID"
export type BeginnerCanAttackIdsStatus = "NORMAL" | "ALERT"

export interface BeginnerCanAttackVehicleState {
  leftDoor: BeginnerCanAttackDoorState
  rightDoor: BeginnerCanAttackDoorState
  tailgate: BeginnerCanAttackDoorState
}

export type BeginnerCanAttackEvidence =
  | { kind: "capture"; status: "recorded" }
  | { kind: "attempt"; status: BeginnerCanAttackAttemptVerdict }

/** Public Task 1 state returned by create, get, reset, terminal, and run. */
export interface BeginnerCanAttackState {
  labId: string
  scenario: BeginnerCanAttackScenario
  sessionId: string
  generation: number
  stage: BeginnerCanAttackStage
  targetLabel: string
  targetNode: "rear" | "body"
  effectTarget: "tailgate" | "leftDoor"
  vehicleState: BeginnerCanAttackVehicleState
  evidence: BeginnerCanAttackEvidence[]
  attemptCount: number
  lastVerdict:
    | BeginnerCanAttackAttemptVerdict
    | BeginnerCanAttackCaptureVerdict
    | null
  completed: boolean
}

export interface BeginnerCanAttackAttempt {
  attemptId: string
  timestamp: number
  sessionId: string
  generation: number
  canId: string
  data: string[]
  verdict: BeginnerCanAttackAttemptVerdict
}

export interface BeginnerCanAttackCapture {
  captureId: string
  timestamp: number
  sessionId: string
  generation: number
  fileName: string
  canId: string
  data: string[]
  verdict: BeginnerCanAttackCaptureVerdict
}

export interface BeginnerCanAttackResult {
  ok: boolean
  code: BeginnerCanAttackResultCode
  output: string
  attempts: BeginnerCanAttackAttempt[]
  captures: BeginnerCanAttackCapture[]
  state: BeginnerCanAttackState
  idsStatus: BeginnerCanAttackIdsStatus | null
  flowTraces?: unknown
}

export interface BeginnerCanAttackMonitorFrame {
  key: string
  timestamp: number
  channel: string
  canId: string
  data: string[]
  verdict: string
  source: "CAN stream" | "terminal" | "run" | "capture"
  sequence: number
}

export interface BeginnerCanAttackMonitorState {
  frames: BeginnerCanAttackMonitorFrame[]
  selectedKey: string | null
}

export interface BeginnerCanAttackUiConfig {
  scenario: BeginnerCanAttackScenario
  title: string
  targetSummary: "REAR ECU" | "BODY ECU"
  effectSummary: "TAILGATE" | "LEFT DOOR"
  routeId: Extract<VehicleRouteId, "spoofing" | "replay">
  targetId: "rear" | "body"
  effectId: "tailgate" | "leftDoor"
  definition: string
  stages: readonly string[]
  initialScript: string
  hints: readonly string[]
  objective: string
  accent: string
}

export interface BeginnerCanAttackTerminalEntry {
  id: number
  command: string
  output: string
  ok: boolean
}
