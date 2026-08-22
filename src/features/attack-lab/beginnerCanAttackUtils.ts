import type { CanEvent } from "../can/events/types"
import type {
  BeginnerCanAttackAttempt,
  BeginnerCanAttackCapture,
  BeginnerCanAttackMonitorFrame,
  BeginnerCanAttackMonitorState,
  BeginnerCanAttackState,
  BeginnerCanAttackVehicleState,
} from "./beginnerCanAttackTypes"

const CANDUMP_LINE = /^\((\d+(?:\.\d+)?)\)\s+(\S+)\s+([0-9a-fA-F]+)#([0-9a-fA-F]*)$/
const MONITOR_LIMIT = 300

function formatByte(value: string): string {
  return value.replace(/^0x/i, "").toUpperCase().padStart(2, "0")
}

export function formatBeginnerFrameData(data: readonly string[]): string {
  return data.map(formatByte).join(" ")
}

export function beginnerFrameBits(data: readonly string[]): string[] {
  return data.map((byte) =>
    Number.parseInt(formatByte(byte), 16).toString(2).padStart(8, "0"),
  )
}

export function beginnerEventMatchesSession(
  event: CanEvent,
  state: Pick<
    BeginnerCanAttackState,
    "labId" | "scenario" | "sessionId" | "generation"
  > | null,
): boolean {
  return Boolean(
    state &&
      event.lab?.labId === state.labId &&
      event.lab.scenario === state.scenario &&
      event.lab.sessionId === state.sessionId &&
      event.lab.generation === state.generation &&
      event.processing?.filterResult === "ACCEPT" &&
      event.processing.executionResult === "EXECUTED",
  )
}

export function eventToBeginnerMonitorFrame(
  event: CanEvent,
): BeginnerCanAttackMonitorFrame {
  return {
    key: `event:${event.lab?.attemptId ?? event.eventId}`,
    timestamp: event.timestamp,
    channel: event.channel,
    canId: event.frame.canId,
    data: event.frame.data,
    verdict: event.reasonCode ?? event.processing?.executionResult ?? "OBSERVED",
    source: "CAN stream",
    sequence: 0,
  }
}

export function attemptsToBeginnerMonitorFrames(
  attempts: readonly BeginnerCanAttackAttempt[],
  source: "terminal" | "run",
): BeginnerCanAttackMonitorFrame[] {
  return attempts.flatMap((attempt, sequence) =>
    attempt.verdict === "EXECUTED"
      ? []
      : [{
          key: `attempt:${attempt.attemptId}`,
          timestamp: attempt.timestamp,
          channel: "vcan0",
          canId: attempt.canId,
          data: attempt.data,
          verdict: attempt.verdict,
          source,
          sequence,
        }],
  )
}

export function capturesToBeginnerMonitorFrames(
  captures: readonly BeginnerCanAttackCapture[],
): BeginnerCanAttackMonitorFrame[] {
  return captures.map((capture, sequence) => ({
    key: `capture:${capture.captureId}`,
    timestamp: capture.timestamp,
    channel: "vcan0",
    canId: capture.canId,
    data: capture.data,
    verdict: capture.verdict,
    source: "capture",
    sequence,
  }))
}

export function parseBeginnerTerminalFrames(
  output: string,
): BeginnerCanAttackMonitorFrame[] {
  return output.split(/\r?\n/).flatMap((line, sequence) => {
    const match = CANDUMP_LINE.exec(line.trim())
    if (!match) return []
    const [, rawTimestamp, channel, rawCanId, rawPayload] = match
    if (rawPayload.length % 2 !== 0) return []
    const data = rawPayload.match(/.{2}/g)?.map(formatByte) ?? []
    const timestamp = Math.round(Number.parseFloat(rawTimestamp) * 1000)
    const canId = `0x${rawCanId.toLowerCase()}`
    return [{
      key: `terminal:${timestamp}:${channel}:${canId}:${formatBeginnerFrameData(data)}:${sequence}`,
      timestamp,
      channel,
      canId,
      data,
      verdict: "OBSERVED",
      source: "terminal" as const,
      sequence,
    }]
  })
}

export function appendBeginnerMonitorFrames(
  state: BeginnerCanAttackMonitorState,
  incoming: readonly BeginnerCanAttackMonitorFrame[],
): BeginnerCanAttackMonitorState {
  if (incoming.length === 0) return state
  const byKey = new Map(state.frames.map((frame) => [frame.key, frame]))
  for (const frame of incoming) byKey.set(frame.key, frame)
  const frames = [...byKey.values()]
    .sort((left, right) =>
      left.timestamp - right.timestamp || left.sequence - right.sequence ||
      left.key.localeCompare(right.key)
    )
    .slice(-MONITOR_LIMIT)
  const selectionSurvives =
    state.selectedKey !== null && frames.some((frame) => frame.key === state.selectedKey)
  return {
    frames,
    selectedKey: selectionSurvives
      ? state.selectedKey
      : (frames.at(-1)?.key ?? null),
  }
}

export function vehicleRatiosFromBeginnerState(
  state: BeginnerCanAttackVehicleState,
) {
  return {
    doorL: state.leftDoor === "open" ? 1 : 0,
    doorR: state.rightDoor === "open" ? 1 : 0,
    tailgate: state.tailgate === "open" ? 1 : 0,
  } as const
}
