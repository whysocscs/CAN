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
  VehicleFlowPresentation,
  VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"
import { vehicle } from "../vehicle/vehicleStore"
import type {
  BeginnerCanAttackResult,
  BeginnerCanAttackScenario,
  BeginnerCanAttackState,
} from "./beginnerCanAttackTypes"

const CONFIG_TITLE: Record<BeginnerCanAttackScenario, string> = {
  spoofing: "CAN Spoofing Basics",
  replay: "CAN Replay Basics",
}

const api = vi.hoisted(() => ({
  createBeginnerCanAttackSession: vi.fn(),
  getBeginnerCanAttackSession: vi.fn(),
  resetBeginnerCanAttackSession: vi.fn(),
  runBeginnerCanAttackTerminal: vi.fn(),
  runBeginnerCanAttackScript: vi.fn(),
  resolveBeginnerCanAttackStreamUrl: vi.fn(),
}))
const stream = vi.hoisted(() => ({
  connect: vi.fn(),
  options: null as null | {
    url?: string
    onEvent: (event: CanEvent) => void
    onStatus?: (status: "connecting" | "open" | "closed") => void
  },
}))
const viewportHarness = vi.hoisted(() => ({ renderRail: false }))

vi.mock("./beginnerCanAttackApi", () => api)
vi.mock("../can/events/backendProvider", () => ({
  connectCanStream: stream.connect,
}))
vi.mock("../vehicle/VehicleNetworkViewport", async () => {
  const { default: VehicleFlowRail } = await import(
    "../vehicle/VehicleFlowRail"
  )
  return {
    default: (props: Record<string, unknown>) => {
      const playback = props.playback as VehicleFlowPlaybackSnapshot | undefined
      const presentation =
        props.presentation as VehicleFlowPresentation | undefined
      return (
        <div
          aria-label={`${props.scenarioTitle} vehicle network`}
          data-route={String(props.route)}
          data-target={props.targetId}
          data-effect={props.effectId}
          data-playback-phase={playback?.phase ?? "missing"}
          data-trace-id={playback?.trace?.traceId ?? "none"}
          data-segment-index={playback?.segmentIndex ?? -1}
          data-presentation-command={presentation?.commandLabel ?? "missing"}
          data-presentation-status={
            presentation?.nodeFeedback?.status ?? "missing"
          }
        >
          {viewportHarness.renderRail ? (
            <VehicleFlowRail
              scenarioTitle={String(props.scenarioTitle)}
              route={props.route as VehicleFlowTrace["route"]}
              playback={
                playback ?? {
                  playbackId: 0,
                  phase: "idle",
                  trace: null,
                  traceIndex: 0,
                  traceCount: 0,
                  segmentIndex: 0,
                }
              }
              presentation={presentation}
              accent={String(props.accent)}
              isPaused={Boolean(props.playbackPaused)}
              onPause={props.onPlaybackPause as (() => void) | undefined}
              onResume={props.onPlaybackResume as (() => void) | undefined}
              onNextStep={props.onPlaybackNextStep as (() => void) | undefined}
            />
          ) : null}
        </div>
      )
    },
  }
})

import BeginnerCanAttackLabPage from "./BeginnerCanAttackLabPage"

function session(
  scenario: BeginnerCanAttackScenario,
  generation = 0,
): BeginnerCanAttackState {
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
    vehicleState: {
      leftDoor: "closed",
      rightDoor: "closed",
      tailgate: "closed",
    },
    evidence: [],
    attemptCount: 0,
    lastVerdict: null,
    completed: false,
  }
}

function result(
  state: BeginnerCanAttackState,
  overrides: Partial<BeginnerCanAttackResult> = {},
): BeginnerCanAttackResult {
  return {
    ok: true,
    code: "OBSERVED",
    output: "(1721000000.100000) vcan0 701#00",
    attempts: [],
    captures: [],
    state,
    idsStatus: null,
    ...overrides,
  }
}

function liveEvent(
  state: BeginnerCanAttackState,
  overrides: Partial<CanEvent> = {},
): CanEvent {
  const replay = state.scenario === "replay"
  return {
    eventId: "live-1",
    timestamp: 1_700_000_000_000,
    channel: "vcan0",
    origin: "backend",
    frame: {
      canId: "0x701",
      dlc: replay ? 2 : 1,
      data: replay ? ["00", "01"] : ["01"],
    },
    lab: {
      labId: state.labId,
      scenario: state.scenario,
      sessionId: state.sessionId,
      generation: state.generation,
      attemptId: "attempt-1",
      stage: "impact",
    },
    context: {
      command: replay ? "DOOR_LOCK" : "TRUNK_OPEN",
      source: "obd",
      target: replay ? "body" : "rear",
    },
    processing: { filterResult: "ACCEPT", executionResult: "EXECUTED" },
    monitoring: { idsObserved: true, status: "NORMAL" },
    ...overrides,
  }
}

function executedBeginnerTrace(
  scenario: BeginnerCanAttackScenario,
): VehicleFlowTrace {
  const spoofing = scenario === "spoofing"
  return {
    traceId: `${scenario}-attempt-1`,
    attemptId: `${scenario}-attempt-1`,
    sequence: 1,
    kind: "inject",
    commandLabel: spoofing
      ? "cansend vcan0 5A1#01"
      : "canplayer -I capture.log -l 1",
    commandIndex: 1,
    canId: spoofing ? "0x5a1" : "0x5a2",
    data: spoofing ? ["01"] : ["00", "01"],
    route: spoofing
      ? ["terminal", "obd", "ids", "gateway", "rear", "tailgate"]
      : ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
    stoppedAt: null,
    outcome: "EXECUTED",
    ecuVerdict: "EXECUTED",
    idsVerdict: "NORMAL",
    effectTarget: spoofing ? "tailgate" : "leftDoor",
    effectState: "open",
    effectApplied: true,
  }
}

function captureTrace(): VehicleFlowTrace {
  return {
    traceId: "capture-1",
    attemptId: null,
    sequence: 1,
    kind: "capture",
    commandLabel: "candump -L vcan0 > capture.log",
    commandIndex: null,
    canId: "0x5a2",
    data: ["00", "01"],
    route: ["terminal", "obd", "monitor"],
    stoppedAt: null,
    outcome: "OBSERVED",
    ecuVerdict: null,
    idsVerdict: null,
    effectTarget: null,
    effectState: null,
    effectApplied: false,
  }
}

function localTrace(
  commandLabel: string,
  traceId = "local-1",
): VehicleFlowTrace {
  return {
    traceId,
    attemptId: null,
    sequence: 1,
    kind: "local",
    commandLabel,
    commandIndex: null,
    canId: null,
    data: [],
    route: ["terminal"],
    stoppedAt: "terminal",
    outcome: "REJECTED",
    ecuVerdict: null,
    idsVerdict: null,
    effectTarget: null,
    effectState: null,
    effectApplied: false,
  }
}

function rejectedBeginnerTrace(
  scenario: BeginnerCanAttackScenario,
): VehicleFlowTrace {
  const spoofing = scenario === "spoofing"
  return {
    ...executedBeginnerTrace(scenario),
    traceId: `${scenario}-rejected-1`,
    attemptId: `${scenario}-rejected-1`,
    route: spoofing
      ? ["terminal", "obd", "ids", "gateway", "rear"]
      : ["terminal", "obd", "ids", "gateway", "body"],
    stoppedAt: spoofing ? "rear" : "body",
    outcome: "REJECTED",
    ecuVerdict: "STATE_INVALID",
    idsVerdict: "ALERT",
    effectTarget: null,
    effectState: null,
    effectApplied: false,
  }
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  let reject: ((reason: unknown) => void) | undefined
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  if (!resolve || !reject) throw new Error("Deferred promise was not initialized")
  return { promise, resolve, reject }
}

let frames: FrameRequestCallback[] = []
async function flushStream() {
  await act(async () => {
    const pending = frames
    frames = []
    pending.forEach((callback) => callback(0))
  })
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

describe("BeginnerCanAttackLabPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vehicle.reset()
    viewportHarness.renderRail = false
    api.createBeginnerCanAttackSession.mockImplementation(
      (scenario: BeginnerCanAttackScenario) =>
        Promise.resolve(session(scenario)),
    )
    api.resetBeginnerCanAttackSession.mockImplementation(
      (scenario: BeginnerCanAttackScenario) =>
        Promise.resolve(session(scenario, 1)),
    )
    api.runBeginnerCanAttackTerminal.mockImplementation(
      (scenario: BeginnerCanAttackScenario) =>
        Promise.resolve(result(session(scenario))),
    )
    api.runBeginnerCanAttackScript.mockImplementation(
      (scenario: BeginnerCanAttackScenario) =>
        Promise.resolve(result(session(scenario))),
    )
    api.resolveBeginnerCanAttackStreamUrl.mockReturnValue(
      "ws://192.168.10.24:8010/ws/can",
    )
    stream.connect.mockImplementation((options) => {
      stream.options = options
      options.onStatus?.("open")
      return vi.fn()
    })
    frames = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    [
      "spoofing",
      "CAN Spoofing Basics",
      "REAR ECU",
      "TAILGATE",
      "obd,ids,gateway,rear,tailgate",
      "목표 확인",
      "정상 관찰",
      "Payload 작성",
      "ECU 수락",
      "증거",
      "cansend vcan0 <ID>#<DATA>",
    ],
    [
      "replay",
      "CAN Replay Basics",
      "BODY ECU",
      "LEFT DOOR",
      "obd,ids,gateway,body,leftDoor",
      "목표 확인",
      "프레임 캡처",
      "원본 확인",
      "재전송",
      "증거",
      "canplayer -I <FILE> -l <COUNT>",
    ],
  ] as const)(
    "renders the %s beginner workbench without prefilled answers",
    async (scenarioName, title, target, effect, route, ...copy) => {
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      expect(
        await screen.findByRole("heading", { name: title }),
      ).toBeInTheDocument()
      expect(screen.getByText(target)).toBeInTheDocument()
      expect(screen.getByText(effect)).toBeInTheDocument()
      expect(screen.getByLabelText(`${title} vehicle network`)).toHaveAttribute(
        "data-route",
        route,
      )
      copy
        .slice(0, 5)
        .forEach((stage) =>
          expect(screen.getAllByText(stage).length).toBeGreaterThan(0),
        )
      expect(
        screen
          .getByRole("textbox", { name: "공격 스크립트" })
          .getAttribute("value") ??
          (screen.getByRole("textbox", {
            name: "공격 스크립트",
          }) as HTMLTextAreaElement).value,
      ).toContain(copy[5])
      expect(
        screen.getByRole("region", { name: "Binary inspector" }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("region", { name: "Network monitor" }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("region", { name: "Virtual terminal" }),
      ).toBeInTheDocument()
      expect(stream.options?.url).toBe("ws://192.168.10.24:8010/ws/can")
      const body = document.body.textContent ?? ""
      expect(body).not.toMatch(/5a1#01|5a2#0001|capture\.log/i)
      expect(body).not.toContain("정적 UI 미리보기")
    },
  )

  it("lets the learner switch the current-stage scaffold from Guided to Challenge", async () => {
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")

    const guidance = screen.getByRole("region", { name: "현재 단계 안내" })
    expect(screen.getByRole("radio", { name: /Guided/ })).toBeChecked()
    expect(within(guidance).getByText("지금 할 일")).toBeInTheDocument()
    expect(within(guidance).getByText("확인할 증거")).toBeInTheDocument()

    await user.click(screen.getByRole("radio", { name: /Challenge/ }))

    expect(within(guidance).getByText("스스로 정할 항목")).toBeInTheDocument()
    expect(within(guidance).queryByText("지금 할 일")).not.toBeInTheDocument()
    expect(within(guidance).queryByText("완료 기준")).not.toBeInTheDocument()
  })

  it.each([
    ["spoofing", "cansend"],
    ["replay", "canplayer"],
  ] as const)(
    "explains the %s terminal-to-script workflow without exposing its solution",
    async (scenarioName, finalAction) => {
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)

      expect(await screen.findByText("Script 사용법")).toBeInTheDocument()
      expect(
        screen.getByText(/관찰·캡처 명령은 Virtual terminal에서 실행/),
      ).toBeInTheDocument()
      expect(
        screen.getByText(new RegExp(`최종 ${finalAction} action 한 줄`)),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/실행할 action 줄 앞의 #을 제거/),
      ).toBeInTheDocument()

      const guide = screen.getByText("Script 사용법").closest("details")
      expect(guide).not.toBeNull()
      expect(guide).not.toHaveTextContent(/5A1#01|5A2#0001|capture\.log/i)
    },
  )

  it("shows the Toy IDS verdict in Evidence after a script attempt", async () => {
    const completed = {
      ...session("spoofing"),
      stage: "EVIDENCE" as const,
      attemptCount: 1,
      lastVerdict: "EXECUTED" as const,
      completed: true,
    }
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(
      result(completed, { code: "EXECUTED", idsStatus: "NORMAL" }),
    )
    const user = userEvent.setup()

    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))

    const evidence = screen.getByRole("region", { name: "Evidence" })
    expect(within(evidence).getByText("Toy IDS")).toBeInTheDocument()
    expect(within(evidence).getByText("NORMAL")).toBeInTheDocument()

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "pwd",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await waitFor(() =>
      expect(api.runBeginnerCanAttackTerminal).toHaveBeenCalled(),
    )
    expect(within(evidence).getByText("PENDING")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() =>
      expect(within(evidence).getByText("PENDING")).toBeInTheDocument(),
    )
  })

  it("creates one StrictMode session and aborts the create when the page leaves", async () => {
    let resolve: (value: BeginnerCanAttackState) => void
    api.createBeginnerCanAttackSession.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = render(
      <StrictMode>
        <BeginnerCanAttackLabPage scenario="spoofing" />
      </StrictMode>,
    )
    expect(api.createBeginnerCanAttackSession).toHaveBeenCalledTimes(1)
    const signal = api.createBeginnerCanAttackSession.mock
      .calls[0]?.[1] as AbortSignal
    view.unmount()
    await act(async () => undefined)
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(session("spoofing")))
  })

  it("renders an explicit loading state before reporting a backend outage", async () => {
    let reject: (reason: unknown) => void
    api.createBeginnerCanAttackSession.mockReturnValueOnce(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise
      }),
    )
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)

    expect(
      screen.getByText("세션 연결 중").closest('[role="status"]'),
    ).toHaveTextContent("세션 연결 중")
    await act(async () => reject(new Error("backend offline")))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "backend offline",
    )
    expect(
      screen.getByRole("button", { name: "세션 다시 연결" }),
    ).toBeInTheDocument()
  })

  it("shows observed terminal frames only after the learner runs a command", async () => {
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    expect(screen.queryByText("0x701")).not.toBeInTheDocument()
    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "candump -L vcan0",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(
      await within(
        screen.getByRole("region", { name: "Network monitor" }),
      ).findByText("0x701"),
    ).toBeInTheDocument()
  })

  it("uses a returned capture identity instead of duplicating its candump output", async () => {
    const current = session("replay")
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
      result(current, {
        output: "(1721000000.100000) vcan0 702#0001",
        captures: [
          {
            captureId: "capture-1",
            timestamp: 1_721_000_000_100,
            sessionId: current.sessionId,
            generation: current.generation,
            fileName: "observed.log",
            canId: "0x702",
            data: ["00", "01"],
            verdict: "CAPTURED",
          },
        ],
      }),
    )
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
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(
      result(current, {
        ok: false,
        code: "CAPTURE_CONTENT_MISMATCH",
        attempts: [
          {
            attemptId: "rejected",
            timestamp: 10,
            sessionId: current.sessionId,
            generation: 0,
            canId: "0x702",
            data: ["FF"],
            verdict: "CAPTURE_CONTENT_MISMATCH",
          },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")
    await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
    expect(
      (await screen.findAllByText("CAPTURE_CONTENT_MISMATCH")).length,
    ).toBeGreaterThan(0)
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
  })

  it.each([
    ["spoofing", "tailgate"],
    ["replay", "doorL"],
  ] as const)(
    "defers the %s effect until playback reaches the endpoint",
    async (scenarioName, part) => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      viewportHarness.renderRail = true
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const current = session(scenarioName)
      const completed = {
        ...current,
        stage: "EVIDENCE" as const,
        completed: true,
        vehicleState: {
          ...current.vehicleState,
          [part === "doorL" ? "leftDoor" : "tailgate"]: "open",
        },
      } satisfies BeginnerCanAttackState
      api.runBeginnerCanAttackScript.mockResolvedValueOnce(
        result(completed, {
          code: "EXECUTED",
          flowTraces: [executedBeginnerTrace(scenarioName)],
        }),
      )

      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      const runButton = await screen.findByRole("button", {
        name: "스크립트 실행",
      })
      await user.click(runButton)
      await waitFor(() =>
        expect(api.runBeginnerCanAttackScript).toHaveBeenCalledOnce(),
      )

      expect(vehicle.isOpen(part)).toBe(false)
      expect(runButton).toBeDisabled()
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-playback-phase", "playing")

      const controls = screen.getByRole("group", { name: "3D 흐름 재생 제어" })
      await user.click(
        within(controls).getByRole("button", { name: "일시정지" }),
      )
      act(() => vi.runAllTimers())
      expect(vehicle.isOpen(part)).toBe(false)
      await user.click(
        within(controls).getByRole("button", { name: "한 단계 진행" }),
      )
      expect(vehicle.isOpen(part)).toBe(false)
      await user.click(
        within(controls).getByRole("button", { name: "계속 재생" }),
      )

      act(() => vi.runAllTimers())

      expect(vehicle.isOpen(part)).toBe(true)
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-playback-phase", "complete")
    },
  )

  it.each(["spoofing", "replay"] as const)(
    "invalidates the previous %s action as soon as a second accepted submit starts",
    async (scenarioName) => {
      stubReducedMotion(true)
      const current = session(scenarioName)
      const trace = executedBeginnerTrace(scenarioName)
      const completed: BeginnerCanAttackState = {
        ...current,
        stage: "EVIDENCE",
        completed: true,
        vehicleState: {
          ...current.vehicleState,
          [scenarioName === "spoofing" ? "tailgate" : "leftDoor"]: "open",
        },
      }
      const secondRequest = deferred<BeginnerCanAttackResult>()
      api.runBeginnerCanAttackTerminal
        .mockResolvedValueOnce(
          result(completed, {
            code: "EXECUTED",
            attempts: [
              {
                attemptId: trace.attemptId!,
                timestamp: 10,
                sessionId: current.sessionId,
                generation: current.generation,
                canId: trace.canId!,
                data: trace.data,
                verdict: "EXECUTED",
              },
            ],
            idsStatus: "NORMAL",
            flowTraces: [trace],
          }),
        )
        .mockReturnValueOnce(secondRequest.promise)
      const user = userEvent.setup()
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      await screen.findByText(
        scenarioName === "spoofing" ? "REAR ECU" : "BODY ECU",
      )

      const prediction = screen.getByLabelText("실행 전 예상")
      await user.type(
        prediction,
        "첫 실행에서 차량 효과가 적용될 것으로 예상합니다.",
      )
      const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
      await user.type(terminal, trace.commandLabel)
      await user.click(screen.getByRole("button", { name: "명령 실행" }))
      await user.type(
        screen.getByLabelText("선택한 근거와 결과 비교"),
        "선택한 프레임과 최신 Toy ECU 효과가 같은 실행임을 충분히 확인했습니다.",
      )
      await user.click(screen.getByRole("button", { name: "학습 확인" }))
      expect(
        screen.getByText("학습 확인 완료").parentElement,
      ).toHaveTextContent("완료")

      await user.clear(prediction)
      await user.type(prediction, "두 번째 요청에서 현재 캡처할 예상입니다.")
      await user.type(terminal, "second accepted request")
      await user.click(screen.getByRole("button", { name: "명령 실행" }))
      await waitFor(() =>
        expect(api.runBeginnerCanAttackTerminal).toHaveBeenCalledTimes(2),
      )

      expect(
        screen.queryByRole("heading", { name: "왜 이런 결과가 발생했나요?" }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-presentation-status", "missing")
      expect(
        screen.getByText("공격 조건 충족").parentElement,
      ).toHaveTextContent("미달성")
      expect(
        screen.getByText("학습 확인 완료").parentElement,
      ).toHaveTextContent("미완료")
      expect(
        screen.getByText("실행 시 기록된 예상").parentElement,
      ).toHaveTextContent("아직 기록되지 않음")
      expect(screen.getByLabelText("선택한 근거와 결과 비교")).toHaveValue("")
      expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()
      expect(
        screen.getByRole("region", { name: "Binary inspector" }),
      ).toHaveTextContent("터미널 또는 monitor에서 프레임을 선택하세요.")
      expect(screen.getByText("Last verdict").parentElement).toHaveTextContent(
        "PENDING",
      )
      expect(screen.getByText("Toy IDS").parentElement).toHaveTextContent(
        "PENDING",
      )
      expect(
        within(
          screen.getByRole("region", { name: "Virtual terminal transcript" }),
        ).getAllByTestId("attack-terminal-entry"),
      ).toHaveLength(1)
      expect(
        within(screen.getByRole("region", { name: "Activity log" })).getByRole(
          "button",
          { name: /EXECUTED/ },
        ),
      ).toBeInTheDocument()
    },
  )

  it.each([
    ["spoofing", "tailgate", "CAN ID는 인증된 송신자 identity가 아닙니다."],
    ["replay", "doorL", "freshness protection 관점"],
  ] as const)(
    "renders a successful %s terminal action through all four shared learning components",
    async (scenarioName, part, principleCopy) => {
      stubReducedMotion(true)
      viewportHarness.renderRail = true
      const current = session(scenarioName)
      const trace = executedBeginnerTrace(scenarioName)
      const completed = {
        ...current,
        stage: "EVIDENCE" as const,
        completed: true,
        vehicleState: {
          ...current.vehicleState,
          [part === "doorL" ? "leftDoor" : "tailgate"]: "open",
        },
      } satisfies BeginnerCanAttackState
      api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
        result(completed, {
          code: "EXECUTED",
          output: "EXECUTED",
          attempts: [
            {
              attemptId: trace.attemptId!,
              timestamp: 10,
              sessionId: current.sessionId,
              generation: current.generation,
              canId: trace.canId!,
              data: trace.data,
              verdict: "EXECUTED",
            },
          ],
          idsStatus: "NORMAL",
          flowTraces: [trace],
        }),
      )
      const user = userEvent.setup()
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      await screen.findByText(
        scenarioName === "spoofing" ? "REAR ECU" : "BODY ECU",
      )

      const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
      await user.type(terminal, trace.commandLabel)
      await user.click(screen.getByRole("button", { name: "명령 실행" }))

      const transcript = screen.getByRole("region", {
        name: "Virtual terminal transcript",
      })
      expect(
        within(transcript).getByTestId("attack-terminal-entry"),
      ).toHaveAttribute("data-stream", "silent")
      expect(within(transcript).queryByText("EXECUTED")).not.toBeInTheDocument()
      const why = screen
        .getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })
        .closest("section")
      expect(why).not.toBeNull()
      expect(
        within(why!).getByText("차량 영향").parentElement,
      ).toHaveTextContent("적용됨")
      expect(
        within(screen.getByRole("region", { name: "Activity log" })).getByRole(
          "button",
          { name: /EXECUTED/ },
        ),
      ).toBeInTheDocument()
      const learningCheck = screen
        .getByRole("heading", { name: "Learning Check" })
        .closest("section")
      expect(learningCheck).not.toBeNull()
      expect(
        within(learningCheck!).getByRole("heading", {
          name: "Actual · 관찰 결과",
        }),
      ).toBeInTheDocument()
      expect(
        within(learningCheck!).getByText(principleCopy, { exact: false }),
      ).toBeInTheDocument()
      expect(
        within(learningCheck!).getByText("제출 프레임").parentElement,
      ).toHaveTextContent(trace.canId!)
      expect(
        screen.getByText("공격 조건 충족").parentElement,
      ).toHaveTextContent("달성")
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-presentation-command", trace.commandLabel)
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-presentation-status", "EFFECT APPLIED")

      const liveRegions = document.querySelectorAll('[aria-live="polite"]')
      expect(liveRegions).toHaveLength(1)
      expect(liveRegions[0]).toHaveTextContent(
        "EXECUTED 구조화 결과가 Activity에 기록되었습니다.",
      )
    },
  )

  it("invalidates the latest Beginner technical and learner result when the next trace payload is malformed", async () => {
    stubReducedMotion(true)
    const current = session("spoofing")
    const trace = executedBeginnerTrace("spoofing")
    const completed: BeginnerCanAttackState = {
      ...current,
      stage: "EVIDENCE",
      completed: true,
      vehicleState: { ...current.vehicleState, tailgate: "open" },
    }
    api.runBeginnerCanAttackTerminal
      .mockResolvedValueOnce(
        result(completed, {
          code: "EXECUTED",
          attempts: [
            {
              attemptId: trace.attemptId!,
              timestamp: 10,
              sessionId: current.sessionId,
              generation: current.generation,
              canId: trace.canId!,
              data: trace.data,
              verdict: "EXECUTED",
            },
          ],
          flowTraces: [trace],
        }),
      )
      .mockResolvedValueOnce(
        result(completed, {
          ok: false,
          code: "COMMAND_REJECTED",
          output: "malformed trace payload",
          flowTraces: [{ invalid: true }],
        }),
      )
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")

    await user.type(
      screen.getByLabelText("실행 전 예상"),
      "Tailgate 효과가 적용될 것으로 예상합니다.",
    )
    const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
    await user.type(terminal, trace.commandLabel)
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await user.type(
      screen.getByLabelText("선택한 근거와 결과 비교"),
      "선택한 프레임과 최신 Toy ECU 효과가 같은 실행임을 확인했습니다.",
    )
    act(() =>
      stream.options?.onEvent(
        liveEvent(current, {
          eventId: trace.attemptId!,
          frame: {
            canId: trace.canId!,
            dlc: trace.data.length,
            data: trace.data,
          },
          lab: {
            labId: current.labId,
            scenario: current.scenario,
            sessionId: current.sessionId,
            generation: current.generation,
            attemptId: trace.attemptId!,
            stage: "impact",
          },
        }),
      ),
    )
    await flushStream()
    await user.click(
      within(screen.getByRole("region", { name: "Network monitor" })).getByRole(
        "button",
      ),
    )
    await user.click(screen.getByRole("button", { name: "학습 확인" }))
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent(
      "달성",
    )
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent(
      "완료",
    )

    await user.type(terminal, "bad trace payload")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.",
    )
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent(
      "미달성",
    )
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent(
      "미완료",
    )
    expect(
      screen.getByText("실행 시 기록된 예상").parentElement,
    ).toHaveTextContent("아직 기록되지 않음")
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toHaveValue("")
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()
  })

  it("plays capture evidence without opening any vehicle part", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const current = session("replay")
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
      result({ ...current, stage: "CAPTURE" }, {
        code: "CAPTURED",
        captures: [
          {
            captureId: "capture-1",
            timestamp: 1_700_000_000_000,
            sessionId: current.sessionId,
            generation: current.generation,
            fileName: "capture.log",
            canId: "0x5A2",
            data: ["00", "01"],
            verdict: "CAPTURED",
          },
        ],
        flowTraces: [captureTrace()],
      }),
    )

    render(<BeginnerCanAttackLabPage scenario="replay" />)
    const input = await screen.findByLabelText("제한 터미널 명령")
    await user.type(input, "candump -L vcan0 > capture.log")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    await waitFor(() =>
      expect(api.runBeginnerCanAttackTerminal).toHaveBeenCalledOnce(),
    )

    expect(
      screen.getByLabelText("CAN Replay Basics vehicle network"),
    ).toHaveAttribute("data-trace-id", "capture-1")
    expect(
      screen.getByLabelText("CAN Replay Basics vehicle network"),
    ).toHaveAttribute("data-playback-phase", "playing")

    act(() => vi.runAllTimers())

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(vehicle.isOpen("doorR")).toBe(false)
    expect(vehicle.isOpen("tailgate")).toBe(false)
    expect(
      screen.getByLabelText("CAN Replay Basics vehicle network"),
    ).toHaveAttribute("data-playback-phase", "complete")
  })

  it("reset cancels a pending beginner effect before awaiting reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const current = session("spoofing")
    const resetRequest = deferred<BeginnerCanAttackState>()
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(
      result(
        {
          ...current,
          stage: "EVIDENCE",
          completed: true,
          vehicleState: { ...current.vehicleState, tailgate: "open" },
        },
        {
          code: "EXECUTED",
          flowTraces: [executedBeginnerTrace("spoofing")],
        },
      ),
    )
    api.resetBeginnerCanAttackSession.mockReturnValueOnce(resetRequest.promise)

    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() =>
      expect(
        screen.getByLabelText("CAN Spoofing Basics vehicle network"),
      ).toHaveAttribute("data-playback-phase", "playing"),
    )

    const resetButton = screen.getByRole("button", { name: "실습 초기화" })
    expect(resetButton).toBeEnabled()
    await user.click(resetButton)
    await waitFor(() =>
      expect(api.resetBeginnerCanAttackSession).toHaveBeenCalledOnce(),
    )

    expect(vehicle.isOpen("tailgate")).toBe(false)
    expect(
      screen.getByLabelText("CAN Spoofing Basics vehicle network"),
    ).toHaveAttribute("data-playback-phase", "cancelled")
    act(() => vi.runAllTimers())
    expect(vehicle.isOpen("tailgate")).toBe(false)

    await act(async () => resetRequest.resolve(session("spoofing", 1)))
    await waitFor(() =>
      expect(
        screen.getByLabelText("CAN Spoofing Basics vehicle network"),
      ).toHaveAttribute("data-playback-phase", "idle"),
    )
  })

  it("reset supersedes an in-flight script request and ignores its late result", async () => {
    const actionRequest = deferred<BeginnerCanAttackResult>()
    const resetRequest = deferred<BeginnerCanAttackState>()
    api.runBeginnerCanAttackScript.mockReturnValueOnce(actionRequest.promise)
    api.resetBeginnerCanAttackSession.mockReturnValueOnce(resetRequest.promise)
    const user = userEvent.setup()

    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() =>
      expect(api.runBeginnerCanAttackScript).toHaveBeenCalledOnce(),
    )
    const oldSignal = api.runBeginnerCanAttackScript.mock
      .calls[0]?.[3] as AbortSignal
    vehicle.set("tailgate", 1)

    const resetButton = screen.getByRole("button", { name: "실습 초기화" })
    expect(resetButton).toBeEnabled()
    await user.click(resetButton)
    await waitFor(() =>
      expect(api.resetBeginnerCanAttackSession).toHaveBeenCalledOnce(),
    )

    expect(oldSignal.aborted).toBe(true)
    expect(vehicle.isOpen("tailgate")).toBe(false)

    const lateState = {
      ...session("spoofing"),
      stage: "EVIDENCE" as const,
      completed: true,
      vehicleState: {
        leftDoor: "closed" as const,
        rightDoor: "closed" as const,
        tailgate: "open" as const,
      },
    }
    await act(async () =>
      actionRequest.resolve(
        result(lateState, {
          code: "EXECUTED",
          flowTraces: [executedBeginnerTrace("spoofing")],
        }),
      ),
    )
    expect(vehicle.isOpen("tailgate")).toBe(false)

    await act(async () => resetRequest.resolve(session("spoofing", 1)))
    expect(vehicle.isOpen("tailgate")).toBe(false)
  })

  it("keeps one accepted current live event monitor-only", async () => {
    const current = session("spoofing")
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    act(() => stream.options?.onEvent(liveEvent(current)))
    await flushStream()
    expect(vehicle.getState()).toEqual({ doorL: 0, doorR: 0, tailgate: 0 })
    expect(
      within(
        screen.getByRole("region", { name: "Network monitor" }),
      ).getAllByText("EXECUTED"),
    ).toHaveLength(1)
    act(() => stream.options?.onEvent(liveEvent(current)))
    await flushStream()
    expect(
      within(
        screen.getByRole("region", { name: "Network monitor" }),
      ).getAllByText("EXECUTED"),
    ).toHaveLength(1)
  })

  it.each([
    ["spoofing", "tailgate"],
    ["replay", "doorL"],
  ] as const)(
    "restores the current idle %s reconnect snapshot without monitor or playback duplication",
    async (scenarioName, part) => {
      const current = session(scenarioName)
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      await screen.findByText(
        scenarioName === "spoofing" ? "REAR ECU" : "BODY ECU",
      )

      act(() => stream.options?.onEvent(liveEvent(current, { replay: true })))
      await flushStream()

      expect(vehicle.isOpen(part)).toBe(true)
      expect(
        screen.getByLabelText(`${CONFIG_TITLE[scenarioName]} vehicle network`),
      ).toHaveAttribute("data-playback-phase", "idle")
      expect(
        within(
          screen.getByRole("region", { name: "Network monitor" }),
        ).queryByText("EXECUTED"),
      ).not.toBeInTheDocument()
    },
  )

  it("does not apply a reconnect snapshot while a REST action is in flight", async () => {
    const current = session("spoofing")
    const actionRequest = deferred<BeginnerCanAttackResult>()
    api.runBeginnerCanAttackScript.mockReturnValueOnce(actionRequest.promise)
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)

    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() =>
      expect(api.runBeginnerCanAttackScript).toHaveBeenCalledOnce(),
    )
    act(() => stream.options?.onEvent(liveEvent(current, { replay: true })))
    await flushStream()

    expect(vehicle.isOpen("tailgate")).toBe(false)
    expect(
      within(
        screen.getByRole("region", { name: "Network monitor" }),
      ).queryByText("EXECUTED"),
    ).not.toBeInTheDocument()

    await act(async () => actionRequest.resolve(result(current)))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "스크립트 실행" }),
      ).toBeEnabled(),
    )
  })

  it("does not let a reconnect snapshot overtake active endpoint playback", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const current = session("spoofing")
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(
      result(
        {
          ...current,
          stage: "EVIDENCE",
          completed: true,
          vehicleState: { ...current.vehicleState, tailgate: "open" },
        },
        {
          code: "EXECUTED",
          flowTraces: [executedBeginnerTrace("spoofing")],
        },
      ),
    )
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)

    await user.click(
      await screen.findByRole("button", { name: "스크립트 실행" }),
    )
    await waitFor(() =>
      expect(
        screen.getByLabelText("CAN Spoofing Basics vehicle network"),
      ).toHaveAttribute("data-playback-phase", "playing"),
    )
    act(() => stream.options?.onEvent(liveEvent(current, { replay: true })))
    await flushStream()

    expect(vehicle.isOpen("tailgate")).toBe(false)
    act(() => vi.runAllTimers())
    expect(vehicle.isOpen("tailgate")).toBe(true)
  })

  it("rejects stale-session and stale-generation reconnect snapshots", async () => {
    const current = session("replay")
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")

    act(() => {
      stream.options?.onEvent(
        liveEvent(current, {
          eventId: "stale-session-replay",
          replay: true,
          lab: {
            labId: current.labId,
            scenario: current.scenario,
            sessionId: "obsolete-session",
            generation: current.generation,
            attemptId: "attempt-stale-session",
            stage: "impact",
          },
        }),
      )
      stream.options?.onEvent(
        liveEvent(current, {
          eventId: "stale-generation-replay",
          replay: true,
          lab: {
            labId: current.labId,
            scenario: current.scenario,
            sessionId: current.sessionId,
            generation: current.generation + 1,
            attemptId: "attempt-stale-generation",
            stage: "impact",
          },
        }),
      )
    })
    await flushStream()

    expect(vehicle.isOpen("doorL")).toBe(false)
    expect(
      screen.getByLabelText("CAN Replay Basics vehicle network"),
    ).toHaveAttribute("data-playback-phase", "idle")
    expect(
      within(
        screen.getByRole("region", { name: "Network monitor" }),
      ).queryByText("EXECUTED"),
    ).not.toBeInTheDocument()
  })

  it("resets all local evidence and advances the authoritative generation", async () => {
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")
    const terminalInput = screen.getByRole("textbox", {
      name: "제한 터미널 명령",
    })
    await waitFor(() => expect(terminalInput).toBeEnabled())
    await user.type(terminalInput, "candump -L vcan0")
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    const monitor = screen.getByRole("region", { name: "Network monitor" })
    await within(monitor).findByText("0x701")
    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() =>
      expect(within(monitor).queryByText("0x701")).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
    ).toHaveValue("")
  })

  it("routes local syntax and Replay preflight failure to stderr and Activity without OBD or ECU feedback", async () => {
    stubReducedMotion(true)
    const current = session("replay")
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
      result(current, {
        ok: false,
        code: "CAPTURE_REQUIRED",
        output: "virtual canplayer preflight failed: CAPTURE_REQUIRED",
        flowTraces: [localTrace("canplayer learner input")],
      }),
    )
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "canplayer learner input",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(
      within(transcript).getByText(/virtual canplayer preflight failed/),
    ).toBeInTheDocument()
    expect(
      within(transcript).getByTestId("attack-terminal-entry"),
    ).toHaveAttribute("data-stream", "stderr")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /CAPTURE_REQUIRED/ }),
    ).toHaveTextContent("차량 경로 없음")
    const why = screen
      .getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })
      .closest("section")
    expect(why).not.toBeNull()
    expect(
      within(why!).queryByText("가상 CAN 경로 입력"),
    ).not.toBeInTheDocument()
    expect(within(why!).queryByText("Toy ECU")).not.toBeInTheDocument()
  })

  it("keeps an emitted ECU rejection silent and out of the application alert", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubReducedMotion(false)
    const current = session("spoofing")
    const trace = rejectedBeginnerTrace("spoofing")
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
      result(current, {
        ok: false,
        code: "STATE_INVALID",
        output: "STATE_INVALID",
        attempts: [
          {
            attemptId: trace.attemptId!,
            timestamp: 10,
            sessionId: current.sessionId,
            generation: current.generation,
            canId: trace.canId!,
            data: trace.data,
            verdict: "STATE_INVALID",
          },
        ],
        idsStatus: "ALERT",
        flowTraces: [trace],
      }),
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")

    await user.type(
      screen.getByLabelText("실행 전 예상"),
      "Rear ECU가 이 후보를 거부하고 차량 효과는 없을 것으로 예상합니다.",
    )
    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      trace.commandLabel,
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    act(() => vi.runAllTimers())

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(
      within(transcript).getByTestId("attack-terminal-entry"),
    ).toHaveAttribute("data-stream", "silent")
    expect(
      within(transcript).queryByText("STATE_INVALID"),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    const why = screen
      .getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })
      .closest("section")
    expect(within(why!).getByText("Toy ECU")).toBeInTheDocument()
    expect(within(why!).getByText("STATE_INVALID")).toBeInTheDocument()

    const monitor = screen.getByRole("region", { name: "Network monitor" })
    await user.click(within(monitor).getByRole("button"))
    await user.type(
      screen.getByLabelText("선택한 근거와 결과 비교"),
      "선택한 제출 프레임이 Rear ECU에서 STATE_INVALID로 거부되어 차량 효과가 없었습니다.",
    )
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent(
      "미달성",
    )
    expect(
      screen.queryByText(/실행 결과 재생이 완료되면/),
    ).not.toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: "학습 확인" })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent(
      "완료",
    )
  })

  it("keeps capture redirection silent while Activity and Why identify Evidence capture", async () => {
    stubReducedMotion(true)
    const current = session("replay")
    const trace = captureTrace()
    api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(
      result({ ...current, stage: "CAPTURE" }, {
        code: "CAPTURED",
        output: "captured output that is redirected",
        captures: [
          {
            captureId: "capture-1",
            timestamp: 10,
            sessionId: current.sessionId,
            generation: current.generation,
            fileName: "learner.log",
            canId: trace.canId!,
            data: trace.data,
            verdict: "CAPTURED",
          },
        ],
        flowTraces: [trace],
      }),
    )
    const user = userEvent.setup()
    render(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      trace.commandLabel,
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    expect(
      within(transcript).getByTestId("attack-terminal-entry"),
    ).toHaveAttribute("data-stream", "silent")
    expect(
      within(transcript).queryByText("captured output that is redirected"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /CAPTURED/ })).toBeInTheDocument()
    const why = screen
      .getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })
      .closest("section")
    expect(within(why!).getByText("Evidence")).toBeInTheDocument()
  })

  it.each([
    ["spoofing", "tailgate"],
    ["replay", "doorL"],
  ] as const)(
    "does not let a previous successful %s session make the latest failed action pass",
    async (scenarioName, part) => {
      stubReducedMotion(true)
      const current = session(scenarioName)
      const executed = executedBeginnerTrace(scenarioName)
      const completed: BeginnerCanAttackState = {
        ...current,
        stage: "EVIDENCE",
        completed: true,
        vehicleState: {
          ...current.vehicleState,
          [part === "doorL" ? "leftDoor" : "tailgate"]: "open",
        },
      }
      api.runBeginnerCanAttackTerminal
        .mockResolvedValueOnce(
          result(completed, {
            code: "EXECUTED",
            attempts: [
              {
                attemptId: executed.attemptId!,
                timestamp: 10,
                sessionId: current.sessionId,
                generation: current.generation,
                canId: executed.canId!,
                data: executed.data,
                verdict: "EXECUTED",
              },
            ],
            idsStatus: "NORMAL",
            flowTraces: [executed],
          }),
        )
        .mockResolvedValueOnce(
          result(completed, {
            ok: false,
            code: "COMMAND_REJECTED",
            output: "virtual syntax error",
            flowTraces: [
              localTrace("bad learner command", `${scenarioName}-local-fail`),
            ],
          }),
        )
      const user = userEvent.setup()
      render(<BeginnerCanAttackLabPage scenario={scenarioName} />)
      await screen.findByText(
        scenarioName === "spoofing" ? "REAR ECU" : "BODY ECU",
      )

      await user.type(
        screen.getByLabelText("실행 전 예상"),
        "차량 효과가 적용될 것으로 예상합니다.",
      )
      const terminal = screen.getByRole("textbox", { name: "제한 터미널 명령" })
      await user.type(terminal, executed.commandLabel)
      await user.click(screen.getByRole("button", { name: "명령 실행" }))
      expect(
        screen.getByText("공격 조건 충족").parentElement,
      ).toHaveTextContent("달성")

      await user.type(terminal, "bad learner command")
      await user.click(screen.getByRole("button", { name: "명령 실행" }))

      expect(
        screen.getByText("공격 조건 충족").parentElement,
      ).toHaveTextContent("미달성")
      expect(
        screen.getByText("학습 확인 완료").parentElement,
      ).toHaveTextContent("미완료")
      expect(screen.getByRole("button", { name: "학습 확인" })).toBeDisabled()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it("clears transcript, Activity, prediction, and reflection on scenario change and reset", async () => {
    stubReducedMotion(true)
    let call = 0
    api.runBeginnerCanAttackTerminal.mockImplementation(
      (currentScenario: BeginnerCanAttackScenario) => {
        call += 1
        const current = session(currentScenario)
        return Promise.resolve(
          result(current, {
            ok: false,
            code: "COMMAND_REJECTED",
            output: `local error ${call}`,
            flowTraces: [localTrace(`bad-${call}`, `local-${call}`)],
          }),
        )
      },
    )
    const user = userEvent.setup()
    const view = render(<BeginnerCanAttackLabPage scenario="spoofing" />)
    await screen.findByText("REAR ECU")

    await user.type(screen.getByLabelText("실행 전 예상"), "첫 시나리오 예상")
    await user.type(
      screen.getByLabelText("선택한 근거와 결과 비교"),
      "첫 시나리오에서 작성한 충분히 긴 비교 설명입니다.",
    )
    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "bad-1",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(screen.getByTestId("attack-terminal-entry")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /COMMAND_REJECTED/ }),
    ).toBeInTheDocument()

    view.rerender(<BeginnerCanAttackLabPage scenario="replay" />)
    await screen.findByText("BODY ECU")
    expect(
      screen.queryByTestId("attack-terminal-entry"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /COMMAND_REJECTED/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText("실행 전 예상")).toHaveValue("")
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toHaveValue("")

    await user.type(
      screen.getByRole("textbox", { name: "제한 터미널 명령" }),
      "bad-2",
    )
    await user.click(screen.getByRole("button", { name: "명령 실행" }))
    expect(screen.getByTestId("attack-terminal-entry")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "실습 초기화" }))
    await waitFor(() =>
      expect(api.resetBeginnerCanAttackSession).toHaveBeenCalled(),
    )
    expect(
      screen.queryByTestId("attack-terminal-entry"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /COMMAND_REJECTED/ }),
    ).not.toBeInTheDocument()
  })
})
