// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { StrictMode } from "react"
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import type {
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"
import { vehicle } from "../vehicle/vehicleStore"
import type {
  DoorLabScriptResult,
  DoorLabSessionState,
  DoorLabTerminalResult,
} from "./doorLabTypes"

const MONITOR_TIMESTAMP = new Date(2023, 10, 15, 7, 13, 20).getTime()

const api = vi.hoisted(() => ({
  createDoorLabSession: vi.fn(),
  resetDoorLabSession: vi.fn(),
  runDoorLabCommand: vi.fn(),
  runDoorLabScript: vi.fn(),
}))

const stream = vi.hoisted(() => ({
  connect: vi.fn(),
  connections: [] as Array<{
    active: boolean
    disconnect: ReturnType<typeof vi.fn>
    options: {
      onEvent: (event: CanEvent) => void
      onStatus?: (status: "connecting" | "open" | "closed") => void
    }
  }>,
}))

const playbackHarness = vi.hoisted(() => ({
  onComplete: undefined as ((runKey: string) => void) | undefined,
  snapshots: [] as VehicleFlowPlaybackSnapshot[],
  lastSignature: "",
}))

vi.mock("./doorLabApi", () => api)
vi.mock("../can/events/backendProvider", () => ({
  connectCanStream: stream.connect,
}))
vi.mock("../vehicle/useVehicleFlowPlayback", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../vehicle/useVehicleFlowPlayback")>()
  return {
    ...actual,
    useVehicleFlowPlayback: (
      options: Parameters<typeof actual.useVehicleFlowPlayback>[0],
    ) => {
      playbackHarness.onComplete = options.onComplete
      return actual.useVehicleFlowPlayback(options)
    },
  }
})
vi.mock("./DoorAttackVehicle", () => ({
  default: ({
    currentStage,
    playback,
  }: {
    currentStage?: string
    playback?: VehicleFlowPlaybackSnapshot
  }) => {
    const signature = playback
      ? [
          playback.playbackId,
          playback.phase,
          playback.trace?.traceId ?? "none",
          playback.traceIndex,
          playback.segmentIndex,
        ].join(":")
      : "none"
    if (playback && signature !== playbackHarness.lastSignature) {
      playbackHarness.lastSignature = signature
      playbackHarness.snapshots.push(playback)
    }
    return (
      <div
        aria-label="Toy Vehicle 3D view"
        data-current-stage={currentStage}
        data-playback-phase={playback?.phase ?? "missing"}
      />
    )
  },
}))

import DoorAttackLabPage from "./DoorAttackLabPage"

const initialSession: DoorLabSessionState = {
  sessionId: "session-1",
  generation: 0,
  stage: "정찰",
  targetLabel: "Toy Body ECU",
  messageContractStatus: "UNKNOWN",
  vehicleState: { leftDoor: "closed", rightDoor: "closed" },
  evidence: [],
  attemptCount: 0,
  completed: false,
}

const resetSession: DoorLabSessionState = {
  ...initialSession,
  generation: 1,
}

const executedDoorTrace: VehicleFlowTrace = {
  traceId: "attempt-1",
  attemptId: "attempt-1",
  sequence: 1,
  kind: "inject",
  commandLabel: "cansend vcan0 456#000113B7",
  commandIndex: 1,
  canId: "0x456",
  data: ["00", "01", "13", "B7"],
  route: ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
  stoppedAt: null,
  outcome: "EXECUTED",
  ecuVerdict: "EXECUTED",
  idsVerdict: "NORMAL",
  effectTarget: "leftDoor",
  effectState: "open",
  effectApplied: true,
}

const rejectedDoorTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "attempt-rejected",
  attemptId: "attempt-rejected",
  data: ["01", "01", "10", "B5"],
  route: ["terminal", "obd", "ids", "gateway", "body"],
  stoppedAt: "body",
  outcome: "REJECTED",
  ecuVerdict: "COUNTER_REJECTED",
  idsVerdict: "ALERT",
  effectTarget: null,
  effectState: null,
  effectApplied: false,
}

const captureDoorTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "capture-1",
  attemptId: null,
  kind: "capture",
  commandLabel: "candump -L vcan0",
  commandIndex: null,
  canId: "0x2a0",
  data: ["A5", "01"],
  route: ["terminal", "obd", "monitor"],
  outcome: "OBSERVED",
  ecuVerdict: null,
  idsVerdict: null,
  effectTarget: null,
  effectState: null,
  effectApplied: false,
}

const localDoorTrace: VehicleFlowTrace = {
  ...captureDoorTrace,
  traceId: "terminal:pwd",
  kind: "local",
  commandLabel: "pwd",
  canId: null,
  data: [],
  route: ["terminal"],
  outcome: "LOCAL",
}

const acceptedRunResult: DoorLabScriptResult = {
  attempts: [
    {
      attemptId: "attempt-1",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x456",
      data: ["00", "01", "13", "B7"],
      verdict: "EXECUTED",
    },
  ],
  idsStatus: "NORMAL",
  state: {
    ...initialSession,
    stage: "증거",
    vehicleState: { leftDoor: "open", rightDoor: "closed" },
    attemptCount: 1,
    completed: true,
  },
  error: null,
  flowTraces: [executedDoorTrace],
}

const captureResult: DoorLabTerminalResult = {
  ok: true,
  code: "OK",
  output: "(168120.044) vcan0 2A0#A501",
  frames: [
    {
      attemptId: "session-1-capture-000001",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x2a0",
      data: ["A5", "01"],
      verdict: "OBSERVED",
    },
  ],
  state: {
    ...initialSession,
    stage: "분석",
    messageContractStatus: "OBSERVED",
    evidence: [{ kind: "capture", status: "observed" }],
  },
  idsStatus: null,
  flowTraces: [captureDoorTrace],
}

const acceptedTerminalResult: DoorLabTerminalResult = {
  ok: true,
  code: "EXECUTED",
  output: "EXECUTED",
  frames: [
    {
      attemptId: "session-1-attempt-terminal",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x555",
      data: ["00", "01"],
      verdict: "EXECUTED",
    },
  ],
  state: {
    ...initialSession,
    stage: "IDS 검증",
    messageContractStatus: "INFERRED",
    vehicleState: { leftDoor: "open", rightDoor: "closed" },
    evidence: [{ kind: "attempt", status: "recorded" }],
    attemptCount: 1,
  },
  idsStatus: "ALERT",
  flowTraces: [
    {
      ...executedDoorTrace,
      traceId: "session-1-attempt-terminal",
      attemptId: "session-1-attempt-terminal",
      commandIndex: null,
      commandLabel: "cansend vcan0 555#0001",
      canId: "0x555",
      data: ["00", "01"],
      idsVerdict: "ALERT",
    },
  ],
}

const blockedRun: DoorLabScriptResult = {
  attempts: [
    {
      attemptId: "session-1-attempt-000001",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x101",
      data: ["00", "01", "13", "00"],
      verdict: "CHECKSUM_INVALID",
    },
  ],
  idsStatus: "ALERT",
  state: { ...initialSession, stage: "Replay 실패", attemptCount: 1 },
  error: null,
  flowTraces: [rejectedDoorTrace],
}

function deferred<T>() {
  let resolveDeferred: ((value: T) => void) | undefined
  let rejectDeferred: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve
    rejectDeferred = reject
  })
  return {
    promise,
    resolve(value: T) {
      if (!resolveDeferred) throw new Error("deferred resolve is unavailable")
      resolveDeferred(value)
    },
    reject(reason?: unknown) {
      if (!rejectDeferred) throw new Error("deferred reject is unavailable")
      rejectDeferred(reason)
    },
  }
}

function acceptedDoorEvent(
  sessionId: string,
  generation: number,
  overrides: Partial<CanEvent> = {},
): CanEvent {
  return {
    eventId: `event-${sessionId}-${generation}`,
    timestamp: MONITOR_TIMESTAMP,
    channel: "vcan0",
    origin: "backend",
    frame: { canId: "0x555", dlc: 2, data: ["00", "01"] },
    lab: { labId: "door-blackbox-v1", sessionId, generation },
    context: { command: "DOOR_LOCK", source: "obd", target: "body" },
    processing: { filterResult: "ACCEPT", executionResult: "EXECUTED" },
    monitoring: { idsObserved: true, status: "NORMAL" },
    ...overrides,
  }
}

let animationFrames: FrameRequestCallback[] = []

async function flushCanEvents() {
  await act(async () => {
    const callbacks = animationFrames
    animationFrames = []
    callbacks.forEach((callback) => callback(0))
  })
}

function latestConnection() {
  const connection = stream.connections.at(-1)
  if (!connection) throw new Error("expected a CAN stream connection")
  return connection
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }))
}

describe("DoorAttackLabPage", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vehicle.reset()
    playbackHarness.onComplete = undefined
    playbackHarness.snapshots = []
    playbackHarness.lastSignature = ""
    stubReducedMotion(true)
    api.createDoorLabSession.mockResolvedValue(initialSession)
    api.resetDoorLabSession.mockResolvedValue(resetSession)
    api.runDoorLabCommand.mockResolvedValue(captureResult)
    api.runDoorLabScript.mockResolvedValue(blockedRun)
    stream.connections = []
    stream.connect.mockImplementation((options) => {
      const connection = {
        active: true,
        disconnect: vi.fn(),
        options,
      }
      stream.connections.push(connection)
      options.onStatus?.("open")
      return () => {
        connection.active = false
        connection.disconnect()
      }
    })
    animationFrames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
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
    expect(initialScript).not.toMatch(
      /(?:0x)?456|456#|000113b7|000114b0|000115b1|checksum|counter|seed/i,
    )

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
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-current-stage",
      "정찰",
    )
    const truthQualifier = screen.getByText(
      "교육용 논리 위치 · 실제 OEM 배치 아님",
    )
    expect(truthQualifier).toHaveClass("door-attack-lab__truth-qualifier")
    expect(truthQualifier).toBeVisible()
    expect(stream.connect).toHaveBeenCalledTimes(1)
  })

  it("explains how terminal reconnaissance becomes a door lab script without revealing the answer", async () => {
    render(<DoorAttackLabPage />)

    expect(await screen.findByText("Script 사용법")).toBeInTheDocument()
    expect(
      screen.getByText(/Terminal에서 로그와 프레임을 먼저 관찰/),
    ).toBeInTheDocument()
    expect(screen.getByText(/실행할 줄 앞의 #을 제거/)).toBeInTheDocument()
    expect(
      screen.getByText(/interval_ms=<10\.\.2000>.*cansend/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Toy IDS.*Proof/)).toBeInTheDocument()

    const guide = screen.getByText("Script 사용법").closest("details")
    expect(guide).not.toBeNull()
    expect(guide).not.toHaveTextContent(/456#|000113B7|000114B0|000115B1/i)
  })

  it("keeps the accepted door closed until playback reaches the effect endpoint", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
    render(<DoorAttackLabPage />)
    const runButton = await screen.findByRole("button", {
      name: "스크립트 실행",
    })

    await user.click(runButton)
    await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(runButton).toBeDisabled()
    expect(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "실습 초기화" })).toBeEnabled()
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "playing",
    )

    act(() => vi.runAllTimers())

    expect(vehicle.isOpen("doorL")).toBe(true)
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "complete",
    )
  })

  it("plays the complete authoritative trace array once in sequence order", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const observedSecond: VehicleFlowTrace = {
      ...captureDoorTrace,
      traceId: "capture-after-effect",
      sequence: 2,
    }
    api.runDoorLabScript.mockResolvedValueOnce({
      ...acceptedRunResult,
      flowTraces: [observedSecond, executedDoorTrace],
    })
    render(<DoorAttackLabPage />)

    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())
    act(() => vi.advanceTimersByTime(1_100))
    act(() => vi.advanceTimersByTime(220))
    act(() => vi.runAllTimers())

    expect(
      playbackHarness.snapshots
        .filter(
          (snapshot) =>
            snapshot.phase === "playing" && snapshot.segmentIndex === 0,
        )
        .map((snapshot) => snapshot.trace?.traceId),
    ).toEqual(["attempt-1", "capture-after-effect"])
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it("never applies effects for rejected, capture, or local traces", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const setPart = vi.spyOn(vehicle, "set")
    api.runDoorLabScript.mockResolvedValueOnce({
      ...blockedRun,
      flowTraces: [
        { ...localDoorTrace, sequence: 1 },
        { ...captureDoorTrace, sequence: 2 },
        { ...rejectedDoorTrace, sequence: 3 },
      ],
    })
    render(<DoorAttackLabPage />)
    await screen.findByRole("button", { name: "스크립트 실행" })
    setPart.mockClear()

    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())
    act(() => vi.advanceTimersByTime(220))
    act(() => vi.advanceTimersByTime(220))
    act(() => vi.advanceTimersByTime(220))
    act(() => vi.advanceTimersByTime(220))
    act(() => vi.runAllTimers())

    expect(
      playbackHarness.snapshots
        .filter(
          (snapshot) =>
            snapshot.phase === "playing" && snapshot.segmentIndex === 0,
        )
        .map((snapshot) => snapshot.trace?.traceId),
    ).toEqual(["terminal:pwd", "capture-1", "attempt-rejected"])
    expect(setPart).not.toHaveBeenCalledWith("doorL", 1)
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it("keeps normal live events monitor-only and restores safe replay snapshots", async () => {
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")
    const monitor = screen.getByRole("region", { name: "Network monitor" })

    act(() =>
      latestConnection().options.onEvent(acceptedDoorEvent("session-1", 0)),
    )
    await flushCanEvents()

    expect(within(monitor).getByText("EXECUTED")).toBeInTheDocument()
    expect(vehicle.isOpen("doorL")).toBe(false)

    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "authoritative-reconnect",
          replay: true,
        }),
      ),
    )
    await flushCanEvents()

    expect(vehicle.isOpen("doorL")).toBe(true)
    expect(within(monitor).getAllByText("EXECUTED")).toHaveLength(1)
  })

  it("reset cancels a pending effect before awaiting the reset response", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const resetRequest = deferred<DoorLabSessionState>()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
    api.resetDoorLabSession.mockReturnValueOnce(resetRequest.promise)
    render(<DoorAttackLabPage />)
    const runButton = await screen.findByRole("button", {
      name: "스크립트 실행",
    })
    await waitFor(() => expect(runButton).toBeEnabled())
    await user.click(runButton)
    await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "실습 초기화" })).toBeEnabled(),
    )
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "playing",
    )

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalledOnce())
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "cancelled",
    )
    act(() => vi.runAllTimers())

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "cancelled",
    )

    await act(async () => resetRequest.resolve(resetSession))
    await waitFor(() =>
      expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
        "data-playback-phase",
        "idle",
      ),
    )
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it("ignores a stale completion whose run key does not match the pending action", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
    render(<DoorAttackLabPage />)
    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())

    expect(playbackHarness.onComplete).toBeTypeOf("function")
    act(() => playbackHarness.onComplete?.("session-1:0:run:stale-action"))
    expect(vehicle.isOpen("doorL")).toBe(false)

    act(() => vi.runAllTimers())
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it("warns and immediately reconciles authoritative state for malformed traces", async () => {
    const user = userEvent.setup()
    api.runDoorLabScript.mockResolvedValueOnce({
      ...acceptedRunResult,
      flowTraces: [
        {
          ...executedDoorTrace,
          route: ["terminal", "unknown-node"],
        },
      ],
    })
    render(<DoorAttackLabPage />)

    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )

    expect(
      await screen.findByText(
        "공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.",
      ),
    ).toBeInTheDocument()
    expect(vehicle.isOpen("doorL")).toBe(true)
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "idle",
    )
  })

  it("clears a completed attack snapshot when reset succeeds", async () => {
    const user = userEvent.setup()
    api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
    render(<DoorAttackLabPage />)
    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
        "data-playback-phase",
        "complete",
      ),
    )

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))

    await waitFor(() =>
      expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
        "data-playback-phase",
        "idle",
      ),
    )
    expect(vehicle.isOpen("doorL")).toBe(false)
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

  it("applies the authoritative capture state while keeping Toy IDS pending", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cat baseline.log",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    const evidence = screen.getByRole("region", { name: "Evidence" })
    await waitFor(() => {
      expect(evidence).toHaveTextContent(/Stage\s*분석/)
      expect(evidence).toHaveTextContent(/Toy IDS\s*PENDING/)
      expect(evidence).toHaveTextContent(/Attempts\s*0/)
      expect(evidence).toHaveTextContent("capture: observed")
    })
    expect(screen.getByText("Contract").closest("div")).toHaveTextContent(
      "OBSERVED",
    )
  })

  it("uses terminal state and IDS while deferring the accepted effect to its trace", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.runDoorLabCommand.mockResolvedValueOnce(acceptedTerminalResult)
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cansend vcan0 555#0001",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    const evidence = screen.getByRole("region", { name: "Evidence" })
    await waitFor(() => {
      expect(evidence).toHaveTextContent(/Stage\s*IDS 검증/)
      expect(evidence).toHaveTextContent(/Toy IDS\s*ALERT/)
      expect(evidence).toHaveTextContent(/Attempts\s*1/)
      expect(evidence).toHaveTextContent("attempt: recorded")
    })
    const monitor = screen.getByRole("region", { name: "Network monitor" })
    expect(within(monitor).queryByText("EXECUTED")).not.toBeInTheDocument()
    expect(vehicle.isOpen("doorL")).toBe(false)

    act(() =>
      latestConnection().options.onEvent(acceptedDoorEvent("session-1", 0)),
    )
    await act(async () => vi.advanceTimersByTime(16))

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(within(monitor).getAllByText("EXECUTED")).toHaveLength(1)
    expect(
      within(monitor).getAllByRole("button", {
        name: /0x555 00 01 frame 선택/,
      }),
    ).toHaveLength(1)

    act(() => vi.runAllTimers())
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it.each([
    ["wrong session", { sessionId: "session-2", generation: 0 }],
    ["wrong generation", { sessionId: "session-1", generation: 1 }],
  ])(
    "ignores every terminal UI mutation from a %s response",
    async (label, correlation) => {
      const user = userEvent.setup()
      const output = `stale-${label.replace(" ", "-")}-output`
      api.runDoorLabCommand.mockResolvedValueOnce({
        ...captureResult,
        output,
        state: { ...captureResult.state, ...correlation },
        idsStatus: "ALERT",
      })
      render(<DoorAttackLabPage />)
      await screen.findByText("BODY ECU")

      const input = screen.getByRole("textbox", { name: "제한 터미널 명령" })
      await user.type(input, "pwd")
      await user.click(screen.getByRole("button", { name: "명령 실행" }))
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "명령 실행" })).toBeEnabled(),
      )

      expect(input).toHaveValue("pwd")
      expect(
        screen.getByRole("region", { name: "Restricted terminal" }),
      ).not.toHaveTextContent(output)
      const evidence = screen.getByRole("region", { name: "Evidence" })
      expect(evidence).toHaveTextContent(/Stage\s*정찰/)
      expect(evidence).toHaveTextContent(/Toy IDS\s*PENDING/)
      expect(evidence).toHaveTextContent(/Attempts\s*0/)
      expect(screen.getByText("0 / 300")).toBeInTheDocument()
    },
  )

  it("does not erase the last authoritative IDS verdict when capture has no IDS result", async () => {
    const user = userEvent.setup()
    api.runDoorLabCommand.mockResolvedValueOnce({
      ...captureResult,
      state: {
        ...blockedRun.state,
        messageContractStatus: "INFERRED",
        evidence: [
          { kind: "capture", status: "observed" },
          { kind: "attempt", status: "recorded" },
        ],
      },
      idsStatus: null,
    })
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    const evidence = screen.getByRole("region", { name: "Evidence" })
    await waitFor(() => expect(evidence).toHaveTextContent(/Toy IDS\s*ALERT/))

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cat baseline.log",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    await waitFor(() => {
      expect(evidence).toHaveTextContent(/Toy IDS\s*ALERT/)
      expect(evidence).toHaveTextContent("capture: observed")
    })
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

  it("clears the restricted terminal input and command history on reset", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    const input = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    await user.type(input, "pwd")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await waitFor(() =>
      expect(api.runDoorLabCommand).toHaveBeenCalledWith(
        "session-1",
        "pwd",
        expect.any(AbortSignal),
      ),
    )

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalled())
    await user.click(input)
    await user.keyboard("{ArrowUp}")

    expect(input).toHaveValue("")
  })

  it("creates one session in StrictMode, applies its closed state, and cleans up every stream", async () => {
    const createRequest = deferred<DoorLabSessionState>()
    api.createDoorLabSession.mockReturnValueOnce(createRequest.promise)
    vehicle.openDoor("both")

    const view = render(
      <StrictMode>
        <DoorAttackLabPage />
      </StrictMode>,
    )

    expect(api.createDoorLabSession).toHaveBeenCalledTimes(1)
    expect(
      stream.connections.filter((connection) => connection.active),
    ).toHaveLength(1)

    await act(async () => createRequest.resolve(initialSession))
    await waitFor(() => expect(vehicle.isOpen("doorL")).toBe(false))

    view.unmount()
    await act(async () => undefined)
    expect(stream.connections.every((connection) => !connection.active)).toBe(
      true,
    )
    expect(
      stream.connections.every(
        (connection) => connection.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true)
  })

  it("does not apply a deferred create response after unmount", async () => {
    const createRequest = deferred<DoorLabSessionState>()
    api.createDoorLabSession.mockReturnValueOnce(createRequest.promise)
    vehicle.openDoor("both")

    const view = render(<DoorAttackLabPage />)
    const signal = api.createDoorLabSession.mock.calls[0]?.[0] as AbortSignal
    view.unmount()
    await act(async () => undefined)

    expect(signal.aborted).toBe(true)
    await act(async () => createRequest.resolve(initialSession))
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it("aborts a deferred reset and prevents stale global vehicle mutation after unmount", async () => {
    const resetRequest = deferred<DoorLabSessionState>()
    api.resetDoorLabSession.mockReturnValueOnce(resetRequest.promise)
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")
    vehicle.openDoor("both")

    const resetButton = screen.getByRole("button", { name: "실습 초기화" })
    await waitFor(() => expect(resetButton).toBeEnabled())
    await user.click(resetButton)
    await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalledOnce())
    const signal = api.resetDoorLabSession.mock.calls[0]?.[1] as AbortSignal
    cleanup()
    await act(async () => undefined)

    expect(signal.aborted).toBe(true)
    await act(async () => resetRequest.resolve(initialSession))
    expect(vehicle.isOpen("doorL")).toBe(true)
  })

  it.each([
    ["run", "스크립트 실행", "runDoorLabScript"],
    ["terminal", "명령 실행", "runDoorLabCommand"],
  ] as const)(
    "aborts a deferred %s response after unmount",
    async (kind, buttonName, apiName) => {
      const request = deferred<DoorLabScriptResult | DoorLabTerminalResult>()
      api[apiName].mockReturnValueOnce(request.promise)
      const user = userEvent.setup()
      render(<DoorAttackLabPage />)
      await screen.findByText("BODY ECU")

      if (kind === "terminal") {
        const input = screen.getByRole("textbox", {
          name: "제한 터미널 명령",
        })
        await waitFor(() => expect(input).toBeEnabled())
        await user.type(input, "pwd")
      }
      const actionButton = screen.getByRole("button", { name: buttonName })
      await waitFor(() => expect(actionButton).toBeEnabled())
      await user.click(actionButton)
      await waitFor(() => expect(api[apiName]).toHaveBeenCalledOnce())
      const signalIndex = kind === "run" ? 2 : 2
      const signal = api[apiName].mock.calls[0]?.[signalIndex] as AbortSignal
      cleanup()
      await act(async () => undefined)

      expect(signal.aborted).toBe(true)
      await act(async () =>
        request.resolve(kind === "run" ? blockedRun : captureResult),
      )
    },
  )

  it("uses the WebSocket as the canonical accepted row without mutating the vehicle", async () => {
    const user = userEvent.setup()
    api.runDoorLabScript.mockResolvedValueOnce({
      attempts: [
        {
          attemptId: "session-1-attempt-accepted",
          timestamp: 1_700_000_000_100,
          canId: "0x555",
          data: ["00", "01"],
          verdict: "EXECUTED",
        },
        {
          attemptId: "session-1-attempt-rejected",
          timestamp: 1_700_000_000_101,
          canId: "0x555",
          data: ["00", "FF"],
          verdict: "CHECKSUM_INVALID",
        },
      ],
      idsStatus: "ALERT",
      state: { ...initialSession, attemptCount: 2 },
      error: null,
    } satisfies DoorLabScriptResult)
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    const monitor = screen.getByRole("region", { name: "Network monitor" })
    expect(
      await within(monitor).findByText("CHECKSUM_INVALID"),
    ).toBeInTheDocument()
    expect(within(monitor).queryByText("EXECUTED")).not.toBeInTheDocument()

    act(() =>
      latestConnection().options.onEvent(acceptedDoorEvent("session-1", 0)),
    )
    await flushCanEvents()

    expect(
      within(monitor).getAllByRole("button", {
        name: /0x555 00 01 frame 선택/,
      }),
    ).toHaveLength(1)
    const acceptedRow = within(monitor).getByText("EXECUTED").closest("tr")
    expect(acceptedRow).not.toBeNull()
    expect(within(acceptedRow!).getByText("07:13:20")).toBeInTheDocument()
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it("renders the server epoch timestamp and preserves distinct attempt identities", async () => {
    const user = userEvent.setup()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    vi.spyOn(Date, "now").mockReturnValue(42)
    api.runDoorLabCommand
      .mockResolvedValueOnce({
        ...captureResult,
        frames: [{ ...captureResult.frames[0], attemptId: "capture-a" }],
      })
      .mockResolvedValueOnce({
        ...captureResult,
        frames: [
          {
            ...captureResult.frames[0],
            attemptId: "capture-b",
            data: ["A5", "02"],
          },
        ],
      })
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    for (const command of ["cat baseline.log", "cat door-open.log"]) {
      await user.type(
        screen.getByRole("textbox", { name: "제한 터미널 명령" }),
        command,
      )
      await user.click(screen.getByRole("button", { name: "명령 실행" }))
    }

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    expect(
      within(monitor)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["0x2a0 A5 01 frame 선택", "0x2a0 A5 02 frame 선택"])
    expect(
      within(monitor).getByRole("button", { name: /0x2a0 A5 01 frame 선택/i }),
    ).toBeInTheDocument()
    expect(
      within(monitor).getByRole("button", { name: /0x2a0 A5 02 frame 선택/i }),
    ).toBeInTheDocument()
    expect(within(monitor).getAllByText("07:13:20")).toHaveLength(2)
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key")
    consoleError.mockRestore()
  })

  it("keeps selection consistent when the selected row is evicted at the 300-frame cap", async () => {
    const user = userEvent.setup()
    const frames = Array.from({ length: 301 }, (_, index) => ({
      attemptId: `capture-${index}`,
      timestamp: 1_700_000_000_000 + index,
      canId: `0x${(0x600 + index).toString(16)}`,
      data: [(index % 256).toString(16).padStart(2, "0")],
      verdict: "OBSERVED",
    }))
    api.runDoorLabCommand
      .mockResolvedValueOnce({ ...captureResult, frames })
      .mockResolvedValueOnce({
        ...captureResult,
        frames: [
          {
            attemptId: "capture-newest",
            timestamp: 1_700_000_001_000,
            canId: "0x7ff",
            data: ["FE"],
            verdict: "OBSERVED",
          },
        ],
      })
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cat baseline.log",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(await screen.findByText("300 / 300")).toBeInTheDocument()

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    await user.click(
      within(monitor).getByRole("button", { name: /0x601 01 frame 선택/i }),
    )
    expect(
      screen.getByRole("region", { name: "Binary inspector" }),
    ).toHaveTextContent("00000001")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "cat newest.log",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    expect(
      within(monitor).queryByRole("button", { name: /0x601 01 frame 선택/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Binary inspector" }),
    ).toHaveTextContent("11111110")
  }, 15_000)

  it("rejects an old-session event and keeps current live events monitor-only", async () => {
    const secondSession = {
      ...initialSession,
      sessionId: "session-2",
      generation: 0,
    }
    api.createDoorLabSession
      .mockResolvedValueOnce(initialSession)
      .mockResolvedValueOnce(secondSession)

    const firstView = render(<DoorAttackLabPage />)
    await waitFor(() =>
      expect(api.createDoorLabSession).toHaveBeenCalledTimes(1),
    )
    act(() =>
      latestConnection().options.onEvent(acceptedDoorEvent("session-1", 0)),
    )
    expect(vehicle.isOpen("doorL")).toBe(false)
    firstView.unmount()
    await act(async () => undefined)

    render(<DoorAttackLabPage />)
    await waitFor(() =>
      expect(api.createDoorLabSession).toHaveBeenCalledTimes(2),
    )
    await waitFor(() => expect(vehicle.isOpen("doorL")).toBe(false))

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "old-session-delayed",
        }),
      ),
    )
    await flushCanEvents()
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(within(monitor).queryByText("EXECUTED")).not.toBeInTheDocument()

    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-2", 0, {
          eventId: "current-session-event",
        }),
      ),
    )
    await flushCanEvents()
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(within(monitor).getByText("EXECUTED")).toBeInTheDocument()
  })

  it("rejects a delayed pre-reset generation and observes the current generation", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    vehicle.openDoor("L")
    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(vehicle.isOpen("doorL")).toBe(false))

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "pre-reset-delayed",
        }),
      ),
    )
    await flushCanEvents()
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(within(monitor).queryByText("EXECUTED")).not.toBeInTheDocument()

    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 1, {
          eventId: "current-generation",
        }),
      ),
    )
    await flushCanEvents()
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(within(monitor).getByText("EXECUTED")).toBeInTheDocument()
  })
})
