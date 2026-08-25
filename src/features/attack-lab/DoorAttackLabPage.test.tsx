// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { StrictMode } from "react"
import { readFileSync } from "node:fs"
import {
  act,
  cleanup,
  fireEvent,
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
  VehicleFlowPresentation,
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
  renderRail: false,
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
vi.mock("./DoorAttackVehicle", async () => {
  const { default: VehicleFlowRail } = await import("../vehicle/VehicleFlowRail")
  return {
    default: ({
      currentStage,
      playback,
      presentation,
    }: {
      currentStage?: string
      playback?: VehicleFlowPlaybackSnapshot
      presentation?: VehicleFlowPresentation
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
          data-presentation-command={presentation?.commandLabel ?? "missing"}
          data-presentation-status={
            presentation?.nodeFeedback?.status ?? "missing"
          }
        >
          {playbackHarness.renderRail ? (
            <VehicleFlowRail
              scenarioTitle="Door attack route"
              route={["obd", "ids", "gateway", "body", "leftDoor"]}
              playback={playback ?? {
                playbackId: 0,
                phase: "idle",
                trace: null,
                traceIndex: 0,
                traceCount: 0,
                segmentIndex: 0,
              }}
              presentation={presentation}
              accent="#d94b4b"
            />
          ) : null}
        </div>
      )
    },
  }
})

import DoorAttackLabPage from "./DoorAttackLabPage"

const doorAttackLabCss = readFileSync(
  "src/features/attack-lab/doorAttackLab.css",
  "utf8",
)

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

const multiFrameFirstTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "multi-attempt-1",
  attemptId: "multi-attempt-1",
  sequence: 1,
  commandLabel: "cansend vcan0 555#0001",
  effectTarget: null,
  effectState: null,
  effectApplied: false,
}

const multiFrameSecondTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "multi-attempt-2",
  attemptId: "multi-attempt-2",
  sequence: 2,
  commandLabel: "cansend vcan0 555#0002",
  canId: "0x555",
  data: ["00", "02"],
}

const multiFrameRunResult: DoorLabScriptResult = {
  ...acceptedRunResult,
  attempts: [
    {
      attemptId: "multi-attempt-1",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x555",
      data: ["00", "01"],
      verdict: "EXECUTED",
    },
    {
      attemptId: "multi-attempt-2",
      timestamp: MONITOR_TIMESTAMP + 1,
      canId: "0x555",
      data: ["00", "02"],
      verdict: "EXECUTED",
    },
  ],
  state: {
    ...acceptedRunResult.state,
    attemptCount: 2,
  },
  flowTraces: [multiFrameFirstTrace, multiFrameSecondTrace],
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

const rejectedTerminalResult: DoorLabTerminalResult = {
  ok: false,
  code: "COUNTER_REJECTED",
  output: "COUNTER_REJECTED",
  frames: [
    {
      attemptId: "attempt-rejected",
      timestamp: MONITOR_TIMESTAMP,
      canId: "0x456",
      data: ["01", "01", "10", "B5"],
      verdict: "COUNTER_REJECTED",
    },
  ],
  state: {
    ...initialSession,
    stage: "Replay 실패",
    attemptCount: 1,
  },
  idsStatus: "ALERT",
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
    playbackHarness.renderRail = false
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
    const truthQualifier = screen
      .getAllByText("교육용 논리 위치 · 실제 OEM 배치 아님")
      .find((element) =>
        element.classList.contains("door-attack-lab__truth-qualifier"),
      )
    expect(truthQualifier).toBeDefined()
    expect(truthQualifier).toHaveClass("door-attack-lab__truth-qualifier")
    expect(truthQualifier).toBeVisible()
    expect(stream.connect).toHaveBeenCalledTimes(1)
  })

  it("keeps the terminal column at its content height instead of stretching it to the Activity column", async () => {
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    expect(document.querySelector(".door-attack-lab__secondary")).not.toBeNull()
    expect(doorAttackLabCss).toMatch(
      /\.door-attack-lab__secondary\s*\{[^}]*align-items:\s*start;/,
    )
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
    // 5 route transitions × 600ms + 900ms final hold.
    act(() => vi.advanceTimersByTime(3_900))

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
    // Preserve each trace's initial render across React timer batching.
    act(() => vi.advanceTimersByTime(900))
    act(() => vi.advanceTimersByTime(2_100))

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

  it("immediately closes a completed attack and stays safe when reset fails", async () => {
    const resetRequest = deferred<DoorLabSessionState>()
    const user = userEvent.setup()
    api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
    api.resetDoorLabSession.mockReturnValueOnce(resetRequest.promise)
    render(<DoorAttackLabPage />)

    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() => expect(vehicle.isOpen("doorL")).toBe(true))
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "complete",
    )

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalledOnce())

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(vehicle.isOpen("doorR")).toBe(false)
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "idle",
    )

    act(() => playbackHarness.onComplete?.("session-1:0:run:1"))
    expect(vehicle.isOpen("doorL")).toBe(false)

    await act(async () => resetRequest.reject(new Error("reset failed")))
    expect(await screen.findByRole("alert")).toHaveTextContent("reset failed")
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-playback-phase",
      "idle",
    )

    act(() => playbackHarness.onComplete?.("session-1:0:run:1"))
    expect(vehicle.isOpen("doorL")).toBe(false)
  })

  it.each([
    ["run", "스크립트 실행", "runDoorLabScript", acceptedRunResult],
    ["terminal", "명령 실행", "runDoorLabCommand", acceptedTerminalResult],
  ] as const)(
    "reset supersedes an in-flight %s request before starting its own request",
    async (kind, actionButtonName, apiName, lateResult) => {
      const actionRequest =
        deferred<DoorLabScriptResult | DoorLabTerminalResult>()
      const resetRequest = deferred<DoorLabSessionState>()
      let oldActionAbortedAtResetStart = false
      api[apiName].mockReturnValueOnce(actionRequest.promise)
      api.resetDoorLabSession.mockImplementationOnce(
        (_sessionId: string, _signal: AbortSignal) => {
          const oldSignal = api[apiName].mock.calls[0]?.[2] as AbortSignal
          oldActionAbortedAtResetStart = oldSignal.aborted
          return resetRequest.promise
        },
      )
      const user = userEvent.setup()
      render(<DoorAttackLabPage />)
      await screen.findByText("BODY ECU")

      if (kind === "terminal") {
        await user.type(
          screen.getByRole("textbox", { name: "제한 터미널 명령" }),
          "cansend vcan0 555#0001",
        )
      }
      const actionButton = screen.getByRole("button", {
        name: actionButtonName,
      })
      await waitFor(() => expect(actionButton).toBeEnabled())
      await user.click(actionButton)
      await waitFor(() => expect(api[apiName]).toHaveBeenCalledOnce())
      const oldSignal = api[apiName].mock.calls[0]?.[2] as AbortSignal
      vehicle.openDoor("both")

      const resetButton = screen.getByRole("button", { name: "실습 초기화" })
      expect(resetButton).toBeEnabled()
      await user.click(resetButton)
      await waitFor(() =>
        expect(api.resetDoorLabSession).toHaveBeenCalledOnce(),
      )

      expect(oldActionAbortedAtResetStart).toBe(true)
      expect(oldSignal.aborted).toBe(true)
      expect(vehicle.isOpen("doorL")).toBe(false)
      expect(vehicle.isOpen("doorR")).toBe(false)
      expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
        "data-playback-phase",
        "idle",
      )
      expect(screen.getByRole("button", { name: "초기화 중" })).toBeDisabled()

      await act(async () => actionRequest.resolve(lateResult))
      expect(vehicle.isOpen("doorL")).toBe(false)
      expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
        "data-playback-phase",
        "idle",
      )

      await act(async () => resetRequest.resolve(resetSession))
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "실습 초기화" }),
        ).toBeEnabled(),
      )
      expect(vehicle.isOpen("doorL")).toBe(false)
    },
  )

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
        { timeout: 3_000 },
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

  it("shows PENDING when the latest Door action has no IDS result", async () => {
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
      expect(evidence).toHaveTextContent(/Toy IDS\s*PENDING/)
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
    await act(async () =>
      resetRequest.resolve({
        ...initialSession,
        vehicleState: { leftDoor: "open", rightDoor: "open" },
      }),
    )
    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(vehicle.isOpen("doorR")).toBe(false)
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

  it("keeps an emitted Door rejection silent and progressively discloses Why and Activity evidence", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    api.runDoorLabCommand.mockResolvedValueOnce(rejectedTerminalResult)
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")
    const terminalInput = screen.getByRole("textbox", {
      name: "제한 터미널 명령",
    })
    await waitFor(() => expect(terminalInput).toBeEnabled())

    await user.type(
      terminalInput,
      rejectedDoorTrace.commandLabel,
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await waitFor(() => expect(api.runDoorLabCommand).toHaveBeenCalledOnce())
    expect(api.runDoorLabCommand.mock.calls[0]?.[1])
      .toBe(rejectedDoorTrace.commandLabel)

    const transcript = await screen.findByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(
      await within(transcript).findByText(`$ ${rejectedDoorTrace.commandLabel}`),
    ).toBeInTheDocument()
    expect(within(transcript).queryByText("COUNTER_REJECTED"))
      .not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    const why = screen
      .getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })
      .closest("section")
    expect(why).not.toBeNull()
    expect(within(why!).queryByText("가상 CAN 경로 입력"))
      .not.toBeInTheDocument()
    expect(within(why!).queryByText("Toy ECU")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /COUNTER_REJECTED/ }))
      .toBeInTheDocument()

    act(() => vi.advanceTimersByTime(600))
    expect(within(why!).getByText("가상 CAN 경로 입력")).toBeInTheDocument()
    expect(within(why!).queryByText("Toy ECU")).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_800))
    expect(within(why!).getByText("Toy ECU")).toBeInTheDocument()
    expect(within(why!).getByText("COUNTER_REJECTED")).toBeInTheDocument()
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-presentation-status",
      "REJECTED",
    )
  })

  it("captures a multi-frame script prediction and requires one of its attempt frames before confirmation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    playbackHarness.renderRail = true
    const request = deferred<DoorLabScriptResult>()
    api.runDoorLabScript.mockReturnValueOnce(request.promise)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    const prediction = screen.getByLabelText("실행 전 예상")
    await user.type(prediction, "왼쪽 문 효과가 적용될 것으로 예상합니다.")
    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    await user.clear(prediction)
    await user.type(prediction, "요청 후에 바꾼 예상입니다.")

    await act(async () => request.resolve(multiFrameRunResult))

    expect(screen.getByText("실행 시 기록된 예상").parentElement)
      .toHaveTextContent("왼쪽 문 효과가 적용될 것으로 예상합니다.")
    expect(screen.getByText("공격 조건 충족").parentElement)
      .toHaveTextContent("달성")
    expect(screen.getByText("학습 확인 완료").parentElement)
      .toHaveTextContent("미완료")
    expect(screen.getByText(multiFrameFirstTrace.commandLabel))
      .toBeInTheDocument()
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-presentation-command",
      multiFrameFirstTrace.commandLabel,
    )

    const liveRegions = document.querySelectorAll('[aria-live="polite"]')
    expect(liveRegions).toHaveLength(1)
    expect(liveRegions[0]).toHaveTextContent(
      "EXECUTED 구조화 결과가 Activity에 기록되었습니다.",
    )
    const actionSummary = liveRegions[0].textContent

    act(() => vi.advanceTimersByTime(3_900))
    expect(screen.getByText(multiFrameSecondTrace.commandLabel))
      .toBeInTheDocument()
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-presentation-command",
      multiFrameSecondTrace.commandLabel,
    )
    expect(liveRegions[0]).toHaveTextContent(actionSummary ?? "")
    expect(liveRegions[0]).not.toHaveTextContent(
      multiFrameSecondTrace.commandLabel,
    )

    const explanation = screen.getByLabelText("선택한 근거와 결과 비교")
    await user.type(
      explanation,
      "선택한 프레임과 Toy ECU 결과가 같은 실행에 속한다고 확인했습니다.",
    )
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()

    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "older-unrelated-attempt",
          lab: {
            labId: "door-blackbox-v1",
            sessionId: "session-1",
            generation: 0,
            attemptId: "older-unrelated-attempt",
          },
        }),
      ),
    )
    await flushCanEvents()
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()

    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "multi-attempt-2",
          frame: { canId: "0x555", dlc: 2, data: ["00", "02"] },
          lab: {
            labId: "door-blackbox-v1",
            sessionId: "session-1",
            generation: 0,
            attemptId: "multi-attempt-2",
          },
        }),
      ),
    )
    await flushCanEvents()
    const matchingFrame = await within(
      screen.getByRole("region", { name: "Network monitor" }),
    ).findByRole("button", { name: "0x555 00 02 frame 선택" })
    await user.click(matchingFrame)

    const confirm = screen.getByRole("button", { name: "학습 확인" })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(screen.getByText("학습 확인 완료").parentElement)
      .toHaveTextContent("완료")
  })

  it("invalidates the previous Door action as soon as a second accepted submit starts", async () => {
    const secondRequest = deferred<DoorLabTerminalResult>()
    api.runDoorLabCommand
      .mockResolvedValueOnce(acceptedTerminalResult)
      .mockReturnValueOnce(secondRequest.promise)
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    const prediction = screen.getByLabelText("실행 전 예상")
    await user.type(prediction, "첫 실행에서 왼쪽 문 효과가 적용될 것으로 예상합니다.")
    const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    await user.type(terminal, "cansend vcan0 555#0001")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "session-1-attempt-terminal",
          lab: {
            labId: "door-blackbox-v1",
            sessionId: "session-1",
            generation: 0,
            attemptId: "session-1-attempt-terminal",
          },
        }),
      ),
    )
    await flushCanEvents()
    await user.type(
      screen.getByLabelText("선택한 근거와 결과 비교"),
      "선택한 프레임과 최신 Toy ECU 효과가 같은 실행임을 충분히 확인했습니다.",
    )
    await user.click(screen.getByRole("button", { name: "학습 확인" }))

    expect(screen.getByRole("heading", { name: "왜 이런 결과가 발생했나요?" }))
      .toBeInTheDocument()
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent("달성")
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent("완료")
    expect(screen.getByRole("region", { name: "Binary inspector" }))
      .not.toHaveTextContent("Network monitor에서 frame을 선택하세요.")

    await user.clear(prediction)
    await user.type(prediction, "두 번째 요청에서 현재 캡처할 예상입니다.")
    await user.type(terminal, "cansend vcan0 555#0002")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await waitFor(() => expect(api.runDoorLabCommand).toHaveBeenCalledTimes(2))

    expect(screen.queryByRole("heading", { name: "왜 이런 결과가 발생했나요?" }))
      .not.toBeInTheDocument()
    expect(screen.getByLabelText("Toy Vehicle 3D view")).toHaveAttribute(
      "data-presentation-status",
      "missing",
    )
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent("미달성")
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent("미완료")
    expect(screen.getByText("실행 시 기록된 예상").parentElement)
      .toHaveTextContent("아직 기록되지 않음")
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toHaveValue("")
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()
    expect(screen.getByRole("region", { name: "Binary inspector" }))
      .toHaveTextContent("Network monitor에서 frame을 선택하세요.")
    expect(screen.getByText("Toy IDS").parentElement).toHaveTextContent("PENDING")
    expect(within(screen.getByRole("region", { name: "Virtual terminal transcript" }))
      .getAllByTestId("attack-terminal-entry")).toHaveLength(1)
    expect(within(screen.getByRole("region", { name: "Activity log" }))
      .getByRole("button", { name: /EXECUTED/ })).toBeInTheDocument()

    expect(api.runDoorLabCommand.mock.calls[1]?.[2]).toBeInstanceOf(AbortSignal)
  })

  it("invalidates the latest technical and learner result when the next Door trace payload is malformed", async () => {
    api.runDoorLabCommand
      .mockResolvedValueOnce(acceptedTerminalResult)
      .mockResolvedValueOnce({
        ...acceptedTerminalResult,
        code: "MALFORMED_TRACE",
        frames: [],
        flowTraces: [{ invalid: true }],
      })
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByLabelText("실행 전 예상"),
      "왼쪽 문 효과가 적용될 것으로 예상합니다.",
    )
    const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    await user.type(terminal, "cansend vcan0 555#0001")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await user.type(
      screen.getByLabelText("선택한 근거와 결과 비교"),
      "선택한 프레임과 최신 Toy ECU 효과가 같은 실행임을 확인했습니다.",
    )
    act(() =>
      latestConnection().options.onEvent(
        acceptedDoorEvent("session-1", 0, {
          eventId: "session-1-attempt-terminal",
          lab: {
            labId: "door-blackbox-v1",
            sessionId: "session-1",
            generation: 0,
            attemptId: "session-1-attempt-terminal",
          },
        }),
      ),
    )
    await flushCanEvents()
    await user.click(screen.getByRole("button", { name: "학습 확인" }))
    expect(screen.getByText("공격 조건 충족").parentElement)
      .toHaveTextContent("달성")
    expect(screen.getByText("학습 확인 완료").parentElement)
      .toHaveTextContent("완료")

    await user.type(terminal, "pwd malformed")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.",
    )
    expect(screen.getByText("공격 조건 충족").parentElement)
      .toHaveTextContent("미달성")
    expect(screen.getByText("학습 확인 완료").parentElement)
      .toHaveTextContent("미완료")
    expect(screen.getByText("실행 시 기록된 예상").parentElement)
      .toHaveTextContent("아직 기록되지 않음")
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toHaveValue("")
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()
  })

  it("does not create terminal transcript rows for a Door script action", async () => {
    const user = userEvent.setup()
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")

    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(within(transcript).queryByTestId("attack-terminal-entry"))
      .not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /CHECKSUM_INVALID/ }))
      .toBeInTheDocument()
  })

  it("caps terminal at 100 and Activity at 20 and clears both on reset", async () => {
    let resultIndex = 0
    api.runDoorLabCommand.mockImplementation(
      (_sessionId: string, command: string) => {
        resultIndex += 1
        return Promise.resolve<DoorLabTerminalResult>({
          ok: true,
          code: "OK",
          output: `local-output-${resultIndex}`,
          frames: [],
          state: initialSession,
          idsStatus: null,
          flowTraces: [{
            ...localDoorTrace,
            traceId: `local-${resultIndex}`,
            commandLabel: command,
          }],
        })
      },
    )
    render(<DoorAttackLabPage />)
    await screen.findByText("BODY ECU")
    const input = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    const form = input.closest("form")
    expect(form).not.toBeNull()

    for (let index = 0; index < 101; index += 1) {
      fireEvent.change(input, { target: { value: `pwd-${index}` } })
      fireEvent.submit(form!)
      await act(async () => undefined)
    }

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(within(transcript).getAllByTestId("attack-terminal-entry"))
      .toHaveLength(100)
    expect(within(transcript).queryByText("$ pwd-0")).not.toBeInTheDocument()
    expect(within(transcript).getByText("$ pwd-100")).toBeInTheDocument()
    const activity = screen.getByRole("region", { name: "Activity log" })
    expect(within(activity).getAllByRole("button")).toHaveLength(20)

    fireEvent.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalledOnce())
    expect(within(transcript).queryByTestId("attack-terminal-entry"))
      .not.toBeInTheDocument()
    expect(within(activity).queryByRole("button")).not.toBeInTheDocument()
  }, 30_000)

  it("clears transcript and Activity when a replacement Door session mounts", async () => {
    const user = userEvent.setup()
    const view = render(<DoorAttackLabPage key="session-1" />)
    await screen.findByText("BODY ECU")
    const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    await user.type(terminal, "pwd")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(screen.getByTestId("attack-terminal-entry")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Activity log" }))
      .toHaveTextContent("OK")

    api.createDoorLabSession.mockResolvedValueOnce({
      ...initialSession,
      sessionId: "session-2",
    })
    view.rerender(<DoorAttackLabPage key="session-2" />)
    await waitFor(() => expect(api.createDoorLabSession).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "제한 터미널 명령" }))
        .toBeEnabled(),
    )

    expect(screen.queryByTestId("attack-terminal-entry")).not.toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Activity log" }))
      .queryByRole("button")).not.toBeInTheDocument()
  })
})
