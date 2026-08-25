import { describe, expect, it } from "vitest"
import {
  applyVehicleFlowEffect,
  parseVehicleFlowTraces,
} from "./vehicleFlowTypes"
import {
  executedDoorTrace,
  playingDoorSnapshotAtGateway,
} from "./vehicleFlowTestFixtures"
import { vehicle } from "./vehicleStore"

const validExecutedTrace = {
  traceId: "attempt-1",
  attemptId: "attempt-1",
  sequence: 1,
  kind: "inject",
  commandLabel: "cansend vcan0 456#000113B7",
  commandIndex: 1,
  canId: "0x456",
  data: ["00", "01", "13", "B7"],
  route: ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
  stoppedAt: null,
  outcome: "EXECUTED",
  ecuVerdict: "EXECUTED",
  idsVerdict: "ALERT",
  effectTarget: "leftDoor",
  effectState: "open",
  effectApplied: true,
}

const validRejectedTrace = {
  ...validExecutedTrace,
  traceId: "attempt-rejected",
  attemptId: "attempt-rejected",
  route: ["terminal", "obd", "ids", "gateway", "body"],
  stoppedAt: "body",
  outcome: "REJECTED",
  ecuVerdict: "COUNTER_REJECTED",
  effectTarget: null,
  effectState: null,
  effectApplied: false,
}

describe("vehicle flow contract", () => {
  it("accepts an ordered executed effect trace", () => {
    const parsed = parseVehicleFlowTraces([validExecutedTrace])
    expect(parsed?.[0].route.at(-1)).toBe("leftDoor")
  })

  it("rejects malformed routes and contradictory effects", () => {
    expect(parseVehicleFlowTraces([{ traceId: "bad" }])).toBeNull()
    expect(parseVehicleFlowTraces([{
      traceId: "bad-effect",
      attemptId: null,
      sequence: 1,
      kind: "inject",
      commandLabel: "bad",
      commandIndex: null,
      canId: null,
      data: [],
      route: ["terminal"],
      stoppedAt: "terminal",
      outcome: "REJECTED",
      ecuVerdict: "BLOCKED",
      idsVerdict: "ALERT",
      effectTarget: "leftDoor",
      effectState: "open",
      effectApplied: true,
    }])).toBeNull()
  })

  it("rejects rejected traces that describe or reach an effect target", () => {
    expect(parseVehicleFlowTraces([{
      ...validRejectedTrace,
      effectTarget: "leftDoor",
      effectState: "open",
    }])).toBeNull()
    expect(parseVehicleFlowTraces([{
      ...validRejectedTrace,
      route: ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
      stoppedAt: "leftDoor",
    }])).toBeNull()
    expect(parseVehicleFlowTraces([{
      ...validRejectedTrace,
      stoppedAt: "tailgate",
    }])).toBeNull()
  })

  it("applies only an executed effect trace", () => {
    vehicle.reset()
    const trace = parseVehicleFlowTraces([validExecutedTrace])![0]
    expect(applyVehicleFlowEffect(trace)).toBe(true)
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it("leaves the vehicle unchanged for a valid rejected trace", () => {
    vehicle.reset()
    const trace = parseVehicleFlowTraces([validRejectedTrace])![0]
    expect(applyVehicleFlowEffect(trace)).toBe(false)
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(vehicle.isOpen("tailgate")).toBe(false)
  })

  it("maps an executed tailgate effect to the tailgate store part", () => {
    vehicle.reset()
    const trace = parseVehicleFlowTraces([{
      ...validExecutedTrace,
      traceId: "tailgate-attempt-1",
      attemptId: "tailgate-attempt-1",
      route: ["terminal", "obd", "ids", "gateway", "rear", "tailgate"],
      effectTarget: "tailgate",
    }])![0]
    expect(applyVehicleFlowEffect(trace)).toBe(true)
    expect(vehicle.isOpen("tailgate")).toBe(true)
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it("prevents nested fixture mutation from contaminating playback fixtures", () => {
    try {
      executedDoorTrace.data[0] = "FF"
      executedDoorTrace.route[executedDoorTrace.route.length - 1] = "tailgate"
    } catch {
      // Frozen fixture mutation is intentionally rejected at runtime.
    }

    expect(executedDoorTrace.data[0]).toBe("00")
    expect(executedDoorTrace.route.at(-1)).toBe("leftDoor")
    expect(playingDoorSnapshotAtGateway.trace?.data[0]).toBe("00")
    expect(playingDoorSnapshotAtGateway.trace?.route.at(-1)).toBe("leftDoor")
  })
})
