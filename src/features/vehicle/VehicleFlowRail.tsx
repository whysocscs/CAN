import type { CSSProperties } from "react"
import {
  VEHICLE_TOPOLOGY_BY_ID,
  type VehicleTopologyNodeId,
} from "./vehicleTopology"
import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "./vehicleFlowTypes"

type FlowNodeState = "idle" | "queued" | "active" | "passed" | "effect" | "rejected"

interface VehicleFlowRailProps {
  scenarioTitle: string
  route: readonly VehicleTopologyNodeId[]
  playback: VehicleFlowPlaybackSnapshot
  accent: string
}

interface RailNode {
  id: VehicleFlowNodeId
  label: string
}

const TERMINAL_NODE: RailNode = { id: "terminal", label: "Lab Terminal" }

function flowNodeLabel(nodeId: VehicleFlowNodeId): string {
  if (nodeId === "terminal") return TERMINAL_NODE.label
  if (nodeId === "evidence") return "Evidence Log"
  if (nodeId === "monitor") return "CAN Monitor"
  return VEHICLE_TOPOLOGY_BY_ID.get(nodeId)?.label ?? nodeId
}

function nodeState(
  nodeId: VehicleFlowNodeId,
  playback: VehicleFlowPlaybackSnapshot,
): FlowNodeState {
  const index = playback.trace?.route.indexOf(nodeId) ?? -1
  if (index < 0 || playback.phase === "idle") return "idle"
  if (
    playback.trace?.outcome === "REJECTED"
    && playback.trace.stoppedAt === nodeId
    && playback.segmentIndex >= index
  ) return "rejected"
  if (
    playback.trace?.effectApplied
    && playback.trace.effectTarget === nodeId
    && playback.segmentIndex >= index
  ) return "effect"
  if (index < playback.segmentIndex) return "passed"
  if (index === playback.segmentIndex) return "active"
  return "queued"
}

function railNodes(route: readonly VehicleTopologyNodeId[]): RailNode[] {
  return [
    TERMINAL_NODE,
    ...route.map((id) => ({
      id,
      label: flowNodeLabel(id),
    })),
  ]
}

function nodeStatus(state: FlowNodeState): string {
  if (state === "active") return "현재 처리 중"
  if (state === "passed") return "통과"
  if (state === "effect") return "효과 적용"
  if (state === "rejected") return "거부됨"
  if (state === "queued") return "대기 중"
  return "대기"
}

function idsVerdict(trace: VehicleFlowTrace | null): string {
  if (trace?.idsVerdict === "ALERT") return "IDS · ALERT · 탐지됨, 차단하지 않음"
  if (trace?.idsVerdict === "NORMAL") return "IDS · NORMAL · 탐지되지 않음"
  return "IDS · 판정 없음"
}

function ecuVerdict(trace: VehicleFlowTrace | null): string {
  return `ECU · ${trace?.ecuVerdict ?? "판정 없음"}`
}

function rejectionText(trace: VehicleFlowTrace | null): string | null {
  if (trace?.outcome !== "REJECTED" || !trace.stoppedAt) return null
  return `${flowNodeLabel(trace.stoppedAt)}에서 거부`
}

function liveAnnouncement(playback: VehicleFlowPlaybackSnapshot): string {
  const trace = playback.trace
  if (!trace || playback.phase === "idle") return ""
  if (playback.phase === "playing") {
    return `교육용 slow-motion trace 시작: ${trace.commandLabel}`
  }
  if (playback.phase === "complete") {
    return `교육용 slow-motion trace 결과: ${trace.outcome}`
  }
  if (playback.phase === "cancelled") {
    return "교육용 slow-motion trace 취소됨"
  }
  return ""
}

function FlowNode({
  node,
  state,
}: {
  node: RailNode
  state: FlowNodeState
}) {
  return (
    <li className="vehicle-flow-rail__node" data-flow-state={state}>
      <strong>{node.label}</strong>
      <span>{nodeStatus(state)}</span>
    </li>
  )
}

export default function VehicleFlowRail({
  scenarioTitle,
  route,
  playback,
  accent,
}: VehicleFlowRailProps) {
  const trace = playback.trace
  const rejection = rejectionText(trace)

  return (
    <section
      className="vehicle-flow-rail"
      style={{ "--vehicle-route-accent": accent } as CSSProperties}
      aria-label={`${scenarioTitle} command timeline`}
    >
      <ol className="vehicle-flow-rail__nodes" aria-label={`${scenarioTitle} command flow`}>
        {railNodes(route).map((node) => (
          <FlowNode key={node.id} node={node} state={nodeState(node.id, playback)} />
        ))}
      </ol>
      <div className="vehicle-flow-rail__hud">
        <span className="vehicle-flow-rail__mode">교육용 slow-motion trace</span>
        <code>{trace?.commandLabel ?? "명령 대기 중"}</code>
        <span>{ecuVerdict(trace)}</span>
        <span>{idsVerdict(trace)}</span>
        {rejection ? <strong>{rejection}</strong> : null}
      </div>
      <p className="vehicle-flow-rail__announcement" aria-live="polite" aria-atomic="true">
        {liveAnnouncement(playback)}
      </p>
    </section>
  )
}
