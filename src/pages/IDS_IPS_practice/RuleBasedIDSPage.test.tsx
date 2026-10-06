// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import type { ReactNode } from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import RuleBasedIDSPage from "./RuleBasedIDSPage"

const terminal = vi.hoisted(() => ({ command: null as null | ((input: string) => Promise<string[]>) }))
vi.mock("@/features/can/practice/CanCommandTerminal", () => ({ default: ({ onCommand }: { onCommand: typeof terminal.command }) => { terminal.command = onCommand; return <div>Terminal input</div> } }))
vi.mock("@fluentui/react-components", () => ({ Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>, Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button> }))
vi.mock("@phosphor-icons/react", () => ({ Play: () => null }))
vi.mock("@react-three/drei", () => ({ Html: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock("@/features/vehicle", () => ({ vehicle: { set: vi.fn() }, useVehicleRig: vi.fn() }))
vi.mock("@/features/vehicle/SharedVehicleScene", () => ({
  SharedVehicleCanvas: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SharedVehicleScene: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SharedVehicleOverviewController: () => null,
  SharedVehicleOrbitControls: () => null,
  useSharedVehicleClone: () => ({}),
}))
vi.mock("./VehicleOwner", () => ({ default: () => null }))
afterEach(cleanup)

it("records each submitted frame once and keeps the unified log independent of terminal clearing", async () => {
  render(<RuleBasedIDSPage />)
  fireEvent.click(screen.getByRole("button", { name: "시작" }))
  // Same wall-clock millisecond must still produce distinct packet IDs.
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
  await act(async () => { await terminal.command!("cansend vcan0 101#00"); await terminal.command!("cansend vcan0 999#010B") })
  clock.mockRestore()
  expect(screen.getByRole("tabpanel", { name: "Terminal" })).toBeVisible()
  fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
  expect(screen.getByRole("tabpanel", { name: "대시보드" })).toBeVisible()
  const dashboard = screen.getByLabelText("패킷 분석 대시보드")
  expect(within(dashboard).getByText("2개 이벤트")).toBeInTheDocument()
  expect(within(dashboard).getByRole("button", { name: "패킷 1 상세" })).toBeInTheDocument()
  expect(within(dashboard).getByRole("button", { name: "패킷 2 상세" })).toBeInTheDocument()
  fireEvent.change(within(dashboard).getByLabelText("패킷 검색"), { target: { value: "0x" } })
  fireEvent.click(screen.getByRole("tab", { name: "Terminal" }))
  fireEvent.click(screen.getByRole("button", { name: "화면 비우기" }))
  fireEvent.click(screen.getByRole("tab", { name: "대시보드" }))
  expect(within(dashboard).getByLabelText("패킷 검색")).toHaveValue("0x")
  expect(within(dashboard).getByText("2개 이벤트")).toBeInTheDocument()
  fireEvent.click(within(dashboard).getByRole("button", { name: "로그 비우기" }))
  expect(within(dashboard).getByText("0개 이벤트")).toBeInTheDocument()
  await act(async () => { await terminal.command!("cansend vcan0 201#00") })
  expect(within(dashboard).getByText("1개 이벤트")).toBeInTheDocument()
  expect(within(dashboard).getByText("0x201")).toBeInTheDocument()
})
