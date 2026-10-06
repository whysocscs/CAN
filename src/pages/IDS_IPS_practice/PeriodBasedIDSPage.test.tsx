// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import PeriodBasedIDSPage from "./PeriodBasedIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>) }))
vi.mock("@/features/can/practice/CanCommandTerminal", () => ({ default: ({ onCommand }: { onCommand: typeof terminal.command }) => { terminal.command = onCommand; return <div>Terminal input</div> } }))
vi.mock("@fluentui/react-components", () => ({ Badge: ({ children }: { children: ReactNode }) => <span>{children}</span> }))
vi.mock("@phosphor-icons/react", () => ({ Play: () => null }))

function start() {
  render(<PeriodBasedIDSPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
}
function dashboard() {
  fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
  return within(screen.getByRole("tabpanel", { name: "대시보드" }))
}

describe("period-based packet dashboard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date", "performance"] })
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000+09:00"))
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it("records normal ECU frames every 100ms with actual intervals and millisecond timestamps", () => {
    start()
    act(() => vi.advanceTimersByTime(500))
    const panel = dashboard()
    expect(panel.getByText("5개 이벤트")).toBeInTheDocument()
    expect(panel.queryByText("시간별 패킷 수")).not.toBeInTheDocument()
    expect(panel.getByText("타임라인과 동일한 1초 구간 · 기대 100ms")).toBeInTheDocument()
    const graph = panel.getByRole("img", { name: "수신 간격 그래프: 기대 100ms, 탐지 기준 80ms 미만" })
    expect(graph.querySelectorAll("circle")).toHaveLength(4)
    expect(panel.getAllByText("100 ms")).toHaveLength(5)
    expect(panel.getByRole("img", { name: "수신 간격 그래프: 기대 100ms, 탐지 기준 80ms 미만" })).toBeInTheDocument()
    fireEvent.click(panel.getByRole("button", { name: "패킷 2 상세" }))
    expect(panel.getByText(/"observed_interval_ms": 100/)).toHaveTextContent('"expected_period_ms": 100')
    expect(panel.getByText(/"observed_interval_ms": 100/)).toHaveTextContent('"period_check_applied": false')
    expect(panel.getByText("정상 ECU")).toBeInTheDocument()
    const secondRow = panel.getByRole("button", { name: "패킷 2 상세" }).closest("tr")!
    expect(secondRow.querySelector("time")!.textContent).toMatch(/\.200$/)
  })

  it("shows an injected frame after 50ms as the same alert in both graphs, filters and details", async () => {
    start()
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole("button", { name: "공격 실습으로" }))
    act(() => vi.advanceTimersByTime(50))
    await act(async () => { await terminal.command!("cansend vcan0 101#00") })
    const panel = dashboard()
    const marker = within(screen.getByLabelText("Period timeline")).getByRole("button", { name: "0.55 seconds frame" })
    expect(marker).toHaveAttribute("data-event-id", "6")
    expect(marker).toHaveAttribute("data-verdict", "ANOMALY")
    const point = panel.getByRole("img").querySelector('circle[data-event-id="6"]')!
    expect(point).toHaveAttribute("data-verdict", "ANOMALY")
    expect(point).toHaveAttribute("cx", "323")
    expect(marker.parentElement).toHaveStyle({ left: "55%" })
    fireEvent.change(panel.getByLabelText("IDS 판정 필터"), { target: { value: "alert" } })
    expect(panel.getByText("1개 이벤트")).toBeInTheDocument()
    expect(panel.getByText("50 ms")).toBeInTheDocument()
    fireEvent.click(panel.getByRole("button", { name: "패킷 6 상세" }))
    const json = panel.getByText(/"observed_interval_ms": 50/)
    expect(json).toHaveTextContent('"status": "ALERT"')
    expect(json).toHaveTextContent('"rule": "CAN_PERIOD"')
    expect(json).toHaveTextContent('"period_check_applied": true')
    expect(panel.getByText("101#00")).toBeInTheDocument()
    expect(panel.getByText("수동 주입")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(panel.getByText("1개 이벤트")).toBeInTheDocument()
  })

  it("keeps a 100ms resolution after a long run and resets timing on restart", () => {
    start()
    act(() => vi.advanceTimersByTime(5000))
    const panel = dashboard()
    expect(panel.getByText("50개 이벤트")).toBeInTheDocument()
    expect(panel.getByText("타임라인과 동일한 1초 구간 · 기대 100ms")).toBeInTheDocument()
    const graph = panel.getByRole("img")
    const points = graph.querySelectorAll("circle")
    expect(points).toHaveLength(10)
    expect(points[points.length - 1]).toHaveAttribute("data-event-id", "50")
    expect(graph).toHaveTextContent("4.10s")
    expect(graph).toHaveTextContent("5.10s")
    fireEvent.click(panel.getByRole("button", { name: "로그 비우기" }))
    expect(panel.getByText("0개 이벤트")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(100))
    expect(panel.getByText("1개 이벤트")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }))
    act(() => vi.advanceTimersByTime(100))
    expect(panel.getByText("1개 이벤트")).toBeInTheDocument()
    fireEvent.click(panel.getByRole("button", { name: "패킷 1 상세" }))
    expect(panel.getByText(/"observed_interval_ms": null/)).toBeInTheDocument()
  })

  it.each([500, 1500])("uses the real detected packet as the quiz answer after %ims", async (normalDuration) => {
    start()
    act(() => vi.advanceTimersByTime(normalDuration))
    fireEvent.click(screen.getByRole("button", { name: "공격 실습으로" }))
    act(() => vi.advanceTimersByTime(50))
    await act(async () => { await terminal.command!("cansend vcan0 101#00") })
    const detectedId = normalDuration / 100 + 1
    const timeline = screen.getByLabelText("Period timeline")
    const marker = timeline.querySelector(`button[data-event-id="${detectedId}"]`)!
    const earlier = timeline.querySelector('button[data-verdict="PASS"]')!
    fireEvent.click(earlier)
    fireEvent.click(screen.getByRole("button", { name: "제출" }))
    expect(screen.getByText(/다시 생각해 보세요/)).toBeInTheDocument()
    fireEvent.click(marker)
    fireEvent.click(screen.getByRole("button", { name: "제출" }))
    expect(screen.getByText(`정답입니다. ${((normalDuration + 50) / 1000).toFixed(3)}초에 수신된 프레임의 간격은 50ms로, 기대 주기 100ms를 벗어났습니다.`)).toBeInTheDocument()
    const panel = dashboard()
    const point = panel.getByRole("img").querySelector(`circle[data-event-id="${detectedId}"]`)!
    expect(point).toHaveAttribute("data-verdict", marker.getAttribute("data-verdict"))
    const timelineFraction = Number((marker.parentElement as HTMLElement).style.left.replace("%", "")) / 100
    expect(Number(point.getAttribute("cx"))).toBeCloseTo(48 + timelineFraction * 500)
    expect(timeline).not.toHaveTextContent("고정 예시")
  })
})
