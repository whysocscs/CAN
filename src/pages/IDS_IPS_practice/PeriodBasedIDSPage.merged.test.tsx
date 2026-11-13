// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import PeriodBasedIDSPage from "./PeriodBasedIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>) }))
vi.mock("@/features/lab-layout/LabIntroGate", () => ({ LabIntroButton: () => null }))
vi.mock("@/features/can/practice/CanCommandTerminal", () => ({
  default: ({ onCommand }: { onCommand: typeof terminal.command }) => {
    terminal.command = onCommand
    return <div>Terminal stub</div>
  },
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date", "performance"] })
  vi.setSystemTime(new Date("2026-10-06T12:00:00.000+09:00"))
})
afterEach(() => { cleanup(); vi.useRealTimers(); terminal.command = null })

it("uses the detected packet for both the V2 timeline quiz and the interval chart", async () => {
  render(<PeriodBasedIDSPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  act(() => vi.advanceTimersByTime(500))
  fireEvent.click(screen.getByRole("button", { name: "공격 실습으로" }))
  act(() => vi.advanceTimersByTime(50))
  await act(async () => { await terminal.command!("cansend vcan0 101#00") })

  const detected = screen.getByLabelText("Period timeline").querySelector('button[data-verdict="ANOMALY"]')!
  expect(detected).toHaveAttribute("data-event-id", "6")
  fireEvent.click(detected)
  fireEvent.click(screen.getByRole("button", { name: "제출" }))
  expect(screen.getByText(/정답입니다/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))
  fireEvent.change(screen.getByLabelText("IDS 판정 필터"), { target: { value: "alert" } })
  expect(screen.getByText("1개 이벤트")).toBeInTheDocument()
  expect(screen.getByRole("img", { name: /수신 간격 그래프/ }).querySelector('circle[data-event-id="6"]')).toHaveAttribute("data-verdict", "ANOMALY")
  fireEvent.click(screen.getByRole("button", { name: "패킷 6 상세" }))
  expect(screen.getByText(/"observed_interval_ms": 50/)).toBeInTheDocument()
})
