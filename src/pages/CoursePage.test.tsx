// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import CoursePage from "./CoursePage"

vi.mock("@/context/AppContext", () => ({
  useApp: () => ({
    navigate: vi.fn(),
    devMode: true,
    progress: {
      courseProgress: {},
      completedItems: [],
      totalScore: 0,
      badges: [],
    },
  }),
}))

describe("CoursePage", () => {
  afterEach(cleanup)

  it("distinguishes the three runnable attack labs from the DoS static preview", () => {
    render(<CoursePage />)

    const attackCard = screen
      .getByRole("heading", { name: "공격 실습" })
      .closest<HTMLElement>(".course-card")
    expect(attackCard).not.toBeNull()
    expect(attackCard).toHaveTextContent(
      "Door, Spoofing, Replay를 격리된 Toy CAN 환경에서 실행",
    )
    expect(attackCard).toHaveTextContent("DoS는 정적 미리보기")
    expect(
      within(attackCard!).getByText("DoS (정적 미리보기)"),
    ).toBeInTheDocument()
  })
})
