// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import IpsBlockingPage from "./IpsBlockingPage"
import type { IpsFrame, IpsRule } from "./IpsBlockingTimeline"

vi.mock("@phosphor-icons/react", () => ({ Play: () => null }))
vi.mock("./IpsBlockingTimeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./IpsBlockingTimeline")>()
  return { ...actual, default: ({ frames, activeRule, onSelectFrame, onSelectRule, onApply }: { frames: IpsFrame[]; activeRule: IpsRule; onSelectFrame: (frame: IpsFrame) => void; onSelectRule: (rule: IpsRule) => void; onApply: () => void }) => <div>{frames.map((frame, index) => <button key={frame.id} onClick={() => onSelectFrame(frame)} aria-label={`viewport packet ${index + 1}: ${frame.ids}, ${actual.shouldBlock(frame, activeRule) ? "BLOCK" : "ALLOW"}`} />)}{(["id", "counter", "period"] as const).map((rule) => <button key={rule} onClick={() => onSelectRule(rule)}>select {rule}</button>)}<button onClick={onApply}>apply rule</button></div> }
})
afterEach(cleanup)
function start() { render(<IpsBlockingPage />); fireEvent.click(screen.getByRole("button", { name: "시작" })) }
function apply(rule: IpsRule) { fireEvent.click(screen.getByRole("button", { name: `select ${rule}` })); fireEvent.click(screen.getByRole("button", { name: "apply rule" })) }
function row(no: number) { return within(screen.getByRole("button", { name: `패킷 ${no} 상세` }).closest("tr")!) }

describe("IPS analysis dashboard", () => {
  it("shows no packets before starting and separates IDS detection from an allowed replay", () => {
    render(<IpsBlockingPage />)
    expect(screen.queryByRole("button", { name: "패킷 5 상세" })).not.toBeInTheDocument()
    expect(screen.getByText("공격 Frame ECU 전달 0 / 1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "시작" }))
    expect(screen.getAllByRole("row")).toHaveLength(6)
    expect(row(5).getByText("010B")).toBeInTheDocument()
    expect(row(5).getByText("ALERT · REPLAY")).toBeInTheDocument()
    expect(row(5).getByText("ALLOW")).toBeInTheDocument()
    expect(row(5).getByText("DELIVERED")).toBeInTheDocument()
  })

  it("shows the packet selected in the viewport with its details and current decision", () => {
    start(); apply("counter")
    expect(row(5).getByText("BLOCK")).toBeInTheDocument()
    expect(row(5).getByText("NOT_DELIVERED")).toBeInTheDocument()
    expect(row(2).getByText("ALLOW")).toBeInTheDocument()
    expect(screen.queryByText("패킷별 허용 / 차단")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "viewport packet 5: REPLAY, BLOCK" }))
    expect(screen.getAllByRole("row")).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "패킷 2 상세" })).not.toBeInTheDocument()
    expect(screen.getByText("456#010B")).toBeInTheDocument()
    expect(screen.getByText("14 (0x0E)", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getAllByText("11 (0x0B)", { selector: "dd" })).toHaveLength(2)
    expect(screen.getByText("정상 Frame ECU 전달 4 / 4")).toBeInTheDocument()
    expect(screen.getByText("공격 Frame ECU 전달 0 / 1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "viewport packet 2: PASS, ALLOW" }))
    expect(screen.getByText("456#010B")).toBeInTheDocument()
    expect(screen.queryByText("14 (0x0E)", { selector: "dd" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "전체 패킷 보기" }))
    expect(screen.getAllByRole("row")).toHaveLength(6)
  })

  it("shows normal packets blocked by the ID rule and leaks under the wrong rule", () => {
    start(); apply("period")
    expect(row(5).getByText("ALLOW")).toBeInTheDocument()
    expect(row(5).getByText(/규칙 불일치/)).toBeInTheDocument()
    apply("id")
    expect(screen.getByText(/정상 패킷 차단 4개 · 공격 패킷 허용 0개/)).toBeInTheDocument()
    expect(row(1).getByText("PASS")).toBeInTheDocument()
    expect(row(1).getByText("BLOCK")).toBeInTheDocument()
    expect(row(1).getByText(/과잉 차단/)).toBeInTheDocument()
  })

  it("keeps the period scenario and its decision through quiz and completion", () => {
    start(); apply("counter")
    fireEvent.click(screen.getByRole("button", { name: "시나리오 2로" }))
    apply("counter")
    expect(row(3).getByText("ALLOW")).toBeInTheDocument()
    apply("period")
    fireEvent.click(screen.getByRole("button", { name: "viewport packet 3: PERIOD, BLOCK" }))
    expect(screen.getByText("50 ms", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getByText("100 ms", { selector: "dd" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "문제 풀기" }))
    expect(row(3).getByText("ALERT · PERIOD")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /공격 Frame뿐 아니라 정상 Frame까지/ }))
    fireEvent.click(screen.getByRole("button", { name: "완료" }))
    expect(row(3).getByText("BLOCK")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "viewport packet 5: REPLAY, ALLOW" })).not.toBeInTheDocument()
  })

  it("filters packet decisions, clears logs and resets filters on restart", () => {
    start(); apply("counter")
    fireEvent.change(screen.getByLabelText("IPS 처리 필터"), { target: { value: "BLOCK" } })
    expect(screen.getAllByRole("row")).toHaveLength(2)
    expect(screen.queryByRole("button", { name: "패킷 1 상세" })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("패킷 검색"), { target: { value: "010B" } })
    expect(row(5).getByText("010B")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "로그 비우기" }))
    expect(screen.queryByRole("img", { name: "IPS 패킷 처리 그래프" })).not.toBeInTheDocument()
    expect(screen.getByText("공격 Frame ECU 전달 0 / 1")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "viewport packet 1: PASS, ALLOW" }))
    expect(screen.getByText("456#010A")).toBeInTheDocument()
    expect(screen.getByLabelText("IPS 처리 필터")).toHaveValue("all")
    expect(screen.getByLabelText("패킷 검색")).toHaveValue("")
    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }))
    expect(screen.getByLabelText("IPS 처리 필터")).toHaveValue("all")
    expect(screen.getByLabelText("패킷 검색")).toHaveValue("")
    expect(screen.getAllByRole("row")).toHaveLength(6)
    expect(row(5).getByText("ALLOW")).toBeInTheDocument()
  })
})
