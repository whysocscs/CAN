// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import RulePacketAnalysis, { type RulePacketEvent } from "./RulePacketAnalysis"

const events: RulePacketEvent[] = [
  { id: 1, timestamp: 1000, elapsedMs: 100, time: "00:00:01", canId: "0x101", data: "00", verdict: "PASS", reason: "CAN ID 0x101 is allowed." },
  { id: 2, timestamp: 7000, elapsedMs: 6100, time: "00:00:07", canId: "0x999", data: "010B", verdict: "ALERT", reason: "CAN ID 0x999 is not in whitelist." },
  { id: 3, timestamp: 7400, elapsedMs: 6500, time: "00:00:07", canId: "0x200", data: "01", verdict: "EXECUTED", reason: "TRUNK_CLOSE" },
]

afterEach(cleanup)
describe("rule-based packet analysis", () => {
  it("links histogram selection to the unified log without counting executions as alerts", () => {
    render(<RulePacketAnalysis events={events} onClear={vi.fn()} />)
    const bin = screen.getByRole("button", { name: "5초 구간: PASS 1, ALERT 1" })
    fireEvent.click(bin)
    expect(screen.getByText("2개 이벤트")).toBeInTheDocument()
    expect(screen.queryByText("0x101")).not.toBeInTheDocument()
    expect(screen.getByText("EXECUTED")).toBeInTheDocument()
    fireEvent.click(bin)
    expect(screen.getByText("3개 이벤트")).toBeInTheDocument()
  })

  it("widens bins after a pause while preserving the selected time range", () => {
    const { rerender } = render(<RulePacketAnalysis events={events} onClear={vi.fn()} />)
    expect(screen.getByText("실습 경과 시간 · 5초 단위")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "5초 구간: PASS 1, ALERT 1" }))
    rerender(<RulePacketAnalysis events={[...events, { ...events[0], id: 4, elapsedMs: 120000 }]} onClear={vi.fn()} />)
    expect(screen.getByText("실습 경과 시간 · 15초 단위")).toBeInTheDocument()
    expect(screen.getByText("2개 이벤트")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "시간 구간 선택 해제 (5–10초)" })).toBeInTheDocument()
    expect(within(screen.getByLabelText("시간별 패킷 발생 그래프")).getAllByRole("button").length).toBeLessThanOrEqual(12)
  })

  it("combines search and verdict filters and exposes original packet details", () => {
    render(<RulePacketAnalysis events={events} onClear={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("IDS 판정 필터"), { target: { value: "alert" } })
    fireEvent.change(screen.getByLabelText("패킷 검색"), { target: { value: "010b" } })
    expect(screen.getByText("1개 이벤트")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "패킷 2 상세" }))
    expect(screen.getByText("999#010B")).toBeInTheDocument()
    expect(screen.getByText(/"dlc": 2/)).toHaveTextContent('"status": "ALERT"')
    fireEvent.click(screen.getByRole("checkbox", { name: "DATA" }))
    expect(screen.queryByRole("columnheader", { name: "DATA" })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("패킷 검색"), { target: { value: "no match" } })
    expect(screen.getByText("조건에 맞는 패킷이 없습니다.")).toBeInTheDocument()
  })

  it("filters recent events relative to the last packet and clears through the page callback", () => {
    const onClear = vi.fn()
    render(<RulePacketAnalysis events={[...events, { ...events[0], id: 4, elapsedMs: 25000 }]} onClear={onClear} />)
    fireEvent.change(screen.getByLabelText("시간 범위"), { target: { value: "10" } })
    expect(screen.getByText("1개 이벤트")).toBeInTheDocument()
    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "로그 비우기" }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
