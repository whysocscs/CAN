import { vehicle } from "./vehicleStore"
import { VEHICLE_TOPOLOGY_BY_ID, type VehicleTopologyNodeId } from "./vehicleTopology"

export type VehicleFlowNodeId =
  | "terminal"
  | "evidence"
  | "monitor"
  | VehicleTopologyNodeId

export type VehicleFlowOutcome =
  | "LOCAL"
  | "OBSERVED"
  | "EXECUTED"
  | "REJECTED"

export interface VehicleFlowTrace {
  traceId: string
  attemptId: string | null
  sequence: number
  kind: "local" | "observe" | "capture" | "inject"
  commandLabel: string
  commandIndex: number | null
  canId: string | null
  data: string[]
  route: VehicleFlowNodeId[]
  stoppedAt: VehicleFlowNodeId | null
  outcome: VehicleFlowOutcome
  ecuVerdict: string | null
  idsVerdict: "NORMAL" | "ALERT" | null
  effectTarget: "leftDoor" | "tailgate" | null
  effectState: "open" | "closed" | null
  effectApplied: boolean
}

export interface VehicleFlowPlaybackSnapshot {
  playbackId: number
  phase: "idle" | "playing" | "complete" | "cancelled"
  trace: VehicleFlowTrace | null
  traceIndex: number
  traceCount: number
  segmentIndex: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isVehicleFlowNodeId(value: unknown): value is VehicleFlowNodeId {
  return typeof value === "string" && (
    value === "terminal"
    || value === "evidence"
    || value === "monitor"
    || VEHICLE_TOPOLOGY_BY_ID.has(value as VehicleTopologyNodeId)
  )
}

function isVehicleFlowKind(value: unknown): value is VehicleFlowTrace["kind"] {
  return value === "local"
    || value === "observe"
    || value === "capture"
    || value === "inject"
}

function isVehicleFlowOutcome(value: unknown): value is VehicleFlowOutcome {
  return value === "LOCAL"
    || value === "OBSERVED"
    || value === "EXECUTED"
    || value === "REJECTED"
}

function isIdsVerdict(value: unknown): value is VehicleFlowTrace["idsVerdict"] {
  return value === null || value === "NORMAL" || value === "ALERT"
}

function isEffectTarget(value: unknown): value is VehicleFlowTrace["effectTarget"] {
  return value === null || value === "leftDoor" || value === "tailgate"
}

function isEffectState(value: unknown): value is VehicleFlowTrace["effectState"] {
  return value === null || value === "open" || value === "closed"
}

function parseVehicleFlowTrace(value: unknown): VehicleFlowTrace | null {
  if (!isRecord(value)) return null

  const {
    traceId,
    attemptId,
    sequence,
    kind,
    commandLabel,
    commandIndex,
    canId,
    data,
    route,
    stoppedAt,
    outcome,
    ecuVerdict,
    idsVerdict,
    effectTarget,
    effectState,
    effectApplied,
  } = value

  if (
    typeof traceId !== "string"
    || typeof attemptId !== "string" && attemptId !== null
    || typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1
    || !isVehicleFlowKind(kind)
    || typeof commandLabel !== "string"
    || !isNullableInteger(commandIndex)
    || !isNullableString(canId)
    || !isStringArray(data)
    || !Array.isArray(route) || route.length === 0 || !route.every(isVehicleFlowNodeId)
    || stoppedAt !== null && !isVehicleFlowNodeId(stoppedAt)
    || !isVehicleFlowOutcome(outcome)
    || !isNullableString(ecuVerdict)
    || !isIdsVerdict(idsVerdict)
    || !isEffectTarget(effectTarget)
    || !isEffectState(effectState)
    || typeof effectApplied !== "boolean"
  ) return null

  if (
    effectApplied
    && (
      outcome !== "EXECUTED"
      || effectTarget === null
      || effectState === null
      || route.at(-1) !== effectTarget
    )
  ) return null

  if (
    outcome === "REJECTED"
    && (
      effectApplied
      || effectTarget !== null
      || effectState !== null
      || route.at(-1) === "leftDoor"
      || route.at(-1) === "tailgate"
      || stoppedAt === "leftDoor"
      || stoppedAt === "tailgate"
    )
  ) return null

  return {
    traceId,
    attemptId,
    sequence,
    kind,
    commandLabel,
    commandIndex,
    canId,
    data: [...data],
    route: [...route],
    stoppedAt,
    outcome,
    ecuVerdict,
    idsVerdict,
    effectTarget,
    effectState,
    effectApplied,
  }
}

export function parseVehicleFlowTraces(value: unknown): VehicleFlowTrace[] | null {
  if (!Array.isArray(value)) return null

  const traces = value.map(parseVehicleFlowTrace)
  return traces.some((trace) => trace === null)
    ? null
    : traces as VehicleFlowTrace[]
}

export function applyVehicleFlowEffect(trace: VehicleFlowTrace): boolean {
  if (
    trace.outcome !== "EXECUTED"
    || !trace.effectApplied
    || !trace.effectTarget
    || !trace.effectState
  ) return false
  const part = trace.effectTarget === "leftDoor" ? "doorL" : "tailgate"
  vehicle.set(part, trace.effectState === "open" ? 1 : 0)
  return true
}
