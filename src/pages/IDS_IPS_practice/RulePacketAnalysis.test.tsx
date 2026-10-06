// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import RulePacketAnalysis, { type RulePacketEvent } from "./RulePacketAnalysis"

const events: RulePacketEvent[] = [
  { id: 1, timestamp: 1000, elapsedMs: 100, time: "00:00:01", canId: "0x101", data: "00", verdict: "PASS", reason: "CAN ID 0x101 is allowed." },
  { id: 2, timestamp: 2000, elapsedMs: 1200, time: "00:00:02", canId: "0x999", data: "010B", verdict: "ALERT", reason: "CAN ID 0x999 is not in whitelist." },
  { id: 3, timestamp: 2100, elapsedMs: 1500, time: "00:00:02", canId: "0x200", data: "01", verdict: "EXECUTED", reason: "TRUNK_CLOSE" },
]

afterEach(cleanup)
describe("rule-based packet analysis", () => {
  it("links histogram selection to the unified log without counting executions as alerts", () => {
    render(<RulePacketAnalysis events={events} onClear={vi.fn()} />)
    const bin = screen.getByRole("button", { name: "1초 구간: PASS 1, ALERT 1" })
    fireEvent.click(bin)
    expect(screen.getByText("2개 이벤트")).toBeInTheDocument()
    expect(screen.queryByText("0x101")).not.toBeInTheDocument()
    expect(screen.getByText("EXECUTED")).toBeInTheDocument()
    fireEvent.click(bin)
    expect(screen.getByText("3개 이벤트")).toBeInTheDocument()
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
