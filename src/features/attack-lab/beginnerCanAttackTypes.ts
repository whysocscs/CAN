import type { VehicleRouteId } from "../vehicle/vehicleTopology"

export type BeginnerCanAttackScenario = "spoofing" | "replay"
export type BeginnerCanAttackDoorState = "open" | "closed"

export interface BeginnerCanAttackVehicleState {
  leftDoor: BeginnerCanAttackDoorState
  rightDoor: BeginnerCanAttackDoorState
  tailgate: BeginnerCanAttackDoorState
}

export interface BeginnerCanAttackEvidence {
  kind: string
  status: string
}

/** Public Task 1 state returned by create, get, reset, terminal, and run. */
export interface BeginnerCanAttackState {
  labId: string
  scenario: BeginnerCanAttackScenario
  sessionId: string
  generation: number
  stage: string
  targetLabel: string
  targetNode: "rear" | "body"
  effectTarget: "tailgate" | "leftDoor"
  vehicleState: BeginnerCanAttackVehicleState
  evidence: BeginnerCanAttackEvidence[]
  attemptCount: number
  lastVerdict: string | null
  completed: boolean
}

export interface BeginnerCanAttackAttempt {
  attemptId: string
  timestamp: number
  sessionId: string
  generation: number
  canId: string
  data: string[]
  verdict: string
}

export interface BeginnerCanAttackCapture {
  captureId: string
  timestamp: number
  sessionId: string
  generation: number
  fileName: string
  canId: string
  data: string[]
  verdict: string
}

export interface BeginnerCanAttackResult {
  ok: boolean
  code: string
  output: string
  attempts: BeginnerCanAttackAttempt[]
  captures: BeginnerCanAttackCapture[]
  state: BeginnerCanAttackState
  idsStatus: string | null
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
