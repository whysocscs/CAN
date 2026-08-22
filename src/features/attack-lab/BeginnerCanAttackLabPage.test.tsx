// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { StrictMode } from "react"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import { vehicle } from "../vehicle/vehicleStore"
import type {
  BeginnerCanAttackResult,
  BeginnerCanAttackScenario,
  BeginnerCanAttackState,
} from "./beginnerCanAttackTypes"

const api = vi.hoisted(() => ({
  createBeginnerCanAttackSession: vi.fn(),
  getBeginnerCanAttackSession: vi.fn(),
  resetBeginnerCanAttackSession: vi.fn(),
  runBeginnerCanAttackTerminal: vi.fn(),
  runBeginnerCanAttackScript: vi.fn(),
}))
const stream = vi.hoisted(() => ({ connect: vi.fn(), options: null as null | {
  onEvent: (event: CanEvent) => void
  onStatus?: (status: "connecting" | "open" | "closed") => void
} }))

vi.mock("./beginnerCanAttackApi", () => api)
vi.mock("../can/events/backendProvider", () => ({ connectCanStream: stream.connect }))
vi.mock("../vehicle/VehicleNetworkViewport", () => ({
  default: (props: Record<string, unknown>) => (
    <div aria-label={`${props.scenarioTitle} vehicle network`} data-route={String(props.route)} data-target={props.targetId} data-effect={props.effectId} />
  ),
}))

import BeginnerCanAttackLabPage from "./BeginnerCanAttackLabPage"

function session(scenario: BeginnerCanAttackScenario, generation = 0): BeginnerCanAttackState {
  const spoofing = scenario === "spoofing"
  return {
    labId: spoofing ? "can-spoofing-basic-v1" : "can-replay-basic-v1",
    scenario,
    sessionId: `${scenario}-session`,
    generation,
    stage: "RECON",
    targetLabel: spoofing ? "Toy Rear ECU" : "Toy Body ECU",
    targetNode: spoofing ? "rear" : "body",
    effectTarget: spoofing ? "tailgate" : "leftDoor",
    vehicleState: { leftDoor: "closed", rightDoor: "closed", tailgate: "closed" },
    evidence: [],
    attemptCount: 0,
    lastVerdict: null,
    completed: false,
  }
}

function result(state: BeginnerCanAttackState, overrides: Partial<BeginnerCanAttackResult> = {}): BeginnerCanAttackResult {
  return { ok: true, code: "OBSERVED", output: "(1721000000.100000) vcan0 701#00", attempts: [], captures: [], state, idsStatus: null, ...overrides }
}

function liveEvent(state: BeginnerCanAttackState, overrides: Partial<CanEvent> = {}): CanEvent {
  const replay = state.scenario === "replay"
  return {
    eventId: "live-1",
    timestamp: 1_700_000_000_000,
    channel: "vcan0",
    origin: "backend",
    frame: { canId: "0x701", dlc: replay ? 2 : 1, data: replay ? ["00", "01"] : ["01"] },
    lab: { labId: state.labId, scenario: state.scenario, sessionId: state.sessionId, generation: state.generation, attemptId: "attempt-1", stage: "impact" },
    context: { command: replay ? "DOOR_LOCK" : "TRUNK_OPEN", source: "obd", target: replay ? "body" : "rear" },
    processing: { filterResult: "ACCEPT", executionResult: "EXECUTED" },
    monitoring: { idsObserved: true, status: "NORMAL" },
    ...overrides,
  }
}

let frames: FrameRequestCallback[] = []
async function flushStream() {
  await act(async () => {
    const pending = frames
    frames = []
    pending.forEach((callback) => callback(0))
  })
}

describe("BeginnerCanAttackLabPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vehicle.reset()
    api.createBeginnerCanAttackSession.mockImplementation((scenario: BeginnerCanAttackScenario) => Promise.resolve(session(scenario)))
    api.resetBeginnerCanAttackSession.mockImplementation((scenario: BeginnerCanAttackScenario) => Promise.resolve(session(scenario, 1)))
    api.runBeginnerCanAttackTerminal.mockImplementation((scenario: BeginnerCanAttackScenario) => Promise.resolve(result(session(scenario))))
    api.runBeginnerCanAttackScript.mockImplementation((scenario: BeginnerCanAttackScenario) => Promise.resolve(result(session(scenario))))
    stream.connect.mockImplementation((options) => {
      stream.options = options
      options.onStatus?.("open")
      return vi.fn()
    })
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ["spoofing", "CAN Spoofing Basics", "REAR ECU", "TAILGATE", "obd,ids,gateway,rear,tailgate", "목표 확인", "정상 관찰", "Payload 작성", "ECU 수락", "증거", "cansend vcan0 <ID>#<DATA>"],
    ["replay", "CAN Replay Basics", "BODY ECU", "LEFT DOOR", "obd,ids,gateway,body,leftDoor", "목표 확인", "프레임 캡처", "원본 확인", "재전송", "증거", "canplayer -I <FILE> -l <COUNT>"],
  ] as const)("renders the %s beginner workbench without prefilled answers", async (scenarioName, title, target, effect, route, ...copy) => {
    render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument()
    expect(screen.getByText(target)).toBeInTheDocument()
    expect(screen.getByText(effect)).toBeInTheDocument()
    expect(screen.getByLabelText(`${title} vehicle network`)).toHaveAttribute("data-route", route)
    copy.slice(0, 5).forEach((stage) => expect(screen.getByText(stage)).toBeInTheDocument())
    expect(screen.getByRole("textbox", { name: "공격 스크립트" }).getAttribute("value") ?? (screen.getByRole("textbox", { name: "공격 스크립트" }) as HTMLTextAreaElement).value).toContain(copy[5])
    expect(screen.getByRole("region", { name: "Binary inspector" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Network monitor" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Virtual terminal" })).toBeInTheDocument()
    const body = document.body.textContent ?? ""
    expect(body).not.toMatch(/5a1#01|5a2#0001|capture\.log/i)
    expect(body).not.toContain("정적 UI 미리보기")
  })

  it("creates one StrictMode session and aborts the create when the page leaves", async () => {
    let resolve!: (value: BeginnerCanAttackState) => void
    api.createBeginnerCanAttackSession.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const view = render(<StrictMode><BeginnerCanAttackLabPage scenario="spoofing" /></StrictMode>)
    expect(api.createBeginnerCanAttackSession).toHaveBeenCalledTimes(1)
    const signal = api.createBeginnerCanAttackSession.mock.calls[0]?.[1] as AbortSignal
    view.unmount()
    await act(async () => undefined)
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(session("spoofing")))
  })

  it("renders an explicit loading state before reporting a backend outage", async () => {
    let reject!: (reason: unknown) => void
    api.createBeginnerCanAttackSession.mockReturnValueOnce(
      new Promise((_resolve, rejectPromise) => { reject = rejectPromise }),
    )
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)

    expect(screen.getByRole("status")).toHaveTextContent("세션 연결 중")
    await act(async () => reject(new Error("backend offline")))
    expect(await screen.findByRole("alert")).toHaveTextContent("backend offline")
    expect(screen.getByRole("button", { name: "세션 다시 연결" })).toBeInTheDocument()
  })

  it("shows observed terminal frames only after the learner runs a command", async () => {
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    expect(screen.queryByText("0x701")).not.toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: "제한 터미널 명령" }), "candump -L vcan0")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(await within(screen.getByRole("region", { name: "Network monitor" })).findByText("0x701")).toBeInTheDocument()
  })

  it("uses a returned capture identity instead of duplicating its candump output", async () => {
    const current = session("replay")
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(result(current, {
      output: "(1721000000.100000) vcan0 702#0001",
      captures: [{
        captureId: "capture-1",
        timestamp: 1_721_000_000_100,
        sessionId: current.sessionId,
        generation: current.generation,
        fileName: "observed.log",
        canId: "0x702",
        data: ["00", "01"],
        verdict: "CAPTURED",
      }],
    }))
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")
    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cat observed.log",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    expect(
      await within(monitor).findAllByRole("button", {
        name: "0x702 00 01 frame 선택",
      }),
    ).toHaveLength(1)
    expect(within(monitor).getByText("1 / 300")).toBeInTheDocument()
  })

  it("keeps rejected REST results in the monitor without mutating the vehicle", async () => {
    const current = session("replay")
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(result(current, {
      ok: false,
      code: "REPLAY_CONTENT_MISMATCH",
      attempts: [{ attemptId: "rejected", timestamp: 10, sessionId: current.sessionId, generation: 0, canId: "0x702", data: ["FF"], verdict: "REPLAY_CONTENT_MISMATCH" }],
    }))
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")
    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    expect((await screen.findAllByText("REPLAY_CONTENT_MISMATCH")).length).toBeGreaterThan(0)
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
  })

  it("applies one accepted current live event to only the intended part and monitor once", async () => {
    const current = session("spoofing")
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    act(() => stream.options?.onEvent(liveEvent(current)))
    await flushStream()
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 1 })
    expect(within(screen.getByRole("region", { name: "Network monitor" })).getAllByText("EXECUTED")).toHaveLength(1)
    act(() => stream.options?.onEvent(liveEvent(current)))
    await flushStream()
    expect(within(screen.getByRole("region", { name: "Network monitor" })).getAllByText("EXECUTED")).toHaveLength(1)
  })

  it("restores a current reconnect snapshot to the vehicle without adding monitor traffic", async () => {
    const current = session("replay")
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")
    act(() => stream.options?.onEvent(liveEvent(current, { replay: true })))
    await flushStream()
    expect(vehicle.isOpen("doorL")).toBe(true)
    expect(within(screen.getByRole("region", { name: "Network monitor" })).queryByText("EXECUTED")).not.toBeInTheDocument()
  })

  it("resets all local evidence and advances the authoritative generation", async () => {
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    await user.type(screen.getByRole("textbox", { name: "제한 터미널 명령" }), "candump -L vcan0")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    const monitor = screen.getByRole("region", { name: "Network monitor" })
    await within(monitor).findByText("0x701")
    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(within(monitor).queryByText("0x701")).not.toBeInTheDocument())
    expect(screen.getByRole("textbox", { name: "제한 터미널 명령" })).toHaveValue("")
  })
})
