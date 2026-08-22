import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DoorLabApiError,
  createDoorLabSession,
  resolveDoorLabApiBase,
  resetDoorLabSession,
  runDoorLabCommand,
  runDoorLabScript,
} from "./doorLabApi"
import {
  appendBoundedEvents,
  formatFrameData,
  frameBits,
  parseTerminalFrames,
} from "./doorLabUtils"

describe("door lab frame utilities", () => {
  it("parses literal candump records and ignores non-frame terminal output", () => {
    expect(
      parseTerminalFrames(
        "(1720000000.200000) vcan0 101#010110B5\nrestricted lab shell\n(1720000000.300000) vcan0 18F#3A7C",
      ),
    ).toEqual([
      {
        timestamp: 1720000000.2,
        channel: "vcan0",
        frame: { canId: "0x101", dlc: 4, data: ["01", "01", "10", "B5"] },
      },
      {
        timestamp: 1720000000.3,
        channel: "vcan0",
        frame: { canId: "0x18f", dlc: 2, data: ["3A", "7C"] },
      },
    ])
  })

  it("formats bytes and bits with two-digit uppercase byte groups", () => {
    expect(formatFrameData(["0", "a", "ff"])).toBe("00 0A FF")
    expect(frameBits(["00", "A5"])).toBe("00000000 10100101")
  })

  it("keeps only the most recent 300 monitor events", () => {
    const existing = Array.from({ length: 299 }, (_, index) => ({ id: index }))
    expect(appendBoundedEvents(existing, [{ id: 299 }, { id: 300 }])).toEqual([
      ...Array.from({ length: 298 }, (_, index) => ({ id: index + 1 })),
      { id: 299 },
      { id: 300 },
    ])
  })
})

describe("door lab API client", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses the browser hostname with the local lab port", () => {
    expect(
      resolveDoorLabApiBase({ protocol: "http:", hostname: "lab-host" }),
    ).toBe("http://lab-host:8010/labs/door-blackbox")
  })

  it("normalizes failed API responses into a request error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "lab session not found" }), {
            status: 404,
          }),
        ),
    )

    await expect(createDoorLabSession()).rejects.toEqual(
      new DoorLabApiError("lab session not found", 404),
    )
  })

  it("sends the documented reset, terminal, and script request payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetchMock)

    await resetDoorLabSession("session/1")
    await runDoorLabCommand("session/1", "pwd")
    await runDoorLabScript("session/1", "cansend vcan0 101#000113B7")

    expect(fetchMock.mock.calls).toEqual([
      [
        "http://127.0.0.1:8010/labs/door-blackbox/sessions/session%2F1/reset",
        { method: "POST" },
      ],
      [
        "http://127.0.0.1:8010/labs/door-blackbox/sessions/session%2F1/terminal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"command":"pwd"}',
        },
      ],
      [
        "http://127.0.0.1:8010/labs/door-blackbox/sessions/session%2F1/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"script":"cansend vcan0 101#000113B7"}',
        },
      ],
    ])
  })

  it("forwards AbortSignal through every session and action request", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    await createDoorLabSession(controller.signal)
    await resetDoorLabSession("session-1", controller.signal)
    await runDoorLabCommand("session-1", "pwd", controller.signal)
    await runDoorLabScript("session-1", "interval_ms=", controller.signal)

    expect(
      fetchMock.mock.calls.map((call) => (call[1] as RequestInit).signal),
    ).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
      controller.signal,
    ])
  })
})
