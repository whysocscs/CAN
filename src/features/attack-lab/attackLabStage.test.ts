import { describe, expect, it } from "vitest"
import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"
import { deriveAttackStageIndex } from "./attackLabStage"

const inject = (route: VehicleFlowTrace["route"]): VehicleFlowTrace => ({
  traceId: "inject",
  attemptId: "attempt-1",
  sequence: 1,
  kind: "inject",
  commandLabel: "localized output must not matter",
  commandIndex: 0,
  canId: "456",
  data: ["01"],
  route,
  stoppedAt: null,
  outcome: "EXECUTED",
  ecuVerdict: "EXECUTED",
  idsVerdict: "NORMAL",
  effectTarget: "leftDoor",
  effectState: "open",
  effectApplied: true,
})

const playback = (
  trace: VehicleFlowTrace | null,
  phase: VehicleFlowPlaybackSnapshot["phase"],
  segmentIndex = 0,
): VehicleFlowPlaybackSnapshot => ({
  playbackId: 1,
  phase,
  trace,
  traceIndex: 0,
  traceCount: trace ? 1 : 0,
  segmentIndex,
})

describe("deriveAttackStageIndex", () => {
  it("uses Door route-node thresholds before reconciling evidence after completion", () => {
    const trace = inject([
      "terminal",
      "obd",
      "ids",
      "gateway",
      "body",
      "leftDoor",
    ])

    expect(
      deriveAttackStageIndex({
        scenario: "door",
        backendStage: "증거",
        playback: playback(trace, "playing", 1),
      }),
    ).toBe(4)
    expect(
      deriveAttackStageIndex({
        scenario: "door",
        backendStage: "증거",
        playback: playback(trace, "playing", 2),
      }),
    ).toBe(5)
    expect(
      deriveAttackStageIndex({
        scenario: "door",
        backendStage: "증거",
        playback: playback(trace, "complete", 5),
      }),
    ).toBe(6)
  })

  it("does not allow Spoofing evidence to skip the inject trace", () => {
    const trace = inject([
      "terminal",
      "obd",
      "ids",
      "gateway",
      "rear",
      "tailgate",
    ])

    expect(
      deriveAttackStageIndex({
        scenario: "spoofing",
        backendStage: "EVIDENCE",
        playback: playback(trace, "playing", 3),
      }),
    ).toBe(2)
    expect(
      deriveAttackStageIndex({
        scenario: "spoofing",
        backendStage: "EVIDENCE",
        playback: playback(trace, "playing", 4),
      }),
    ).toBe(3)
    expect(
      deriveAttackStageIndex({
        scenario: "spoofing",
        backendStage: "EVIDENCE",
        playback: playback(trace, "complete", 5),
      }),
    ).toBe(4)
  })

  it("shows Replay retransmit only for an authoritative inject playback", () => {
    const trace = inject([
      "terminal",
      "obd",
      "ids",
      "gateway",
      "body",
      "leftDoor",
    ])
    const local = {
      ...trace,
      kind: "local" as const,
      route: ["terminal"] as VehicleFlowNodeId[],
    }
    const capture = {
      ...trace,
      kind: "capture" as const,
      route: ["terminal", "obd", "monitor"] as VehicleFlowNodeId[],
    }

    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "EVIDENCE",
        playback: playback(trace, "playing", 1),
      }),
    ).toBe(3)
    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "EVIDENCE",
        playback: playback(trace, "complete", 5),
      }),
    ).toBe(4)
    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "RECON",
        playback: playback(local, "playing"),
      }),
    ).toBe(0)
    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "EVIDENCE",
        playback: playback(local, "playing"),
      }),
    ).toBe(2)
    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "CAPTURE",
        playback: playback(capture, "playing", 2),
      }),
    ).toBe(1)
    expect(
      deriveAttackStageIndex({
        scenario: "replay",
        backendStage: "EVIDENCE",
        playback: playback(capture, "playing", 2),
      }),
    ).toBe(1)
  })
})
