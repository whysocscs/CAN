// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import { vehicle } from "./vehicleStore"

const backend = vi.hoisted(() => ({
  connect: vi.fn(),
  options: undefined as { onEvent: (event: CanEvent) => void } | undefined,
  disconnect: vi.fn(),
}))

vi.mock("../can/events/backendProvider", () => ({
  connectCanStream: backend.connect,
}))

import { useCanVehicleStream } from "./useCanVehicleStream"

function acceptedEvent(sessionId: string): CanEvent {
  return {
    eventId: `event-${sessionId}`,
    timestamp: 1_700_000_000_123,
    channel: "vcan0",
    origin: "backend",
    frame: { canId: "0x555", dlc: 2, data: ["00", "01"] },
    lab: { labId: "door-blackbox-v1", sessionId },
    context: { command: "DOOR_LOCK" },
    processing: { filterResult: "ACCEPT", executionResult: "EXECUTED" },
    monitoring: { idsObserved: true, status: "NORMAL" },
  }
}

function Probe({
  sessionId,
  guarded = true,
}: {
  sessionId: string
  guarded?: boolean
}) {
  useCanVehicleStream({
    vehicleEventPredicate: guarded
      ? (event) => event.lab?.sessionId === sessionId
      : undefined,
  })
  return null
}

describe("useCanVehicleStream vehicle event predicate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vehicle.reset()
    backend.options = undefined
    backend.connect.mockImplementation((options) => {
      backend.options = options
      return backend.disconnect
    })
  })

  afterEach(() => cleanup())

  it("observes the current predicate without reconnecting and blocks stale vehicle mutation", () => {
    const view = render(<Probe sessionId="session-1" />)
    backend.options?.onEvent(acceptedEvent("old-session"))
    expect(vehicle.isOpen("doorL")).toBe(false)

    view.rerender(<Probe sessionId="session-2" />)
    backend.options?.onEvent(acceptedEvent("session-1"))
    expect(vehicle.isOpen("doorL")).toBe(false)
    backend.options?.onEvent(acceptedEvent("session-2"))
    expect(vehicle.isOpen("doorL")).toBe(true)
    expect(backend.connect).toHaveBeenCalledTimes(1)
  })

  it("keeps existing callers backward-compatible when no predicate is provided", () => {
    render(<Probe sessionId="unused" guarded={false} />)
    backend.options?.onEvent(acceptedEvent("any-session"))
    expect(vehicle.isOpen("doorL")).toBe(true)
  })
})
