// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import IpsBlockingPage from "./IpsBlockingPage"
import type { IpsFrame, IpsRule } from "./IpsBlockingTimeline"

vi.mock("@/features/lab-layout/LabIntroGate", () => ({ LabIntroButton: () => null }))
vi.mock("./IpsBlockingTimeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./IpsBlockingTimeline")>()
  return {
    ...actual,
    default: ({ frames, onSelectFrame, onSelectRule, onApply }: {
      frames: IpsFrame[]
      activeRule: IpsRule
      onSelectFrame: (frame: IpsFrame) => void
      onSelectRule: (rule: Exclude<IpsRule, "none">) => void
      onApply: () => void
    }) => <div>
      {frames.map((frame) => <button key={frame.id} onClick={() => onSelectFrame(frame)}>타임라인 {frame.id}</button>)}
      <button onClick={() => onSelectRule("counter")}>Counter 규칙 선택</button>
      <button onClick={onApply}>규칙 적용</button>
    </div>,
  }
})

afterEach(cleanup)

it("keeps the V2 practice flow while showing and filtering the merged IPS packet analysis", () => {
  render(<IpsBlockingPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))
  expect(screen.getByRole("button", { name: "패킷 5 상세" })).toBeInTheDocument()
  expect(screen.getByText(/공격 패킷 허용 1개/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole("tab", { name: "실습" }))
  fireEvent.click(screen.getByRole("button", { name: "Counter 규칙 선택" }))
  fireEvent.click(screen.getByRole("button", { name: "규칙 적용" }))
  fireEvent.click(screen.getByRole("button", { name: "타임라인 replay" }))
  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))

  const selected = screen.getByRole("button", { name: "패킷 5 상세" }).closest("tr")!
  expect(within(selected).getByText("BLOCK")).toBeInTheDocument()
  expect(screen.getByText(/공격 패킷 허용 0개/)).toBeInTheDocument()
  expect(screen.getByText("선택한 패킷: #5")).toBeInTheDocument()
})
