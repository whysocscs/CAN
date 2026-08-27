// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  captureTrace,
  executedAlertTrace,
  rejectedBodyTrace,
} from "./vehicleFlowTestFixtures"
import VehicleFlowRail from "./VehicleFlowRail"

afterEach(cleanup)

describe("VehicleFlowRail", () => {
  it.each(["idle", "complete"] as const)(
    "highlights the selected route node while playback is %s",
    (phase) => {
      render(
        <VehicleFlowRail
          scenarioTitle="Door attack route"
          route={["obd", "ids", "gateway", "body", "leftDoor"]}
          playback={
            phase === "idle"
              ? {
                  playbackId: 0,
                  phase,
                  trace: null,
                  traceIndex: 0,
                  traceCount: 0,
                  segmentIndex: 0,
                }
              : {
                  playbackId: 1,
                  phase,
                  trace: executedAlertTrace,
                  traceIndex: 0,
                  traceCount: 1,
                  segmentIndex: 5,
                }
          }
          selectedNodeId="gateway"
          accent="#d94b4b"
        />,
      )

      const gateway = screen.getByText("Toy Gateway").closest("li")
      expect(gateway).toHaveAttribute("data-selected", "true")
      expect(gateway).toHaveAttribute("aria-current", "location")
    },
  )

  it("lets the active playback node win over an inspected selection", () => {
    render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 1,
          phase: "playing",
          trace: executedAlertTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 2,
        }}
        selectedNodeId="body"
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText("Toy IDS").closest("li")).toHaveAttribute(
      "data-flow-state",
      "active",
    )
    expect(screen.getByText("Toy Body ECU").closest("li")).not.toHaveAttribute(
      "data-selected",
    )
    expect(
      screen
        .getByRole("list", { name: "Door attack route command flow" })
        .querySelectorAll('[data-selected="true"]'),
    ).toHaveLength(0)
  })

  it("shows the active device transition and separate verdicts", () => {
    render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 1,
          phase: "playing",
          trace: executedAlertTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 2,
        }}
        accent="#d94b4b"
      />,
    )
    const rail = screen.getByRole("list", { name: "Door attack route command flow" })
    expect(within(rail).getByText("Lab Terminal")).toBeInTheDocument()
    expect(within(rail).getByText("Toy IDS").closest("li")).toHaveAttribute(
      "data-flow-state",
      "active",
    )
    expect(screen.getByText("ECU · EXECUTED")).toBeInTheDocument()
    expect(screen.getByText("IDS · ALERT · 탐지됨, 차단하지 않음")).toBeInTheDocument()
  })

  it("marks rejection with text and a stop state", () => {
    render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 2,
          phase: "complete",
          trace: rejectedBodyTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 4,
        }}
        accent="#d94b4b"
      />,
    )
    expect(screen.getByText("Toy Body ECU에서 거부")).toBeInTheDocument()
    expect(screen.getByText("Toy Body ECU").closest("li")).toHaveAttribute(
      "data-flow-state",
      "rejected",
    )
  })

  it("marks the current node cancelled while preserving only completed nodes", () => {
    render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 4,
          phase: "cancelled",
          trace: executedAlertTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 3,
        }}
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText("Toy IDS").closest("li")).toHaveAttribute(
      "data-flow-state",
      "passed",
    )
    expect(screen.getByText("Toy Gateway").closest("li")).toHaveAttribute(
      "data-flow-state",
      "cancelled",
    )
    expect(screen.getByText("Toy Gateway").closest("li")).toHaveTextContent(
      "취소됨",
    )
    expect(screen.getByText("Toy Body ECU").closest("li")).toHaveAttribute(
      "data-flow-state",
      "queued",
    )
  })

  it("uses the active capture trace route and labels it as an educational logical path", () => {
    render(
      <VehicleFlowRail
        scenarioTitle="Capture route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 3,
          phase: "playing",
          trace: captureTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 2,
        }}
        accent="#d94b4b"
      />,
    )

    const rail = screen.getByRole("list", { name: "Capture route command flow" })
    expect(within(rail).getByText("Lab Terminal")).toBeInTheDocument()
    expect(within(rail).getByText("Training OBD-II")).toBeInTheDocument()
    expect(within(rail).getByText("CAN Monitor")).toBeInTheDocument()
    expect(within(rail).queryByText("Toy Body ECU")).not.toBeInTheDocument()
    expect(within(rail).queryByText("Left Door Effect")).not.toBeInTheDocument()
    expect(screen.getByText("교육용 논리 위치 · 실제 OEM 배치 아님")).toBeInTheDocument()
  })
})
