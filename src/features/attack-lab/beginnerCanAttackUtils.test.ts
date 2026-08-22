// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { CanEvent } from "../can/events/types"
import {
  BeginnerCanAttackApiError,
  createBeginnerCanAttackSession,
  resetBeginnerCanAttackSession,
  resolveBeginnerCanAttackApiBase,
  runBeginnerCanAttackScript,
  runBeginnerCanAttackTerminal,
} from "./beginnerCanAttackApi"
import type {
  BeginnerCanAttackMonitorFrame,
  BeginnerCanAttackState,
} from "./beginnerCanAttackTypes"
import {
  appendBeginnerMonitorFrames,
  beginnerEventMatchesSession,
  parseBeginnerTerminalFrames,
} from "./beginnerCanAttackUtils"

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
})
