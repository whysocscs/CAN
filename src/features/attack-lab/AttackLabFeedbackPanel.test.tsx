// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { rejectedBodyTrace } from "../vehicle/vehicleFlowTestFixtures"
import type { VehicleFlowPlaybackSnapshot } from "../vehicle/vehicleFlowTypes"
import {
  classifyAttackLabFeedback,
  type AttackLabActionResult,
} from "./attackLabFeedback"
import AttackLabFeedbackPanel from "./AttackLabFeedbackPanel"

describe("AttackLabFeedbackPanel", () => {
  afterEach(cleanup)

  it("renders the classified route, ECU verdict, sources, and absent vehicle effect", () => {
    const result: AttackLabActionResult = {
      actionId: "door:session-1:0:terminal:1",
      scenario: "door",
      origin: "terminal",
      commandLabel: rejectedBodyTrace.commandLabel,
      ok: false,
      resultCode: "COUNTER_REJECTED",
      rawOutput: "COUNTER_REJECTED",
      traces: [rejectedBodyTrace],
    }
    const playback: VehicleFlowPlaybackSnapshot = {
      playbackId: 1,
      phase: "complete",
      trace: rejectedBodyTrace,
      traceIndex: 0,
      traceCount: 1,
      segmentIndex: rejectedBodyTrace.route.length - 1,
    }
    const feedback = classifyAttackLabFeedback({ result, playback })

    render(<AttackLabFeedbackPanel feedback={feedback} />)

    expect(
      screen.getByRole("heading", { name: "왜 이런 결과가 발생했나요?" }),
    ).toBeInTheDocument()
    expect(screen.getByText("가상 CAN 경로 입력")).toBeInTheDocument()
    expect(screen.getByText("COUNTER_REJECTED")).toBeInTheDocument()
    expect(screen.getByText("Toy ECU")).toBeInTheDocument()
    expect(screen.getByText("차량 영향").parentElement).toHaveTextContent("없음")
  })

  it("does not disclose a vehicle-effect fact before the authoritative endpoint", () => {
    const result: AttackLabActionResult = {
      actionId: "door:session-1:0:terminal:2",
      scenario: "door",
      origin: "terminal",
      commandLabel: rejectedBodyTrace.commandLabel,
      ok: false,
      resultCode: "COUNTER_REJECTED",
      rawOutput: "COUNTER_REJECTED",
      traces: [rejectedBodyTrace],
    }
    const playback: VehicleFlowPlaybackSnapshot = {
      playbackId: 2,
      phase: "playing",
      trace: rejectedBodyTrace,
      traceIndex: 0,
      traceCount: 1,
      segmentIndex: 1,
    }

    render(
      <AttackLabFeedbackPanel
        feedback={classifyAttackLabFeedback({ result, playback })}
      />,
    )

    expect(screen.queryByText("차량 영향")).not.toBeInTheDocument()
  })
})
