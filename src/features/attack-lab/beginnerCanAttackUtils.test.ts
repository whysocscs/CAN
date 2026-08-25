// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import * as beginnerApi from "./beginnerCanAttackApi"
import {
  BeginnerCanAttackApiError,
  createBeginnerCanAttackSession,
  resetBeginnerCanAttackSession,
  resolveBeginnerCanAttackApiBase,
  runBeginnerCanAttackScript,
  runBeginnerCanAttackTerminal,
} from "./beginnerCanAttackApi"
import type {
  BeginnerCanAttackAttempt,
  BeginnerCanAttackCapture,
  BeginnerCanAttackEvidence,
  BeginnerCanAttackMonitorFrame,
  BeginnerCanAttackResult,
  BeginnerCanAttackState,
} from "./beginnerCanAttackTypes"
import {
  appendBeginnerMonitorFrames,
  beginnerEventMatchesSession,
  parseBeginnerTerminalFrames,
} from "./beginnerCanAttackUtils"

// These assertions intentionally fail compilation while the public API fields
// are broad strings. Each value is absent from the finite Task 1 contract.
// @ts-expect-error "IMPACT" is event metadata, not a public session stage.
const invalidPublicStage: BeginnerCanAttackState["stage"] = "IMPACT"
// @ts-expect-error Backend results never return an arbitrary code.
const invalidResultCode: BeginnerCanAttackResult["code"] = "MADE_UP_CODE"
// @ts-expect-error Frame attempts have a finite verdict set.
const invalidAttemptVerdict: BeginnerCanAttackAttempt["verdict"] = "OBSERVED"
// @ts-expect-error Capture records only use CAPTURED.
const invalidCaptureVerdict: BeginnerCanAttackCapture["verdict"] = "EXECUTED"
// @ts-expect-error Public evidence has only capture and attempt variants.
const invalidEvidence: BeginnerCanAttackEvidence = { kind: "invented", status: "invented" }
// @ts-expect-error IDS status is NORMAL, ALERT, or null.
const invalidIdsStatus: BeginnerCanAttackResult["idsStatus"] = "SUSPICIOUS"

const state: BeginnerCanAttackState = {
  labId: "can-spoofing-basic-v1",
  scenario: "spoofing",
  sessionId: "session-1",
  generation: 3,
  stage: "OBSERVE",
  targetLabel: "Toy Rear ECU",
  targetNode: "rear",
  effectTarget: "tailgate",
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

function currentEvent(overrides: Partial<CanEvent> = {}): CanEvent {
  return {
    eventId: "event-1",
    timestamp: 1_700_000_000_000,
    channel: "vcan0",
    origin: "backend",
    frame: { canId: "0x701", dlc: 1, data: ["01"] },
    lab: {
      labId: state.labId,
      scenario: state.scenario,
      sessionId: state.sessionId,
      generation: state.generation,
      attemptId: "attempt-1",
      stage: "impact",
    },
    context: { command: "TRUNK_OPEN", source: "obd", target: "rear" },
    processing: { filterResult: "ACCEPT", executionResult: "EXECUTED" },
    monitoring: { idsObserved: true, status: "NORMAL" },
    ...overrides,
  }
}

describe("beginner CAN attack API", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("builds scenario-scoped URLs and JSON requests without a raw CAN endpoint", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify(state), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    ))
    vi.stubGlobal("fetch", fetchMock)

    expect(
      resolveBeginnerCanAttackApiBase("spoofing", {
        protocol: "https:",
        hostname: "lab.local",
      }),
    ).toBe("https://lab.local:8010/labs/can-attacks/spoofing")

    await createBeginnerCanAttackSession("spoofing")
    await resetBeginnerCanAttackSession("spoofing", "session / one")
    await runBeginnerCanAttackTerminal(
      "spoofing",
      "session-1",
      "candump -L vcan0",
    )
    await runBeginnerCanAttackScript("replay", "session-2", "# learner")

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8010/labs/can-attacks/spoofing/sessions",
      "http://localhost:8010/labs/can-attacks/spoofing/sessions/session%20%2F%20one/reset",
      "http://localhost:8010/labs/can-attacks/spoofing/sessions/session-1/terminal",
      "http://localhost:8010/labs/can-attacks/replay/sessions/session-2/run",
    ])
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "candump -L vcan0" }),
    })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({ script: "# learner" }),
    })
    expect(fetchMock.mock.calls.flat().join(" ")).not.toContain("/can/send")
  })

  it("resolves the CAN stream from browser origin while honoring an explicit override", () => {
    const resolver = (
      beginnerApi as typeof beginnerApi & {
        resolveBeginnerCanAttackStreamUrl?: (
          location: { protocol: string; hostname: string },
          configuredUrl?: string,
        ) => string
      }
    ).resolveBeginnerCanAttackStreamUrl

    expect(resolver).toBeTypeOf("function")
    if (!resolver) return
    expect(resolver({ protocol: "http:", hostname: "192.168.10.24" }))
      .toBe("ws://192.168.10.24:8010/ws/can")
    expect(resolver({ protocol: "https:", hostname: "lab.example" }))
      .toBe("wss://lab.example:8010/ws/can")
    expect(resolver({ protocol: "http:", hostname: "127.0.0.1" }))
      .toBe("ws://127.0.0.1:8010/ws/can")
    expect(
      resolver(
        { protocol: "https:", hostname: "ignored.example" },
        "wss://configured.example/custom-can",
      ),
    ).toBe("wss://configured.example/custom-can")
  })

  it("normalizes offline, backend detail, and invalid JSON failures", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "lab session not found" }), {
          status: 404,
        }),
      )
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createBeginnerCanAttackSession("spoofing")).rejects.toEqual(
      expect.objectContaining({
        name: "BeginnerCanAttackApiError",
        message: "Beginner CAN attack lab API is unavailable.",
      }),
    )
    await expect(
      resetBeginnerCanAttackSession("spoofing", "missing"),
    ).rejects.toEqual(
      expect.objectContaining({ message: "lab session not found", status: 404 }),
    )
    await expect(createBeginnerCanAttackSession("replay")).rejects.toBeInstanceOf(
      BeginnerCanAttackApiError,
    )
  })
})

describe("beginner CAN attack utilities", () => {
  it("accepts every finite Task 1 public contract value", () => {
    const stages: BeginnerCanAttackState["stage"][] = [
      "RECON",
      "OBSERVE",
      "CRAFT",
      "CAPTURE",
      "EXECUTE",
      "EVIDENCE",
    ]
    const resultCodes: BeginnerCanAttackResult["code"][] = [
      "OK",
      "OBSERVED",
      "CAPTURED",
      "EXECUTED",
      "COMMAND_TOO_LARGE",
      "COMMAND_REJECTED",
      "SCENARIO_COMMAND_UNSUPPORTED",
      "UNSAFE_SYNTAX",
      "HOST_PATH_REJECTED",
      "FILE_NOT_FOUND",
      "TARGET_ID_MISMATCH",
      "LENGTH_INVALID",
      "STATE_INVALID",
      "STATE_NOT_ALTERED",
      "CAPTURE_REQUIRED",
      "CAPTURE_FILE_UNKNOWN",
      "REPEAT_COUNT_INVALID",
      "CAPTURE_SESSION_MISMATCH",
      "CAPTURE_GENERATION_MISMATCH",
      "CAPTURE_CONTENT_MISMATCH",
      "SCRIPT_TOO_LARGE",
      "SCRIPT_TOO_MANY_LINES",
      "SCRIPT_COMMAND_INVALID",
      "SCRIPT_EMPTY",
      "SCRIPT_ACTION_COUNT_INVALID",
    ]
    const attemptVerdicts: BeginnerCanAttackAttempt["verdict"][] = [
      "EXECUTED",
      "TARGET_ID_MISMATCH",
      "LENGTH_INVALID",
      "STATE_INVALID",
      "STATE_NOT_ALTERED",
      "CAPTURE_REQUIRED",
      "CAPTURE_FILE_UNKNOWN",
      "REPEAT_COUNT_INVALID",
      "CAPTURE_SESSION_MISMATCH",
      "CAPTURE_GENERATION_MISMATCH",
      "CAPTURE_CONTENT_MISMATCH",
    ]
    const evidence: BeginnerCanAttackEvidence[] = [
      { kind: "capture", status: "recorded" },
      { kind: "attempt", status: "EXECUTED" },
    ]
    const idsStatuses: BeginnerCanAttackResult["idsStatus"][] = [
      "NORMAL",
      "ALERT",
      null,
    ]

    expect({
      stages: stages.length,
      resultCodes: resultCodes.length,
      attemptVerdicts: attemptVerdicts.length,
      evidence: evidence.length,
      idsStatuses: idsStatuses.length,
    }).toEqual({
      stages: 6,
      resultCodes: 25,
      attemptVerdicts: 11,
      evidence: 2,
      idsStatuses: 3,
    })
  })

  it("requires every current-session event dimension", () => {
    expect(beginnerEventMatchesSession(currentEvent(), state)).toBe(true)

    const cases: Array<[string, CanEvent]> = [
      ["lab", currentEvent({ lab: { ...currentEvent().lab, labId: "other" } })],
      ["scenario", currentEvent({ lab: { ...currentEvent().lab, scenario: "replay" } })],
      ["session", currentEvent({ lab: { ...currentEvent().lab, sessionId: "old" } })],
      ["generation", currentEvent({ lab: { ...currentEvent().lab, generation: 2 } })],
      ["filter", currentEvent({ processing: { filterResult: "DROP", executionResult: "EXECUTED" } })],
      ["execution", currentEvent({ processing: { filterResult: "ACCEPT", executionResult: "BLOCKED" } })],
    ]
    for (const [dimension, event] of cases) {
      expect(beginnerEventMatchesSession(event, state), dimension).toBe(false)
    }
  })

  it("parses only complete candump records returned by terminal observation", () => {
    expect(
      parseBeginnerTerminalFrames(
        "notice\n(1721000000.100000) vcan0 701#00\n(1.0) vcan0 701#0",
      ),
    ).toEqual([
      {
        key: "terminal:1721000000100:vcan0:0x701:00:1",
        timestamp: 1_721_000_000_100,
        channel: "vcan0",
        canId: "0x701",
        data: ["00"],
        verdict: "OBSERVED",
        source: "terminal",
        sequence: 1,
      },
    ])
  })

  it("deduplicates, orders, caps at 300, and preserves a selected row until eviction", () => {
    const initial = Array.from({ length: 300 }, (_, index) => ({
      key: `attempt:${index}`,
      timestamp: index,
      channel: "vcan0",
      canId: "0x700",
      data: ["00"],
      verdict: "REJECTED",
      source: "run" as const,
      sequence: index,
    })) satisfies BeginnerCanAttackMonitorFrame[]

    const stable = appendBeginnerMonitorFrames(
      { frames: initial, selectedKey: "attempt:1" },
      [{ ...initial[1], verdict: "UPDATED" }],
    )
    expect(stable.selectedKey).toBe("attempt:1")
    expect(stable.frames).toHaveLength(300)
    expect(stable.frames[1].verdict).toBe("UPDATED")

    const evicted = appendBeginnerMonitorFrames(stable, [
      { ...initial[0], key: "new", timestamp: 400, sequence: 400 },
    ])
    expect(evicted.frames).toHaveLength(300)
    expect(evicted.frames[0].key).toBe("attempt:1")
    expect(evicted.selectedKey).toBe("attempt:1")

    const evictedSelected = appendBeginnerMonitorFrames(evicted, [
      { ...initial[0], key: "newer", timestamp: 401, sequence: 401 },
    ])
    expect(evictedSelected.selectedKey).toBe("newer")
  })

  it("keeps the original stable sequence and selection when a duplicate key updates", () => {
    const first: BeginnerCanAttackMonitorFrame = {
      key: "event:first",
      timestamp: 100,
      channel: "vcan0",
      canId: "0x700",
      data: ["00"],
      verdict: "OBSERVED",
      source: "CAN stream",
      sequence: 1,
    }
    const second: BeginnerCanAttackMonitorFrame = {
      ...first,
      key: "event:second",
      data: ["01"],
      sequence: 2,
    }

    const updated = appendBeginnerMonitorFrames(
      { frames: [first, second], selectedKey: first.key },
      [{ ...first, verdict: "EXECUTED", sequence: 99 }],
    )

    expect(updated.frames.map((frame) => frame.key)).toEqual([
      "event:first",
      "event:second",
    ])
    expect(updated.frames[0].sequence).toBe(1)
    expect(updated.frames[0].verdict).toBe("EXECUTED")
    expect(updated.selectedKey).toBe("event:first")
  })
})
