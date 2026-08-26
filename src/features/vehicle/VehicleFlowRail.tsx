import type { CSSProperties } from "react"
import { VEHICLE_TOPOLOGY_BY_ID } from "./vehicleTopology"
import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackMode,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowPresentation,
} from "./vehicleFlowTypes"

type FlowNodeState = "idle" | "queued" | "active" | "passed" | "effect" | "rejected" | "cancelled"

interface VehicleFlowRailProps {
  scenarioTitle: string
  route: readonly VehicleFlowNodeId[]
  playback: VehicleFlowPlaybackSnapshot
  selectedNodeId?: VehicleFlowNodeId
  accent: string
  presentation?: VehicleFlowPresentation
  reducedMotion?: boolean
  isPaused?: boolean
  onPause?: () => void
  onResume?: () => void
  onNextStep?: () => void
  playbackMode?: VehicleFlowPlaybackMode
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
    playback.trace?.outcome === "REJECTED" &&
    playback.trace.stoppedAt === nodeId &&
    playback.segmentIndex >= index
  )
    return "rejected"
  if (
    playback.trace?.effectApplied &&
    playback.trace.effectTarget === nodeId &&
    playback.segmentIndex >= index
  )
    return "effect"
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

function playbackStatus(
  phase: VehicleFlowPlaybackSnapshot["phase"],
  isPaused: boolean,
  playbackMode: VehicleFlowPlaybackMode,
): string {
  if (phase === "playing") {
    if (playbackMode === "step") return "단계 진행 대기"
    return isPaused ? "일시정지됨" : "자동 재생 중"
  }
  if (phase === "complete") return "재생 완료"
  if (phase === "cancelled") return "재생 취소됨"
  return "재생 대기"
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
  const currentStep =
    state === "active" ||
    state === "effect" ||
    state === "rejected" ||
    state === "cancelled"
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
  reducedMotion = false,
  isPaused = false,
  onPause,
  onResume,
  onNextStep,
  playbackMode = "auto",
}: VehicleFlowRailProps) {
  const trace = playback.trace
  const displayRoute = trace
    ? trace.route.filter((nodeId) => nodeId !== "terminal")
    : route
  const showSelection =
    playback.phase === "idle" || playback.phase === "complete"
  const playbackStatusLabel = playbackStatus(
    playback.phase,
    isPaused,
    playbackMode,
  )
  const currentNodeId = trace?.route[playback.segmentIndex] ?? null
  const nextNodeId = trace?.route[playback.segmentIndex + 1] ?? null
  const guidedFeedback =
    playbackMode === "step" ? presentation?.nodeFeedback : null
  const accessibleDetail =
    trace && currentNodeId
      ? `Frame ${playback.traceIndex + 1}/${playback.traceCount} · 현재 장치 ${flowNodeLabel(currentNodeId)} · 상태 ${playbackStatusLabel}`
      : `Frame 없음 · 현재 장치 없음 · 상태 ${playbackStatusLabel}`
  const liveStatus =
    playbackMode === "step" && trace && currentNodeId
      ? `Frame ${playback.traceIndex + 1}/${playback.traceCount} · 단계 ${playback.segmentIndex + 1}/${trace.route.length} · 현재 장치 ${flowNodeLabel(currentNodeId)} · 상태 ${playbackStatusLabel}`
      : `재생 상태: ${playbackStatusLabel}`

  return (
    <section
      className="vehicle-flow-rail"
      style={{ "--vehicle-route-accent": accent } as CSSProperties}
      aria-label={`${scenarioTitle} command timeline`}
    >
      <span className="sr-only">{accessibleDetail}</span>
      <span className="sr-only" role="status">
        {liveStatus}
      </span>
      <ol
        className="vehicle-flow-rail__nodes"
        aria-label={`${scenarioTitle} command flow`}
      >
        {railNodes(displayRoute).map((node) => (
          <FlowNode
            key={node.id}
            node={node}
            state={nodeState(node.id, playback)}
            selected={showSelection && node.id === selectedNodeId}
          />
        ))}
      </ol>
      {trace && guidedFeedback ? (
        <section
          className="vehicle-flow-rail__guided-cause"
          aria-label="초보자 단계 설명"
        >
          <div className="vehicle-flow-rail__guided-progress">
            <strong>
              Frame {playback.traceIndex + 1}/{playback.traceCount}
            </strong>
            <span>
              단계 {playback.segmentIndex + 1}/{trace.route.length}
            </span>
          </div>
          <div className="vehicle-flow-rail__guided-detail">
            <span>
              <strong>{guidedFeedback.title}</strong>
              <b>{guidedFeedback.status}</b>
            </span>
            <p>{guidedFeedback.detail}</p>
          </div>
          <div className="vehicle-flow-rail__guided-meta">
            <span>근거 · {guidedFeedback.source}</span>
            <span>
              {nextNodeId
                ? `다음 · ${flowNodeLabel(nextNodeId)}`
                : "마지막 단계 · 결과 확인"}
            </span>
            <code>{trace.commandLabel}</code>
          </div>
        </section>
      ) : null}
      <div className="vehicle-flow-rail__hud">
        {onNextStep && playbackMode === "step" ? (
          <div
            className="vehicle-flow-rail__controls vehicle-flow-rail__controls--step"
            role="group"
            aria-label="3D 흐름 재생 제어"
          >
            <span>{playbackStatusLabel}</span>
            <button
              type="button"
              disabled={playback.phase !== "playing" || !isPaused}
              onClick={onNextStep}
            >
              한 단계 진행
            </button>
          </div>
        ) : onPause && onResume && onNextStep ? (
          <div
            className="vehicle-flow-rail__controls"
            role="group"
            aria-label="3D 흐름 재생 제어"
          >
            <span>{playbackStatusLabel}</span>
            <button
              type="button"
              disabled={playback.phase !== "playing"}
              onClick={isPaused ? onResume : onPause}
            >
              {isPaused ? "계속 재생" : "일시정지"}
            </button>
            <button
              type="button"
              disabled={playback.phase !== "playing" || !isPaused}
              onClick={onNextStep}
            >
              한 단계 진행
            </button>
          </div>
        ) : null}
        <span className="vehicle-flow-rail__mode">
          {playbackMode === "step"
            ? "초보자용 · 장치별 수동 진행"
            : reducedMotion
              ? "실습자용 · 정적 단계 전환 · reduced motion"
              : "실습자용 · 자동 slow-motion trace"}
        </span>
        <span className="vehicle-flow-rail__qualifier">
          교육용 논리 위치 · 실제 OEM 배치 아님
        </span>
        <code>
          {presentation?.commandLabel ?? trace?.commandLabel ?? "명령 대기 중"}
        </code>
        {presentation ? (
          <>
            <span>
              Frame {presentation.traceIndex + 1}/{presentation.traceCount}
            </span>
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
