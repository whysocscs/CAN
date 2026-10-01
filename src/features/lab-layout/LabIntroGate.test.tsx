// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import LabIntroGate, { LabIntroButton } from "./LabIntroGate"
import LabTabs from "./LabTabs"

const intro = {
  kicker: "TEST · INTRODUCTION",
  title: "테스트 실습",
  description: "설명",
  flow: ["A", "B"],
  objectives: ["목표 1"],
}

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <LabIntroButton />
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        count {count}
      </button>
    </div>
  )
}

describe("LabIntroGate", () => {
  afterEach(() => cleanup())

  it("shows the introduction first and keeps the lab state when the intro is reopened", () => {
    render(
      <LabIntroGate intro={intro}>
        <Counter />
      </LabIntroGate>,
    )

    expect(screen.getByRole("heading", { name: "테스트 실습" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /count/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /실습 시작/ }))
    fireEvent.click(screen.getByRole("button", { name: "count 0" }))
    fireEvent.click(screen.getByRole("button", { name: /실습 소개/ }))

    expect(screen.getByRole("heading", { name: "테스트 실습" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /실습으로 돌아가기/ }))
    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument()
  })
})

describe("LabTabs", () => {
  afterEach(() => cleanup())

  it("keeps inactive panels mounted so their state survives tab switches", () => {
    render(
      <LabTabs
        label="도구"
        tabs={[
          { id: "terminal", label: "Terminal", content: <input aria-label="명령" /> },
          { id: "log", label: "Log", content: <p>log</p> },
        ]}
      />,
    )

    const input = screen.getByRole("textbox", { name: "명령" })
    fireEvent.change(input, { target: { value: "candump vcan0" } })
    fireEvent.click(screen.getByRole("tab", { name: "Log" }))

    expect(screen.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true")
    expect(input.closest("[role='tabpanel']")).toHaveAttribute("data-active", "false")

    fireEvent.click(screen.getByRole("tab", { name: "Terminal" }))
    expect(screen.getByRole("textbox", { name: "명령" })).toBe(input)
    expect(input).toHaveValue("candump vcan0")
  })
})
