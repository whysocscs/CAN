// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import IpsBlockingPage from "./IpsBlockingPage"
import type { IpsFrame, IpsRule } from "./IpsBlockingTimeline"

vi.mock("@/features/terminal/RealLabTerminal", () => ({ default: () => <div>Terminal stub</div> }))
vi.mock("@/features/lab-layout/LabIntroGate", () => ({ LabIntroButton: () => null }))
vi.mock("./IpsBlockingTimeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./IpsBlockingTimeline")>()
  return {
    ...actual,
    default: ({ frames, onSelectFrame, onOpenFrame }: {
      frames: IpsFrame[]
      activeRule: IpsRule
      onSelectFrame: (frame: IpsFrame) => void
      onOpenFrame: (frame: IpsFrame | null) => void
    }) => <div>
      {frames.map((frame) => <button key={frame.id} onClick={() => { onSelectFrame(frame); onOpenFrame(frame.kind === "attack" ? frame : null) }}>타임라인 {frame.id}</button>)}
    </div>,
  }
})

afterEach(cleanup)

it("allows retries and keeps each correct answer visible until advancing", () => {
  render(<IpsBlockingPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  fireEvent.click(screen.getByRole("button", { name: "타임라인 replay" }))
  fireEvent.click(screen.getByRole("radio", { name: "CAN ID 0x456 전체 차단" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  expect(screen.getByText(/오답입니다/)).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "다음 단계로 넘어가기" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("radio", { name: "Counter 검증 위반 프레임 차단" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  expect(screen.getByText(/정답입니다/)).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "IPS 규칙 선택 문제" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "다음 단계로 넘어가기" }))
  expect(screen.queryByRole("region", { name: "IPS 규칙 선택 문제" })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "타임라인 period" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  expect(screen.getByText(/오답입니다/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("radio", { name: "주기 검증 위반 프레임 차단" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  expect(screen.getByText(/정답입니다/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "다음 단계로 넘어가기" }))
  expect(screen.queryByRole("region", { name: "IPS 규칙 선택 문제" })).not.toBeInTheDocument()
  expect(screen.getAllByText(/CAN ID 전체 차단 규칙의 문제점으로/).length).toBeGreaterThan(0)
})

it("shows blocking results only after the scenario starts", () => {
  render(<IpsBlockingPage />)
  expect(screen.queryByText("정상 통신까지 과도하게 차단되었습니다.")).not.toBeInTheDocument()
  expect(screen.queryByText("정상 통신이 유지됩니다.")).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  expect(screen.getByText("정상 통신이 유지됩니다.")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "타임라인 replay" }))
  fireEvent.click(screen.getByRole("radio", { name: "CAN ID 0x456 전체 차단" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  expect(screen.getAllByText("정상 통신까지 과도하게 차단되었습니다.")).toHaveLength(2)
})

it("keeps the V2 practice flow while showing and filtering the merged IPS packet analysis", () => {
  render(<IpsBlockingPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))
  expect(screen.getByRole("button", { name: "패킷 5 상세" })).toBeInTheDocument()
  expect(screen.getByText(/공격 패킷 허용 1개/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole("tab", { name: "실습" }))
  fireEvent.click(screen.getByRole("button", { name: "타임라인 replay" }))
  expect(screen.getByRole("region", { name: "IPS 규칙 선택 문제" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("radio", { name: "Counter 검증 위반 프레임 차단" }))
  fireEvent.click(screen.getByRole("button", { name: "적용" }))
  fireEvent.click(screen.getByRole("button", { name: "타임라인 replay" }))
  fireEvent.click(screen.getByRole("tab", { name: "패킷 분석" }))

  const selected = screen.getByRole("button", { name: "패킷 5 상세" }).closest("tr")!
  expect(within(selected).getByText("BLOCK")).toBeInTheDocument()
  expect(screen.getByText(/공격 패킷 허용 0개/)).toBeInTheDocument()
  expect(screen.getByText("선택한 패킷: #5")).toBeInTheDocument()
})
