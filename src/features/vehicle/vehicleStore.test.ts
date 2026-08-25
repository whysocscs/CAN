import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import { vehicle } from "./vehicleStore"

const doorEvent = (
  processing: CanEvent["processing"],
  frame: CanEvent["frame"] = {
    canId: "0x101",
    dlc: 4,
    data: ["00", "01", "13", "B7"],
  },
): CanEvent => ({
  eventId: "door-state",
  timestamp: 1,
  channel: "vcan0",
  origin: "backend",
  frame,
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

  it("rejects an invalid right-door state without partially opening the left door", () => {
    const before = vehicle.getState()
    const listener = vi.fn()
    const unsubscribe = vehicle.subscribe(listener)

    try {
      expect(
        vehicle.applyCanEvent(
          doorEvent({ executionResult: "EXECUTED" }, {
            canId: "0x101",
            dlc: 2,
            data: ["00", "02"],
          }),
        ),
      ).toBe(false)
      expect(vehicle.getState()).toBe(before)
      expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it("rejects a DLC/data mismatch without mutating the snapshot or listeners", () => {
    const before = vehicle.getState()
    const listener = vi.fn()
    const unsubscribe = vehicle.subscribe(listener)

    try {
      expect(
        vehicle.applyCanEvent(
          doorEvent({ executionResult: "EXECUTED" }, {
            canId: "0x101",
            dlc: 4,
            data: ["00", "01"],
          }),
        ),
      ).toBe(false)
      expect(vehicle.getState()).toBe(before)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })
})

describe("vehicle.applyFrame DOOR_LOCK validation", () => {
  beforeEach(() => vehicle.reset())

  it.each([
    { data: ["00"], expected: { doorL: 1, doorR: 1, tailgate: 0 } },
    { data: ["00", "01"], expected: { doorL: 1, doorR: 0, tailgate: 0 } },
    {
      data: ["00", "01", "13", "B7"],
      expected: { doorL: 1, doorR: 0, tailgate: 0 },
    },
  ])("accepts the documented $data.length-byte shape", ({ data, expected }) => {
    expect(vehicle.applyFrame({ canId: "0x101", data })).toBe(true)
    expect(vehicle.getState()).toEqual(expected)
  })

  it("normalizes a prefixed legacy byte before applying the one-byte rule", () => {
    vehicle.openDoor("both")

    expect(vehicle.applyFrame({ canId: "0x101", data: "0x01" })).toBe(true)
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
  })

  it.each([
    { label: "empty", data: [] },
    { label: "three-byte", data: ["00", "01", "13"] },
    { label: "five-byte", data: ["00", "01", "13", "B7", "00"] },
  ])("rejects a $label payload without mutation", ({ data }) => {
    const before = vehicle.getState()
    const listener = vi.fn()
    const unsubscribe = vehicle.subscribe(listener)

    try {
      expect(vehicle.applyFrame({ canId: "0x101", data })).toBe(false)
      expect(vehicle.getState()).toBe(before)
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it.each([
    { label: "legacy", data: ["02"] },
    { label: "public", data: ["00", "02"] },
    { label: "Toy", data: ["00", "02", "13", "B7"] },
  ])(
    "rejects an invalid state byte in a $label payload atomically",
    ({ data }) => {
      const before = vehicle.getState()
      const listener = vi.fn()
      const unsubscribe = vehicle.subscribe(listener)

      try {
        expect(vehicle.applyFrame({ canId: "0x101", data })).toBe(false)
        expect(vehicle.getState()).toBe(before)
        expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
        expect(listener).not.toHaveBeenCalled()
      } finally {
        unsubscribe()
      }
    },
  )

  it("commits a two-door update once with only the coherent final snapshot", () => {
    const listener = vi.fn()
    const unsubscribe = vehicle.subscribe(listener)

    try {
      expect(vehicle.applyFrame({ canId: "0x101", data: ["00", "00"] })).toBe(
        true,
      )
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenLastCalledWith({
        doorL: 1,
        doorR: 1,
        tailgate: 0,
      })
    } finally {
      unsubscribe()
    }
  })
})
