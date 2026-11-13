// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import CounterStatusCheckIDSPage from "./CounterStatusCheckIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>) }))
vi.mock("@/features/lab-layout/LabIntroGate", () => ({ LabIntroButton: () => null }))
vi.mock("@/features/can/practice/CanCommandTerminal", () => ({
  default: ({ onCommand }: { onCommand: typeof terminal.command }) => {
    terminal.command = onCommand
    return <div>Terminal stub</div>
  },
}))

beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] }))
afterEach(() => { cleanup(); vi.useRealTimers(); terminal.command = null })

it("replays the captured historical frame in the V2 layout and records its validation", async () => {
  render(<CounterStatusCheckIDSPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  act(() => vi.advanceTimersByTime(3000))
  fireEvent.click(screen.getByRole("button", { name: "Replay 실습으로" }))

  let output: string[] = []
  await act(async () => { output = await terminal.command!("cansend vcan0 456#010F") })
  expect(output).toEqual(["[info] Replay must reuse the CAN ID and DATA of a historical frame."])
  await act(async () => { await terminal.command!("candump -L vcan0 > capture.log") })
  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))
  fireEvent.click(screen.getByRole("button", { name: "로그 비우기" }))
  await act(async () => { await terminal.command!("canplayer -I capture.log -l 1") })

  expect(screen.getByText("1개 이벤트")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "패킷 5 상세" }))
  expect(screen.getByText("Replay 원본")).toBeInTheDocument()
  expect(screen.getByText("패킷 2")).toBeInTheDocument()
  expect(screen.getByText(/"reason_code": "REPLAY_DETECTED"/)).toBeInTheDocument()
})
