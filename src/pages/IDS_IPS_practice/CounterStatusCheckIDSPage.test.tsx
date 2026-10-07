// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CounterStatusCheckIDSPage from "./CounterStatusCheckIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>), exampleCommand: "" }))
vi.mock("@fluentui/react-components", () => ({
  Badge: ({ children }: { children: import("react").ReactNode }) => <span>{children}</span>,
}))
vi.mock("@phosphor-icons/react", () => ({
  Play: () => null,
  ClipboardText: () => null,
  Monitor: () => null,
  TerminalWindow: () => null,
}))
vi.mock("@/features/can/practice/CanCommandTerminal", () => ({
  default: ({ onCommand, exampleCommand }: { onCommand: typeof terminal.command; exampleCommand: string }) => {
    terminal.command = onCommand
    terminal.exampleCommand = exampleCommand
    return <div>Terminal stub</div>
  },
}))

async function send(command: string) {
  let output: string[] = []
  await act(async () => { output = await terminal.command!(command) })
  return output
}

function startReplay() {
  render(<CounterStatusCheckIDSPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(within(screen.getByLabelText("Counter sequence")).getByText("0x0B: 11")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Replay 실습으로" }))
}

function expectReplay(counter: number, data: string) {
  const hex = counter.toString(16).toUpperCase().padStart(2, "0")
  const alert = screen.getByRole("alert")
  expect(alert).toHaveTextContent("REPLAY DETECTED")
  expect(alert).toHaveTextContent("Expected Counter : 14 (0x0E)")
  expect(alert).toHaveTextContent(`Received Counter : ${counter} (0x${hex})`)
  expect(within(screen.getByLabelText("Counter sequence")).getByText(`0x${hex}: ${counter}`)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
  const rows = screen.getAllByRole("row")
  expect(rows).toHaveLength(6)
  const row = screen.getByRole("button", { name: "패킷 5 상세" }).closest("tr")!
  expect(within(row).getAllByRole("cell").map((cell) => cell.textContent).slice(2))
    .toEqual(["0x456", data, "ALERT", expect.any(String), "01", `${counter} (0x${hex})`, "14 (0x0E)"])
  expect(screen.getByRole("button", { name: `패킷 5: Expected 14, Received ${counter}, REPLAY_DETECTED` }))
    .toHaveAttribute("data-received-counter", String(counter))
}

describe("historical frame replay", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it("reuses captured Frame 2 even after clearing the monitor", async () => {
    startReplay()
    await send("candump -L vcan0 > capture.log")
    fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
    fireEvent.click(screen.getByRole("button", { name: "로그 비우기" }))
    fireEvent.click(screen.getByRole("tab", { name: "Terminal" }))
    await send("canplayer -I capture.log -l 1")
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Expected Counter : 14 (0x0E)")
    expect(alert).toHaveTextContent("Received Counter : 11 (0x0B)")
    expect(screen.getByText("0x0B: 11")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell")
    expect(cells.map((cell) => cell.textContent).slice(2)).toEqual(["0x456", "010B", "ALERT", expect.any(String), "01", "11 (0x0B)", "14 (0x0E)"])
    expect(screen.getAllByRole("row")).toHaveLength(2)
  })

  it.each([[11, "010B"], [12, "010C"]])("reuses the selected historical counter %i", async (counter, data) => {
    startReplay()
    await send(`cansend vcan0 456#${data}`)
    expectReplay(counter, data)
  })

  it("rejects newly constructed replay data without advancing the expected counter", async () => {
    startReplay()
    expect(await send("cansend vcan0 456#010F")).toEqual(["[info] Replay must reuse the CAN ID and DATA of a historical frame."])
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await send("candump -L vcan0 > capture.log")
    await send("canplayer -I capture.log -l 1")
    expectReplay(11, "010B")
  })

  it("separates unmonitored packets from IDS passes and resets dashboard filters on restart", async () => {
    startReplay()
    await send("cansend vcan0 123#010F")
    fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
    fireEvent.change(screen.getByLabelText("IDS 판정 필터"), { target: { value: "not_checked" } })
    const row = screen.getByRole("button", { name: "패킷 5 상세" }).closest("tr")!
    expect(within(row).getByText("NOT_CHECKED")).toBeInTheDocument()
    expect(within(row).getByText("—")).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /Counter 검증 그래프/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }))
    expect(screen.getByLabelText("IDS 판정 필터")).toHaveValue("all")
    expect(screen.getByRole("button", { name: "패킷 1 상세" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "패킷 5 상세" })).not.toBeInTheDocument()
  })

  it("advertises the Frame 2 replay command and exposes the parsed counter in the monitor", () => {
    startReplay()
    expect(terminal.exampleCommand).toBe("cansend vcan0 456#010B")
    const structure = within(screen.getByLabelText("Counter sequence"))
    expect(structure.getByText("0x0B: 11")).toBeInTheDocument()
    expect(structure.queryByText("0x0D: 13")).not.toBeInTheDocument()
    expect(structure.getByText("Expected Counter : 14 (0x0E)")).toBeInTheDocument()
    expect(screen.getByText(/Frame 2 Replay: cansend vcan0 456#010B/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
    expect(screen.getByRole("columnheader", { name: "COUNTER" })).toBeInTheDocument()
    const secondFrame = screen.getByRole("button", { name: "패킷 2 상세" }).closest("tr")!
    expect(within(secondFrame).getByText("010B")).toBeInTheDocument()
    expect(within(secondFrame).getAllByText("11 (0x0B)")).toHaveLength(2)
  })

  it.each([
    "cansend vcan0 456#0110",
    "cansend vcan0 456#010E",
    "cansend vcan0 456#020F",
    "cansend vcan0 456#010B",
    "cansend vcan0 123#010F",
    "cansend vcan0 456#01",
  ])("does not animate or advance the state mission for invalid input %s", async (invalid) => {
    startReplay()
    await send("cansend vcan0 456#010B")
    fireEvent.click(screen.getByRole("radio", { name: /재전송된 패킷의 카운터/ }))
    fireEvent.click(screen.getByRole("button", { name: "제출" }))
    fireEvent.click(screen.getByRole("button", { name: "상태 검증으로" }))
    const sequence = within(screen.getByLabelText("Counter sequence"))
    expect(sequence.getAllByText(/^(↻ )?Frame \d+:/)).toHaveLength(6)
    await send(invalid)
    expect(sequence.getAllByText(/^(↻ )?Frame \d+:/)).toHaveLength(6)
    expect(sequence.getByText("Expected Counter : 15 (0x0F)")).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    expect(screen.queryByText("학습 완료")).not.toBeInTheDocument()
    expect(screen.getByText(/명령: cansend vcan0 456#010F/)).toBeInTheDocument()
    await send("cansend vcan0 456#010F")
    expect(sequence.getAllByText(/^(↻ )?Frame \d+:/)).toHaveLength(7)
    expect(screen.getByText("학습 완료")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("STATE ANOMALY")
    fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
    const lastRow = screen.getAllByRole("row")[1]
    expect(within(lastRow).getAllByRole("cell").map((cell) => cell.textContent).slice(2))
      .toEqual(["0x456", "010F", "ALERT", "State anomaly: door is already OPEN.", "01", "15 (0x0F)", "15 (0x0F)"])
    fireEvent.click(within(lastRow).getByRole("button"))
    expect(screen.getByText("OPEN → OPEN")).toBeInTheDocument()
    expect(screen.getByText("ANOMALY", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getByText("PASS", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "패킷 5: Expected 14, Received 11, REPLAY_DETECTED" })).toHaveAttribute("data-expected-counter", "14")
  })
})
