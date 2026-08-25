// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { playingDoorSnapshotAtGateway } from "../vehicle/vehicleFlowTestFixtures"

const viewport = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}))

vi.mock("../vehicle/VehicleNetworkViewport", () => ({
  default: (props: Record<string, unknown>) => {
    viewport.props = props
    return <div aria-label="Toy Vehicle 3D view" />
  },
}))
vi.mock("../vehicle/useCanVehicleStream", () => {
  throw new Error("DoorAttackVehicle must not import or own the CAN stream")
})

import DoorAttackVehicle from "./DoorAttackVehicle"

describe("DoorAttackVehicle topology selection", () => {
  afterEach(() => {
    cleanup()
    viewport.props = undefined
  })

  it("selects the Door route, Body ECU target, and left-door GLB effect", () => {
    render(<DoorAttackVehicle currentStage="분석" />)

    expect(screen.getByLabelText("Toy Vehicle 3D view")).toBeInTheDocument()
    expect(viewport.props).toMatchObject({
      route: ["obd", "ids", "gateway", "body", "leftDoor"],
      targetId: "body",
      effectId: "leftDoor",
      scenarioTitle: "Door attack route",
      currentNodeId: "gateway",
    })
  })

  it("forwards the shared playback snapshot to the network viewport", () => {
    render(<DoorAttackVehicle playback={playingDoorSnapshotAtGateway} />)

    expect(viewport.props?.playback).toBe(playingDoorSnapshotAtGateway)
  })
})
