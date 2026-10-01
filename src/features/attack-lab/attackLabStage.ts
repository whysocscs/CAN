import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
} from "../vehicle/vehicleFlowTypes"

export type AttackLabStageScenario = "door" | "spoofing" | "replay"

interface DeriveAttackStageIndexInput {
  scenario: AttackLabStageScenario
  backendStage?: string | null
  playback: VehicleFlowPlaybackSnapshot
}

const BACKEND_STAGE_INDEX: Record<AttackLabStageScenario, Record<string, number>> =
  {
    door: {
      정찰: 0,
      분석: 2,
      "Replay 실패": 3,
      "프레임 제작": 4,
      "IDS 검증": 5,
      증거: 6,
    },
    spoofing: { RECON: 0, OBSERVE: 1, CRAFT: 2, EVIDENCE: 4 },
    replay: { RECON: 0, CAPTURE: 1, EXECUTE: 2, EVIDENCE: 4 },
  }

function reached(
  snapshot: VehicleFlowPlaybackSnapshot,
  nodeId: VehicleFlowNodeId,
) {
  const index = snapshot.trace?.route.indexOf(nodeId) ?? -1
  return index >= 0 && snapshot.segmentIndex >= index
}

export function deriveAttackStageIndex({
  scenario,
  backendStage,
  playback,
}: DeriveAttackStageIndexInput): number {
  const baseline = BACKEND_STAGE_INDEX[scenario][backendStage ?? ""] ?? 0
  const trace = playback.trace
  if (!trace || playback.phase !== "playing") return baseline
  if (scenario === "door" && trace.kind === "inject")
    return reached(playback, "ids") ? 5 : 4
  if (scenario === "spoofing" && trace.kind === "inject")
    return reached(playback, "rear") ? 3 : 2
  if (scenario === "replay") {
    if (trace.kind === "inject") return 3
    return trace.kind === "capture"
      ? Math.min(baseline, 1)
      : Math.min(baseline, 2)
  }
  return baseline
}
