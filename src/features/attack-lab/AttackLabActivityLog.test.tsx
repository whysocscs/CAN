// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AttackLabActivityEntry } from "./attackLabFeedback"
import AttackLabActivityLog from "./AttackLabActivityLog"

describe("AttackLabActivityLog", () => {
  afterEach(cleanup)

  it("keeps local, preflight, and emitted evidence selectable without fabricating CAN rows", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const entries: AttackLabActivityEntry[] = [
      {
        id: "local-1",
        origin: "terminal",
        commandLabel: "pwd",
        resultCode: "COMMAND_REJECTED",
        frameEmitted: false,
        stoppedAt: "terminal",
        effectApplied: false,
      },
      {
        id: "preflight-1",
        origin: "terminal",
        commandLabel: "canplayer learner capture",
        resultCode: "CAPTURE_SESSION_MISMATCH",
        frameEmitted: false,
        stoppedAt: "evidence",
        effectApplied: false,
      },
      {
        id: "emitted-1",
        origin: "terminal",
        commandLabel: "cansend learner frame",
        resultCode: "COUNTER_REJECTED",
        frameEmitted: true,
        stoppedAt: "body",
        effectApplied: false,
      },
    ]

    render(
      <AttackLabActivityLog
        entries={entries}
        selectedId="preflight-1"
        onSelect={onSelect}
      />,
    )

    const scrollRegion = screen.getByRole("region", { name: "Activity log" })
    expect(scrollRegion).toHaveClass("attack-lab-activity__scroll")
    expect(within(scrollRegion).queryByRole("row")).not.toBeInTheDocument()
    expect(within(scrollRegion).getAllByText(/차량 경로 없음/)).toHaveLength(2)
    const localResult = screen.getByRole("button", { name: /COMMAND_REJECTED/ })
    const emittedResult = screen.getByRole("button", { name: /COUNTER_REJECTED/ })
    expect(localResult).toHaveTextContent("차량 경로 없음")
    expect(localResult).not.toHaveTextContent("가상 CAN 경로 입력 기록됨")
    expect(emittedResult).toHaveTextContent("가상 CAN 경로 입력 기록됨")
    expect(emittedResult).not.toHaveTextContent("CAN frame 기록됨")
    expect(
      screen.getByRole("button", { name: /CAPTURE_SESSION_MISMATCH/ }),
    ).toHaveAttribute("aria-current", "true")

    await user.click(emittedResult)
    expect(onSelect).toHaveBeenCalledWith("emitted-1")
  })
})
