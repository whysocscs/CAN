// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import AttackStageRail from "./AttackStageRail"

describe("AttackStageRail", () => {
  afterEach(cleanup)

  it("renders segmented stage markers and connectors without putting lines behind labels", () => {
    render(
      <AttackStageRail
        stages={["정찰", "캡처", "분석", "제작", "증거"]}
        currentIndex={1}
      />,
    )

    const list = screen.getByRole("list", { name: "공격 단계" })
    expect(within(list).getAllByTestId("attack-stage-marker")).toHaveLength(5)
    expect(within(list).getAllByTestId("attack-stage-connector")).toHaveLength(
      4,
    )
    expect(screen.getByText("캡처").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    )
    expect(screen.getByText("정찰").closest("li")).toHaveAttribute(
      "data-state",
      "complete",
    )
    expect(screen.getByText("분석").closest("li")).toHaveAttribute(
      "data-state",
      "next",
    )

    for (const connector of within(list).getAllByTestId(
      "attack-stage-connector",
    )) {
      expect(connector.parentElement?.tagName).toBe("LI")
      expect(connector.nextElementSibling?.textContent).not.toBe("")
    }
  })

  it("keeps seven-stage labels as accessible ordered steps", () => {
    render(
      <AttackStageRail
        stages={["정찰", "캡처", "분석", "실패", "제작", "검증", "증거"]}
        currentIndex={5}
      />,
    )

    const list = screen.getByRole("list", { name: "공격 단계" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(7)
    expect(within(list).getAllByTestId("attack-stage-marker")).toHaveLength(7)
    expect(within(list).getAllByTestId("attack-stage-connector")).toHaveLength(
      6,
    )
    expect(screen.getByText("검증").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    )
  })
})
