// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CanBasicsRouteLessonPlayer, {
  type CanBasicsRouteLessonChapter,
} from "./CanBasicsRouteLessonPlayer"

const chapters: CanBasicsRouteLessonChapter[] = [
  {
    id: "first-concept",
    title: "첫 번째 개념",
    summary: "첫 번째 설명",
    content: <div>첫 번째 내용</div>,
    visual: <div>첫 번째 시각 자료</div>,
  },
  {
    id: "second-concept",
    title: "두 번째 개념",
    summary: "두 번째 설명",
    content: <div>두 번째 내용</div>,
    visual: <div>두 번째 시각 자료</div>,
  },
  {
    id: "third-concept",
    title: "세 번째 개념",
    summary: "세 번째 설명",
    content: <button type="button">상호작용</button>,
    visual: <div>세 번째 시각 자료</div>,
  },
]

describe("CanBasicsRouteLessonPlayer", () => {
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

  it("shows one concept and moves once per scroll gesture", () => {
    render(
      <CanBasicsRouteLessonPlayer
        sectionLabel="CAN 프레임"
        title="Frame 학습"
        introduction="과정 소개"
        objective="학습 목표"
        chapters={chapters}
      />,
    )

    const player = screen.getByRole("region", {
      name: "CAN 프레임 한 화면 학습",
    })
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole("heading", { name: "첫 번째 개념" }),
    ).toBeInTheDocument()

    fireEvent.wheel(player, { deltaY: 900 })
    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      screen.getByRole("heading", { name: "두 번째 개념" }),
    ).toBeInTheDocument()
    expect(
      document.querySelector(".can-lesson-player__count"),
    ).toHaveTextContent("02/ 03")

    act(() => vi.advanceTimersByTime(200))
    fireEvent.wheel(player, { deltaY: 900 })
    expect(
      screen.getByRole("heading", { name: "세 번째 개념" }),
    ).toBeInTheDocument()
    expect(window.location.hash).toBe("#third-concept")

    expect(
      screen.queryByRole("button", { name: /두 번째 개념/ }),
    ).not.toBeInTheDocument()
  })

  it("supports one-step buttons, keyboard navigation, and deep links", () => {
    window.history.replaceState(null, "", "/#second-concept")
    render(
      <CanBasicsRouteLessonPlayer
        sectionLabel="ECU와 Gateway"
        title="ECU 학습"
        introduction="과정 소개"
        objective="학습 목표"
        chapters={chapters}
      />,
    )

    const player = screen.getByRole("region", {
      name: "ECU와 Gateway 한 화면 학습",
    })
    expect(
      screen.getByRole("heading", { name: "두 번째 개념" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "다음 개념" }))
    expect(
      screen.getByRole("heading", { name: "세 번째 개념" }),
    ).toBeInTheDocument()

    fireEvent.keyDown(player, { key: "ArrowLeft" })
    expect(
      screen.getByRole("heading", { name: "두 번째 개념" }),
    ).toBeInTheDocument()
  })
})
