// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../context/AppContext"
import AttackPracticePage, { type AttackRoute } from "./AttackPracticePage"

const STATIC_ATTACKS = [
  ["attacks/spoofing", "CAN Spoofing"],
  ["attacks/replay", "Replay Attack"],
  ["attacks/dos", "DoS Attack"],
] as const satisfies ReadonlyArray<readonly [AttackRoute, string]>

describe("AttackPracticePage static routes", () => {
  afterEach(() => cleanup())

  it.each(STATIC_ATTACKS)("keeps %s as a static preview", (route, title) => {
    render(
      <AppProvider>
        <AttackPracticePage route={route} />
      </AppProvider>,
    )

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    expect(screen.getByText("정적 UI 미리보기")).toBeInTheDocument()
    expect(screen.queryByText("Door Attack Workbench")).not.toBeInTheDocument()
  })
})
