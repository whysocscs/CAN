// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  captureTrace,
  executedAlertTrace,
  rejectedBodyTrace,
} from "./vehicleFlowTestFixtures"
import type { VehicleFlowPresentation } from "./vehicleFlowTypes"
import VehicleFlowRail from "./VehicleFlowRail"

afterEach(cleanup)

const structuredPresentation: VehicleFlowPresentation = {
  commandLabel: "cansend vcan0 learner-frame-two",
  phase: "playing",
  traceIndex: 1,
  traceCount: 3,
  canId: "0x456",
  dlc: 4,
  data: ["01", "01", "10", "B5"],
  currentTransition: "Toy Gateway -> Toy Body ECU",
  currentNodeId: "body",
  outcome: "REJECTED",
  stoppedAt: "body",
  effectTarget: null,
  effectApplied: false,
  ecuVerdict: "COUNTER_REJECTED",
  idsVerdict: "ALERT",
  nodeFeedback: {
    nodeId: "body",
    title: "Toy Body ECU",
    status: "REJECTED",
    detail: "rolling counter(순서 카운터)가 예상 진행 순서와 맞지 않습니다.",
    source: "Toy ECU",
    persist: false,
  },
}

describe("VehicleFlowRail", () => {
  it.each([
    [false, "교육용 처리/관찰 순서 · slow-motion trace"],
    [true, "정적 최종 상태 · reduced motion"],
  ] as const)("reports the actual motion mode when reducedMotion is %s", (
    reducedMotion,
    label,
  ) => {
    render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 0,
          phase: "idle",
          trace: null,
          traceIndex: 0,
          traceCount: 0,
          segmentIndex: 0,
        }}
        reducedMotion={reducedMotion}
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText(label)).toBeInTheDocument()
  })

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
    expect(screen.getByText("Toy IDS").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    )
    expect(screen.getByText("Toy IDS").closest("li"))
      .toHaveAccessibleName(/Toy IDS.*현재 처리 중/)
    expect(screen.getByText("Toy Body ECU").closest("li")).not.toHaveAttribute(
      "data-selected",
    )
    expect(
      screen
        .getByRole("list", { name: "Door attack route command flow" })
        .querySelectorAll('[data-selected="true"]'),
    ).toHaveLength(0)
  })

  it("shows complete structured HUD evidence without solution hints", () => {
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
        presentation={structuredPresentation}
        accent="#d94b4b"
      />,
    )
    const rail = screen.getByRole("list", { name: "Door attack route command flow" })
    expect(within(rail).getByText("Lab Terminal")).toBeInTheDocument()
    expect(within(rail).getByText("Toy IDS").closest("li")).toHaveAttribute(
      "data-flow-state",
      "active",
    )
    expect(screen.getByText("Frame 2/3")).toBeInTheDocument()
    expect(screen.getByText(/cansend vcan0/)).toBeInTheDocument()
    expect(screen.getByText(/0x456/)).toBeInTheDocument()
    expect(screen.getByText(/DLC 4/)).toBeInTheDocument()
    expect(screen.getByText("DATA 01 01 10 B5")).toBeInTheDocument()
    expect(screen.getByText(/Gateway.*Body ECU/)).toBeInTheDocument()
    expect(screen.getByText(/COUNTER_REJECTED/)).toBeInTheDocument()
    expect(screen.getByText(/관찰\/탐지됨.*차단 근거 없음/)).toBeInTheDocument()
    expect(screen.queryByText(/expected counter/i)).not.toBeInTheDocument()
    expect(screen.queryByText("cansend vcan0 456#000113B7"))
      .not.toBeInTheDocument()
  })

  it("keeps the final ECU rejection hidden from Terminal until Body ECU arrival", () => {
    const terminalPresentation: VehicleFlowPresentation = {
      ...structuredPresentation,
      currentTransition: null,
      currentNodeId: "terminal",
      outcome: null,
      stoppedAt: null,
      ecuVerdict: null,
      idsVerdict: null,
      nodeFeedback: {
        nodeId: "terminal",
        title: "Lab Terminal",
        status: "PROCESSING",
        detail: "명령을 교육용 실행 흐름에 등록했습니다.",
        source: "Terminal",
        persist: false,
      },
    }
    const view = render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 2,
          phase: "playing",
          trace: rejectedBodyTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 0,
        }}
        presentation={terminalPresentation}
        accent="#d94b4b"
      />,
    )

    expect(screen.queryByText("Toy Body ECU에서 거부")).not.toBeInTheDocument()
    expect(screen.queryByText(/COUNTER_REJECTED/)).not.toBeInTheDocument()

    view.rerender(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 2,
          phase: "playing",
          trace: rejectedBodyTrace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex: 4,
        }}
        presentation={structuredPresentation}
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText("ECU · COUNTER_REJECTED")).toBeInTheDocument()
    expect(screen.queryByText("Toy Body ECU에서 거부")).not.toBeInTheDocument()
  })

  it("marks a reached target rejection without duplicated trace outcome copy", () => {
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
        presentation={{ ...structuredPresentation, phase: "complete" }}
        accent="#d94b4b"
      />,
    )
    expect(screen.getByText("ECU · COUNTER_REJECTED")).toBeInTheDocument()
    expect(screen.queryByText("Toy Body ECU에서 거부")).not.toBeInTheDocument()
    expect(screen.getByText("Toy Body ECU").closest("li")).toHaveAttribute(
      "data-flow-state",
      "rejected",
    )
    expect(screen.getByText("Toy Body ECU").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    )
    expect(screen.getByText("Toy Body ECU").closest("li"))
      .toHaveAccessibleName(/Toy Body ECU.*거부됨/)
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

  it("keeps per-segment and per-trace HUD changes out of live announcements", () => {
    const secondTrace = {
      ...executedAlertTrace,
      traceId: "attempt-second",
      attemptId: "attempt-second",
      commandLabel: "second synthetic script line",
      sequence: 2,
    }
    const view = render(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 7,
          phase: "playing",
          trace: executedAlertTrace,
          traceIndex: 0,
          traceCount: 2,
          segmentIndex: 0,
        }}
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText(executedAlertTrace.commandLabel)).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).not.toBeInTheDocument()

    view.rerender(
      <VehicleFlowRail
        scenarioTitle="Door attack route"
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        playback={{
          playbackId: 7,
          phase: "playing",
          trace: secondTrace,
          traceIndex: 1,
          traceCount: 2,
          segmentIndex: 3,
        }}
        accent="#d94b4b"
      />,
    )

    expect(screen.getByText("second synthetic script line")).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).not.toBeInTheDocument()
  })
})
