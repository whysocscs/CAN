// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import CounterStatusCheckIDSPage from "./CounterStatusCheckIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>) }))
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
  default: ({ onCommand }: { onCommand: typeof terminal.command }) => {
    terminal.command = onCommand
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
  fireEvent.click(screen.getByRole("button", { name: "Replay 실습으로" }))
}

function expectReplay(counter: number, data: string) {
  const hex = counter.toString(16).toUpperCase().padStart(2, "0")
  const alert = screen.getByRole("alert")
  expect(alert).toHaveTextContent("REPLAY DETECTED")
  expect(alert).toHaveTextContent("Expected Counter : 14 (0x0E)")
  expect(alert).toHaveTextContent(`Received Counter : ${counter} (0x${hex})`)
  expect(within(screen.getByLabelText("Counter sequence")).getByText(`0x${hex} · ${counter}`)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("tab", { name: "CAN Monitor" }))
  const rows = screen.getAllByRole("row")
  expect(rows).toHaveLength(6)
  expect(within(rows[5]).getAllByRole("cell").map((cell) => cell.textContent))
    .toEqual(["5", expect.any(String), "0x456", data, "ALERT"])
}

describe("historical frame replay", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it("reuses captured Frame 2 even after clearing the monitor", async () => {
    startReplay()
    await send("candump -L vcan0 > capture.log")
    fireEvent.click(screen.getByRole("tab", { name: "CAN Monitor" }))
    fireEvent.click(screen.getByRole("button", { name: "화면 비우기" }))
    fireEvent.click(screen.getByRole("tab", { name: "Terminal" }))
    await send("canplayer -I capture.log -l 1")
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Expected Counter : 14 (0x0E)")
    expect(alert).toHaveTextContent("Received Counter : 11 (0x0B)")
    expect(screen.getByText("0x0B · 11")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "CAN Monitor" }))
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell")
    expect(cells.map((cell) => cell.textContent)).toEqual(["5", expect.any(String), "0x456", "010B", "ALERT"])
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
})
