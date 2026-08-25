// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { playingDoorSnapshotAtGateway } from "../vehicle/vehicleFlowTestFixtures"
import type { VehicleFlowPresentation } from "../vehicle/vehicleFlowTypes"

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

const presentation: VehicleFlowPresentation = {
  commandLabel: "script line two",
  phase: "playing",
  traceIndex: 1,
  traceCount: 3,
  canId: "0x456",
  dlc: 4,
  data: ["01", "01", "10", "B5"],
  currentTransition: "Toy Gateway -> Toy Body ECU",
  currentNodeId: "gateway",
  outcome: null,
  stoppedAt: null,
  effectTarget: null,
  effectApplied: false,
  ecuVerdict: null,
  idsVerdict: "ALERT",
  nodeFeedback: {
    nodeId: "gateway",
    title: "Toy Gateway",
    status: "PROCESSING",
    detail: "가상 CAN 경로가 다음 교육용 노드로 진행 중입니다.",
    source: "교육용 분석",
    persist: false,
  },
}

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

  it("forwards the shared playback snapshot and presentation to the network viewport", () => {
    render(
      <DoorAttackVehicle
        playback={playingDoorSnapshotAtGateway}
        presentation={presentation}
      />,
    )

    expect(viewport.props?.playback).toBe(playingDoorSnapshotAtGateway)
    expect(viewport.props?.presentation).toBe(presentation)
  })
})
