import { VEHICLE_TOPOLOGY_BY_ID } from "../vehicle/vehicleTopology"
import type {
  VehicleFlowNodeFeedback,
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowPresentation,
  VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"

export type AttackLabScenarioId = "door" | "spoofing" | "replay"
export type AttackLabActionOrigin = "terminal" | "script"
export type AttackLabTerminalStream = "stdout" | "stderr" | "silent"

export interface AttackLabActionResult {
  actionId: string
  scenario: AttackLabScenarioId
  origin: AttackLabActionOrigin
  commandLabel: string
  ok: boolean
  resultCode: string
  rawOutput: string
  traces: readonly VehicleFlowTrace[]
}

export interface AttackLabTerminalTranscript {
  command: string
  stream: AttackLabTerminalStream
  text: string
}

export interface AttackLabExplanationRow {
  key: string
  label: string
  value: string
  source: "Terminal" | "Toy ECU" | "Toy IDS" | "교육용 분석"
}

export interface AttackLabFeedbackPresentation {
  flow: VehicleFlowPresentation
  terminal: AttackLabTerminalTranscript | null
  explanationRows: readonly AttackLabExplanationRow[]
  explanation: string
}

export interface AttackLabActivityEntry {
  id: string
  origin: AttackLabActionOrigin
  commandLabel: string
  resultCode: string
  frameEmitted: boolean
  stoppedAt: VehicleFlowNodeId | null
  effectApplied: boolean
}

const SAFE_REASON: Readonly<Record<string, string>> = {
  EXECUTED: "Toy ECU가 제출된 상태 프레임을 수락했습니다.",
  COUNTER_REJECTED: "rolling counter(순서 카운터)가 예상 진행 순서와 맞지 않습니다.",
  CHECKSUM_INVALID: "Checksum(검사값)이 이 프레임에 대해 유효하지 않습니다.",
  TARGET_ID_MISMATCH: "제출한 message identifier가 Toy 대상 계약과 다릅니다.",
  LENGTH_INVALID: "제출한 DLC가 Toy 대상 계약과 다릅니다.",
  STATE_INVALID: "제출한 상태 바이트가 Toy 허용 범위 밖입니다.",
  STATE_NOT_ALTERED: "제출한 상태가 Toy actuator 상태를 바꾸지 않았습니다.",
  CAPTURE_REQUIRED: "현재 실습 generation에 재생 가능한 캡처가 없습니다.",
  CAPTURE_FILE_UNKNOWN: "요청한 가상 캡처 파일이 없습니다.",
  REPEAT_COUNT_INVALID: "Replay 횟수가 로컬 preflight를 통과하지 못했습니다.",
  CAPTURE_SESSION_MISMATCH: "캡처가 다른 실습 session에 속합니다.",
  CAPTURE_GENERATION_MISMATCH: "캡처가 reset 이전 generation에 속합니다.",
  CAPTURE_CONTENT_MISMATCH: "캡처 내용이 기록된 evidence와 일치하지 않습니다.",
  COMMAND_REJECTED: "제한된 가상 터미널이 이 명령 형식을 거부했습니다.",
  SCRIPT_COMMAND_INVALID: "제한된 script grammar가 이 줄을 거부했습니다.",
}

const IDS_MEANING: Readonly<Record<"NORMAL" | "ALERT", string>> = {
  NORMAL: "관찰됨 · Toy 규칙 경보 없음",
  ALERT: "관찰/탐지됨 · 차단 근거 없음",
}

function reasonFor(resultCode: string): string {
  return SAFE_REASON[resultCode] ?? "교육용 분석에 필요한 안전한 판정 정보가 없습니다."
}

function visibleSegmentIndex(
  playback: VehicleFlowPlaybackSnapshot,
  trace: VehicleFlowTrace,
): number {
  if (playback.phase === "complete") return trace.route.length - 1
  return Math.max(0, Math.min(playback.segmentIndex, trace.route.length - 1))
}

function nodeTitle(nodeId: VehicleFlowNodeId): string {
  if (nodeId === "terminal") return "Virtual terminal"
  if (nodeId === "evidence") return "Evidence"
  if (nodeId === "monitor") return "Network Monitor"
  const node = VEHICLE_TOPOLOGY_BY_ID.get(nodeId)
  return node?.calloutLabel ?? node?.label ?? nodeId
}

function isTargetNode(nodeId: VehicleFlowNodeId): nodeId is "body" | "rear" {
  return nodeId === "body" || nodeId === "rear"
}

function nodeFeedbackFor(
  trace: VehicleFlowTrace,
  currentNodeId: VehicleFlowNodeId,
  atFinalNode: boolean,
  resultCode: string,
  phase: VehicleFlowPlaybackSnapshot["phase"],
): VehicleFlowNodeFeedback {
  const persist = phase === "complete" && atFinalNode
  const reason = reasonFor(resultCode)

  if (currentNodeId === "terminal") {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: atFinalNode && trace.outcome === "REJECTED" ? "NO VEHICLE PATH" : "PROCESSING",
      detail: atFinalNode ? reason : "가상 터미널이 구조화된 실습 결과를 준비하고 있습니다.",
      source: "Terminal",
      persist,
    }
  }

  if (currentNodeId === "evidence") {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: atFinalNode && trace.outcome === "REJECTED" ? "NO VEHICLE PATH" : "OBSERVED",
      detail: atFinalNode && trace.outcome === "REJECTED"
        ? reason
        : "Evidence가 교육용 분석에 기록되었습니다.",
      source: "교육용 분석",
      persist,
    }
  }

  if (currentNodeId === "monitor") {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: "OBSERVED",
      detail: "Network Monitor가 가상 CAN 경로 입력을 관찰했습니다.",
      source: "교육용 분석",
      persist,
    }
  }

  if (currentNodeId === "ids") {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: "OBSERVED",
      detail: trace.idsVerdict ? IDS_MEANING[trace.idsVerdict] : "Toy IDS가 프레임을 관찰 중입니다.",
      source: "Toy IDS",
      persist,
    }
  }

  if (isTargetNode(currentNodeId) && atFinalNode) {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: trace.outcome === "REJECTED" ? "REJECTED" : "ACCEPTED",
      detail: trace.ecuVerdict ?? reason,
      source: "Toy ECU",
      persist,
    }
  }

  if ((currentNodeId === "leftDoor" || currentNodeId === "tailgate") && atFinalNode) {
    return {
      nodeId: currentNodeId,
      title: nodeTitle(currentNodeId),
      status: "EFFECT APPLIED",
      detail: "Toy ECU 수락 이후 교육용 GLB 효과가 적용되었습니다.",
      source: "교육용 분석",
      persist,
    }
  }

  return {
    nodeId: currentNodeId,
    title: nodeTitle(currentNodeId),
    status: "PROCESSING",
    detail: "가상 CAN 경로가 다음 교육용 노드로 진행 중입니다.",
    source: "교육용 분석",
    persist,
  }
}

function presentationFor(
  result: AttackLabActionResult,
  playback: VehicleFlowPlaybackSnapshot,
): VehicleFlowPresentation {
  const trace = playback.trace
  if (!trace) {
    return {
      commandLabel: result.commandLabel,
      phase: playback.phase,
      traceIndex: playback.traceIndex,
      traceCount: playback.traceCount,
      canId: null,
      dlc: 0,
      data: [],
      currentTransition: null,
      currentNodeId: null,
      outcome: null,
      stoppedAt: null,
      effectTarget: null,
      effectApplied: false,
      ecuVerdict: null,
      idsVerdict: null,
      nodeFeedback: null,
    }
  }

  const segmentIndex = visibleSegmentIndex(playback, trace)
  const currentNodeId = trace.route[segmentIndex] ?? null
  const atFinalNode = segmentIndex === trace.route.length - 1
  const idsIndex = trace.route.indexOf("ids")
  const targetIndex = trace.route.findIndex(isTargetNode)
  const effectIndex = trace.effectTarget ? trace.route.indexOf(trace.effectTarget) : -1
  const nodeFeedback = currentNodeId
    ? nodeFeedbackFor(trace, currentNodeId, atFinalNode, result.resultCode, playback.phase)
    : null

  return {
    commandLabel: trace.commandLabel,
    phase: playback.phase,
    traceIndex: playback.traceIndex,
    traceCount: playback.traceCount,
    canId: trace.canId,
    dlc: trace.data.length,
    data: trace.data,
    currentTransition: !atFinalNode && currentNodeId && trace.route[segmentIndex + 1]
      ? `${nodeTitle(currentNodeId)} -> ${nodeTitle(trace.route[segmentIndex + 1])}`
      : null,
    currentNodeId,
    outcome: atFinalNode ? trace.outcome : null,
    stoppedAt: atFinalNode ? trace.stoppedAt : null,
    effectTarget: effectIndex >= 0 && segmentIndex >= effectIndex ? trace.effectTarget : null,
    effectApplied: effectIndex >= 0 && segmentIndex >= effectIndex && trace.effectApplied,
    ecuVerdict: targetIndex >= 0 && segmentIndex >= targetIndex ? trace.ecuVerdict : null,
    idsVerdict: idsIndex >= 0 && segmentIndex >= idsIndex ? trace.idsVerdict : null,
    nodeFeedback,
  }
}

function explanationRowsFor(
  result: AttackLabActionResult,
  playback: VehicleFlowPlaybackSnapshot,
  flow: VehicleFlowPresentation,
): AttackLabExplanationRow[] {
  const trace = playback.trace
  const rows: AttackLabExplanationRow[] = [{
    key: "terminal",
    label: "터미널 결과",
    value: result.ok ? "오류 없음" : "로컬 오류",
    source: "Terminal",
  }]
  if (!trace || !flow.currentNodeId) return rows

  const segmentIndex = visibleSegmentIndex(playback, trace)
  const routeInputIndex = trace.route.indexOf("obd")
  if (trace.kind === "inject" && routeInputIndex >= 0 && segmentIndex >= routeInputIndex) {
    rows.push({
      key: "route-input",
      label: "가상 CAN 경로 입력",
      value: "성공",
      source: "Terminal",
    })
  }
  if (flow.traceCount > 1) {
    rows.push({
      key: "frame",
      label: "프레임",
      value: `Frame ${flow.traceIndex + 1}/${flow.traceCount}`,
      source: "교육용 분석",
    })
  }
  if (trace.kind === "capture" && segmentIndex >= trace.route.indexOf("monitor")) {
    rows.push({
      key: "evidence",
      label: "Evidence",
      value: "캡처 관찰 결과가 기록되었습니다.",
      source: "교육용 분석",
    })
  }
  if (flow.idsVerdict) {
    rows.push({
      key: "ids",
      label: "Toy IDS 관찰",
      value: IDS_MEANING[flow.idsVerdict],
      source: "Toy IDS",
    })
  }
  if (flow.ecuVerdict) {
    rows.push({
      key: "ecu",
      label: "ECU 판정",
      value: flow.ecuVerdict,
      source: "Toy ECU",
    })
  }
  if (flow.effectApplied) {
    rows.push({
      key: "effect",
      label: "차량 영향",
      value: "적용됨",
      source: "교육용 분석",
    })
  }
  return rows
}

function explanationFor(result: AttackLabActionResult, flow: VehicleFlowPresentation): string {
  const reason = reasonFor(result.resultCode)
  if (flow.effectApplied) {
    return `${reason} 가상 CAN 경로 입력 후 교육용 차량 효과가 적용되었습니다.`
  }
  if (flow.ecuVerdict && flow.outcome === "REJECTED") {
    return `${reason} 가상 CAN 경로 입력은 성공했지만 Toy ECU가 차량 효과를 적용하지 않았습니다.`
  }
  if (flow.currentNodeId === "evidence" || flow.currentNodeId === "monitor") {
    return `${reason} Evidence가 차량 효과와 분리되어 기록되었습니다.`
  }
  return reason
}

export function classifyTerminalTranscript(
  result: AttackLabActionResult,
): AttackLabTerminalTranscript | null {
  if (result.origin !== "terminal") return null
  const emitted = result.traces.some(
    (trace) => trace.kind === "inject" && trace.route.includes("obd"),
  )
  const capturedToFile = result.traces.some((trace) => trace.kind === "capture")
  if (emitted || capturedToFile) {
    return { command: result.commandLabel, stream: "silent", text: "" }
  }
  return {
    command: result.commandLabel,
    stream: result.ok ? "stdout" : "stderr",
    text: result.rawOutput,
  }
}

export function classifyAttackLabFeedback({
  result,
  playback,
}: {
  result: AttackLabActionResult
  playback: VehicleFlowPlaybackSnapshot
}): AttackLabFeedbackPresentation {
  const flow = presentationFor(result, playback)
  return {
    flow,
    terminal: classifyTerminalTranscript(result),
    explanationRows: explanationRowsFor(result, playback, flow),
    explanation: explanationFor(result, flow),
  }
}

export function appendAttackLabActivity(
  entries: readonly AttackLabActivityEntry[],
  action: AttackLabActionResult,
): AttackLabActivityEntry[] {
  const traces = action.traces
  const finalTrace = traces.at(-1) ?? null
  const frameEmitted = traces.some(
    (trace) => trace.kind === "inject" && trace.route.includes("obd"),
  )
  return [...entries, {
    id: action.actionId,
    origin: action.origin,
    commandLabel: action.commandLabel,
    resultCode: action.resultCode,
    frameEmitted,
    stoppedAt: finalTrace?.stoppedAt ?? null,
    effectApplied: finalTrace?.effectApplied ?? false,
  }].slice(-20)
}

export function appendAttackLabTranscript(
  entries: readonly AttackLabTerminalTranscript[],
  entry: AttackLabTerminalTranscript | null,
): AttackLabTerminalTranscript[] {
  return entry ? [...entries, entry].slice(-100) : [...entries]
}
