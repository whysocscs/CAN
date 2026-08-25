import type { CSSProperties } from "react"
import { VEHICLE_TOPOLOGY_BY_ID } from "./vehicleTopology"
import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowPresentation,
} from "./vehicleFlowTypes"

type FlowNodeState =
  | "idle"
  | "queued"
  | "active"
  | "passed"
  | "effect"
  | "rejected"
  | "cancelled"

interface VehicleFlowRailProps {
  scenarioTitle: string
  route: readonly VehicleFlowNodeId[]
  playback: VehicleFlowPlaybackSnapshot
  selectedNodeId?: VehicleFlowNodeId
  accent: string
  presentation?: VehicleFlowPresentation
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
  if (playback.phase === "cancelled" && index === playback.segmentIndex) {
    return "cancelled"
  }
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

function railNodes(route: readonly VehicleFlowNodeId[]): RailNode[] {
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
  if (state === "cancelled") return "취소됨"
  if (state === "queued") return "대기 중"
  return "대기"
}

function idsDisplay(verdict: "NORMAL" | "ALERT"): string {
  return verdict === "NORMAL"
    ? "IDS NORMAL · 관찰됨 · Toy 규칙 경보 없음"
    : "IDS ALERT · 관찰/탐지됨 · 차단 근거 없음"
}

function FlowNode({
  node,
  state,
  selected,
}: {
  node: RailNode
  state: FlowNodeState
  selected: boolean
}) {
  const currentStep = state === "active"
    || state === "effect"
    || state === "rejected"
    || state === "cancelled"
  return (
    <li
      className="vehicle-flow-rail__node"
      data-node-id={node.id}
      data-flow-state={state}
      data-selected={selected ? "true" : undefined}
      aria-current={currentStep ? "step" : selected ? "location" : undefined}
      aria-label={`${node.label} · ${nodeStatus(state)}`}
    >
      <strong>{node.label}</strong>
      <span>{nodeStatus(state)}</span>
    </li>
  )
}

export default function VehicleFlowRail({
  scenarioTitle,
  route,
  playback,
  selectedNodeId,
  accent,
  presentation,
}: VehicleFlowRailProps) {
  const trace = playback.trace
  const displayRoute = trace
    ? trace.route.filter((nodeId) => nodeId !== "terminal")
    : route
  const showSelection =
    playback.phase === "idle" || playback.phase === "complete"

  return (
    <section
      className="vehicle-flow-rail"
      style={{ "--vehicle-route-accent": accent } as CSSProperties}
      aria-label={`${scenarioTitle} command timeline`}
    >
      <ol className="vehicle-flow-rail__nodes" aria-label={`${scenarioTitle} command flow`}>
        {railNodes(displayRoute).map((node) => (
          <FlowNode
            key={node.id}
            node={node}
            state={nodeState(node.id, playback)}
            selected={showSelection && node.id === selectedNodeId}
          />
        ))}
      </ol>
      <div className="vehicle-flow-rail__hud">
        <span className="vehicle-flow-rail__mode">
          교육용 처리/관찰 순서 · slow-motion trace
        </span>
        <span className="vehicle-flow-rail__qualifier">교육용 논리 위치 · 실제 OEM 배치 아님</span>
        <code>{presentation?.commandLabel ?? trace?.commandLabel ?? "명령 대기 중"}</code>
        {presentation ? (
          <>
            <span>Frame {presentation.traceIndex + 1}/{presentation.traceCount}</span>
            {presentation.canId ? <code>{presentation.canId}</code> : null}
            <span>DLC {presentation.dlc}</span>
            {presentation.data.length ? (
              <code>DATA {presentation.data.join(" ")}</code>
            ) : null}
            {presentation.currentTransition ? (
              <span>{presentation.currentTransition}</span>
            ) : null}
            {presentation.ecuVerdict ? (
              <span>ECU · {presentation.ecuVerdict}</span>
            ) : null}
            {presentation.idsVerdict ? (
              <span>{idsDisplay(presentation.idsVerdict)}</span>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
