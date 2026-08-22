// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppProvider } from "../context/AppContext"
import AttackPracticePage, { type AttackRoute } from "./AttackPracticePage"

vi.mock("../features/attack-lab/DoorAttackLabPage", () => ({
  default: () => <div>Door Attack Workbench</div>,
}))
vi.mock("../features/attack-lab/BeginnerCanAttackLabPage", () => ({
  default: ({ scenario }: { scenario: string }) => <div data-testid="beginner-lab">{scenario} interactive lab</div>,
}))

describe("AttackPracticePage route switch", () => {
  afterEach(() => cleanup())

  it.each([
    ["attacks/spoofing", "spoofing interactive lab"],
    ["attacks/replay", "replay interactive lab"],
  ] as const satisfies ReadonlyArray<readonly [AttackRoute, string]>)("uses an isolated beginner workbench for %s", (route, copy) => {
    render(
      <AppProvider>
        <AttackPracticePage route={route} />
      </AppProvider>,
    )

    expect(screen.getByTestId("beginner-lab")).toHaveTextContent(copy)
    expect(screen.queryByText("정적 UI 미리보기")).not.toBeInTheDocument()
  })

  it("keeps Door interactive and DoS static", () => {
    const chain = render(<AppProvider><AttackPracticePage route="attacks/chain" /></AppProvider>)
    expect(screen.getByText("Door Attack Workbench")).toBeInTheDocument()
    chain.unmount()
    render(<AppProvider><AttackPracticePage route="attacks/dos" /></AppProvider>)
    expect(screen.getByRole("heading", { name: "DoS Attack" })).toBeInTheDocument()
    expect(screen.getByText("정적 UI 미리보기")).toBeInTheDocument()
  })
})
