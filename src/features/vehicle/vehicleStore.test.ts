import { beforeEach, describe, expect, it } from "vitest"
import type { CanEvent } from "../can/events/types"
import { vehicle } from "./vehicleStore"

const doorEvent = (processing: CanEvent["processing"]): CanEvent => ({
  eventId: "door-state",
  timestamp: 1,
  channel: "vcan0",
  origin: "backend",
  frame: { canId: "0x101", dlc: 4, data: ["00", "01", "13", "B7"] },
  context: { command: "DOOR_LOCK" },
  processing,
})

describe("vehicle.applyCanEvent", () => {
  beforeEach(() => vehicle.reset())

  it("does not apply a blocked door frame", () => {
    expect(vehicle.applyCanEvent(doorEvent({ executionResult: "BLOCKED" }))).toBe(false)
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
  })

  it("does not apply a dropped door frame", () => {
    expect(vehicle.applyCanEvent(doorEvent({ filterResult: "DROP" }))).toBe(false)
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
  })

  it("applies an executed 0x101 door state frame", () => {
    expect(vehicle.applyCanEvent(doorEvent({ executionResult: "EXECUTED" }))).toBe(true)
    expect(vehicle.getState()).toEqual({ doorL: 1, doorR: 0, tailgate: 0 })
  })
})
