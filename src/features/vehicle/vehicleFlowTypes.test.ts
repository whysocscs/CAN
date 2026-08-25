import { describe, expect, it } from "vitest"
import {
  applyVehicleFlowEffect,
  parseVehicleFlowTraces,
} from "./vehicleFlowTypes"
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

  it("applies only an executed effect trace", () => {
    vehicle.reset()
    const trace = parseVehicleFlowTraces([validExecutedTrace])![0]
    expect(applyVehicleFlowEffect(trace)).toBe(true)
    expect(vehicle.isOpen("doorL")).toBe(true)
  })
})
