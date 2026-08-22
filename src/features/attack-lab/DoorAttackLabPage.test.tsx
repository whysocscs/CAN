// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import { vehicle } from "../vehicle/vehicleStore"
import type {
  DoorLabScriptResult,
  DoorLabSessionState,
  DoorLabTerminalResult,
} from "./doorLabTypes"

const api = vi.hoisted(() => ({
  createDoorLabSession: vi.fn(),
  resetDoorLabSession: vi.fn(),
  runDoorLabCommand: vi.fn(),
  runDoorLabScript: vi.fn(),
}))

const stream = vi.hoisted(() => ({
  connect: vi.fn(),
  options: undefined as {
    onEvent: (event: CanEvent) => void
    onStatus?: (status: "connecting" | "open" | "closed") => void
  } | undefined,
}))

vi.mock("./doorLabApi", () => api)
vi.mock("../can/events/backendProvider", () => ({
  connectCanStream: stream.connect,
}))
vi.mock("./DoorAttackVehicle", () => ({
  default: () => <div aria-label="Toy Vehicle 3D view" />,
}))

import DoorAttackLabPage from "./DoorAttackLabPage"

const initialSession: DoorLabSessionState = {
  sessionId: "session-1",
  stage: "정찰",
  targetLabel: "Toy Body ECU",
  messageContractStatus: "UNKNOWN",
  vehicleState: { leftDoor: "closed", rightDoor: "closed" },
  evidence: [],
  attemptCount: 0,
  completed: false,
}

const captureResult: DoorLabTerminalResult = {
  ok: true,
  code: "OK",
  output: "(168120.044) vcan0 2A0#A501",
  frames: [{ canId: "0x2a0", data: ["A5", "01"], verdict: "OBSERVED" }],
}

const blockedRun: DoorLabScriptResult = {
  attempts: [
    {
      canId: "0x101",
      data: ["00", "01", "13", "00"],
      verdict: "CHECKSUM_INVALID",
    },
  ],
  idsStatus: "ALERT",
  state: { ...initialSession, stage: "Replay 실패", attemptCount: 1 },
  error: null,
}

describe("DoorAttackLabPage", () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    vi.clearAllMocks()
    vehicle.reset()
    api.createDoorLabSession.mockResolvedValue(initialSession)
    api.resetDoorLabSession.mockResolvedValue(initialSession)
    api.runDoorLabCommand.mockResolvedValue(captureResult)
    api.runDoorLabScript.mockResolvedValue(blockedRun)
    stream.options = undefined
    stream.connect.mockImplementation((options) => {
      stream.options = options
      options.onStatus?.("open")
      return vi.fn()
    })
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  it("renders the seven-stage black-box workbench without disclosing the answer", async () => {
    render(<DoorAttackLabPage />)

    expect(await screen.findByText("BODY ECU")).toBeInTheDocument()
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument()

    const stageRail = screen.getByRole("list", { name: "공격 단계" })
    expect(within(stageRail).getAllByRole("listitem")).toHaveLength(7)
    expect(within(stageRail).getByText("캡처")).toBeInTheDocument()

    const editor = screen.getByRole("textbox", { name: "공격 스크립트" })
    const initialScript = (editor as HTMLTextAreaElement).value
    expect(initialScript).toContain("interval_ms=")
    expect(initialScript).not.toMatch(/101#|000113|0x101|checksum|counter/i)

    expect(
      screen.getByRole("region", { name: "Code editor" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Binary inspector" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Network monitor" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Restricted terminal" }),
    ).toBeInTheDocument()
    expect(stream.connect).toHaveBeenCalledTimes(1)
  })

  it("shows an explicit offline error when session creation is rejected", async () => {
    api.createDoorLabSession.mockRejectedValueOnce(
      new Error("Door lab API is unavailable."),
    )

    render(<DoorAttackLabPage />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("오프라인")
    expect(alert).toHaveTextContent("Door lab API is unavailable.")
    expect(screen.getByRole("button", { name: "세션 다시 연결" })).toBeEnabled()
  })

  it("uses the selected structured frame to drive the binary byte view", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "candump -L vcan0",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    await user.click(
      await screen.findByRole("button", { name: /0x2a0.*A5 01/i }),
    )
    const inspector = screen.getByRole("region", { name: "Binary inspector" })
    expect(within(inspector).getByText("10100101")).toBeInTheDocument()
    expect(within(inspector).getByText("00000001")).toBeInTheDocument()
  })

  it("records rejected run attempts without changing the vehicle", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    expect(
      await within(monitor).findByText("CHECKSUM_INVALID"),
    ).toBeInTheDocument()
    const evidence = screen.getByRole("region", { name: "Evidence" })
    expect(evidence).toHaveTextContent("ALERT")
    expect(evidence).toHaveTextContent("CHECKSUM_INVALID")
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it("applies a closed reset response to the frontend vehicle store", async () => {
    const user = userEvent.setup()
    vehicle.openDoor("both")
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))

    await act(async () => undefined)
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(vehicle.isOpen("doorR")).toBe(false)
  })
})
