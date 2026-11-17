// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CanBasicsLessonPlayer from "./CanBasicsLessonPlayer"

describe("CanBasicsLessonPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.history.replaceState(null, "", "/")
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("renders one concept and advances once per wheel gesture", () => {
    render(<CanBasicsLessonPlayer onComplete={vi.fn()} onContinue={vi.fn()} />)

    const player = screen.getByRole("region", {
      name: "CAN 기초 한 화면 학습",
    })
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "기능이 늘수록 배선도 빠르게 복잡해집니다",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", {
        level: 1,
        name: "여러 ECU가 하나의 CAN Bus를 공유합니다",
      }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("01/ 15")

    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "여러 ECU가 하나의 CAN Bus를 공유합니다",
      }),
    ).toBeInTheDocument()
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("02/ 15")
    expect(window.location.hash).toBe("#why-can/2")

    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "여러 ECU가 하나의 CAN Bus를 공유합니다",
      }),
    ).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(200))
    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("03/ 15")

    act(() => vi.advanceTimersByTime(200))
    fireEvent.wheel(player, { deltaY: -900 })
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("02/ 15")

    act(() => vi.advanceTimersByTime(200))
    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("03/ 15")
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(
      screen.queryByRole("button", { name: /Shared Bus/ }),
    ).not.toBeInTheDocument()

    for (let expectedIndex = 4; expectedIndex <= 15; expectedIndex += 1) {
      fireEvent.click(screen.getByRole("button", { name: "다음 개념" }))
      expect(
        document.querySelector(".can-lesson-player__count"),
      ).toHaveTextContent(`${String(expectedIndex).padStart(2, "0")}/ 15`)
    }
  })

  it("supports keyboard navigation and completes through the final checkpoint", () => {
    const onComplete = vi.fn()
    const onContinue = vi.fn()
    render(
      <CanBasicsLessonPlayer onComplete={onComplete} onContinue={onContinue} />,
    )

    const player = screen.getByRole("region", {
      name: "CAN 기초 한 화면 학습",
    })
    fireEvent.keyDown(player, { key: "End" })

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "반복 오류 노드는 통신 참여가 제한됩니다",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("radio", {
        name: "여러 ECU가 공용 Bus를 사용하며 CAN ID로 메시지를 구분한다",
      }),
    )
    expect(onComplete).toHaveBeenCalledOnce()

    fireEvent.click(
      screen.getByRole("button", { name: "CAN 프레임 심화로 이동" }),
    )
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
