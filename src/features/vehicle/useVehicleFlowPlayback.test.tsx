// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { executedDoorTrace, rejectedBodyTrace } from "./vehicleFlowTestFixtures"
import type { VehicleFlowTrace } from "./vehicleFlowTypes"
import { useVehicleFlowPlayback } from "./useVehicleFlowPlayback"

describe("useVehicleFlowPlayback", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("applies an effect only after its final segment", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
        onComplete,
      }),
    )

    act(() =>
      result.current.play({
        runKey: "session:0:run-1",
        traces: [executedDoorTrace],
      }),
    )
    expect(onEffect).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(999))
    expect(onEffect).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onEffect).toHaveBeenCalledOnce()
    expect(result.current.snapshot.phase).toBe("playing")
    expect(onComplete).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(899))
    expect(result.current.snapshot.phase).toBe("playing")
    expect(onComplete).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot.phase).toBe("complete")
    expect(onComplete).toHaveBeenCalledWith("session:0:run-1")
  })

  it("waits the default 600 ms before ordinary segment advancement", () => {
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "two-node-step",
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() => result.current.play({ runKey: "step-600", traces: [trace] }))
    expect(result.current.snapshot.segmentIndex).toBe(0)

    act(() => vi.advanceTimersByTime(599))
    expect(result.current.snapshot.segmentIndex).toBe(0)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot.segmentIndex).toBe(1)
    expect(result.current.snapshot.phase).toBe("playing")
  })

  it("holds the final node for 900 ms before starting the next trace", () => {
    const first: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "hold-first",
      sequence: 1,
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const second: VehicleFlowTrace = {
      ...first,
      traceId: "hold-second",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() => result.current.play({ runKey: "hold-900", traces: [first, second] }))
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 0,
      segmentIndex: 1,
      phase: "playing",
    })

    act(() => vi.advanceTimersByTime(899))
    expect(result.current.snapshot.trace?.traceId).toBe("hold-first")

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 1,
      segmentIndex: 0,
      phase: "playing",
    })
  })

  it("keeps the last authoritative trace visible after its 900 ms final hold", () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false, onComplete }),
    )

    act(() => result.current.play({
      runKey: "last-hold",
      traces: [rejectedBodyTrace],
    }))
    act(() => vi.advanceTimersByTime(2_400))
    expect(result.current.snapshot.phase).toBe("playing")
    expect(result.current.snapshot.segmentIndex).toBe(4)
    expect(onComplete).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(899))
    expect(result.current.snapshot.phase).toBe("playing")

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot).toMatchObject({
      phase: "complete",
      trace: rejectedBodyTrace,
      segmentIndex: 4,
    })
    expect(onComplete).toHaveBeenCalledWith("last-hold")

    act(() => vi.runAllTimers())
    expect(result.current.snapshot).toMatchObject({
      phase: "complete",
      trace: rejectedBodyTrace,
      segmentIndex: 4,
    })
  })

  it("cancels a pending final hold without advancing or completing", () => {
    const onComplete = vi.fn()
    const second = {
      ...rejectedBodyTrace,
      traceId: "cancelled-second",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false, onComplete }),
    )

    act(() => result.current.play({
      runKey: "cancel-final-hold",
      traces: [rejectedBodyTrace, second],
    }))
    act(() => vi.advanceTimersByTime(2_400))
    expect(result.current.snapshot.segmentIndex).toBe(4)

    act(() => result.current.cancel())
    act(() => vi.runAllTimers())

    expect(result.current.snapshot.phase).toBe("cancelled")
    expect(result.current.snapshot.traceIndex).toBe(0)
    expect(onComplete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops a rejected trace without applying an effect", () => {
    const onEffect = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
      }),
    )
    act(() =>
      result.current.play({
        runKey: "session:0:reject-1",
        traces: [rejectedBodyTrace],
      }),
    )
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()
    expect(result.current.snapshot.trace?.stoppedAt).toBe("body")
  })

  it("cancels timers and pending effects on reset or unmount", () => {
    const onEffect = vi.fn()
    const { result, unmount } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
      }),
    )
    act(() =>
      result.current.play({
        runKey: "session:0:run-2",
        traces: [executedDoorTrace],
      }),
    )
    act(() => result.current.cancel())
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()

    act(() =>
      result.current.play({
        runKey: "session:0:run-3",
        traces: [executedDoorTrace],
      }),
    )
    unmount()
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()
  })

  it("deduplicates trace ids and preserves source sequence order", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const second = {
      ...executedDoorTrace,
      traceId: "door-attempt-2",
      attemptId: "door-attempt-2",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
        onComplete,
      }),
    )
    act(() =>
      result.current.play({
        runKey: "session:0:ordered",
        traces: [second, executedDoorTrace, executedDoorTrace],
      }),
    )
    act(() => vi.runAllTimers())
    expect(onEffect.mock.calls.map(([trace]) => trace.sequence)).toEqual([1, 2])
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it("replaces an old run and completes reduced motion synchronously", () => {
    const onEffect = vi.fn()
    const onCancel = vi.fn()
    const { result, rerender } = renderHook(
      ({ reducedMotion }) =>
        useVehicleFlowPlayback({
          stepMs: 200,
          reducedMotion,
          onEffect,
          onCancel,
        }),
      { initialProps: { reducedMotion: false } },
    )
    act(() =>
      result.current.play({
        runKey: "session:0:old",
        traces: [executedDoorTrace],
      }),
    )
    act(() =>
      result.current.play({
        runKey: "session:0:new",
        traces: [rejectedBodyTrace],
      }),
    )
    expect(onCancel).toHaveBeenCalledWith("session:0:old")
    rerender({ reducedMotion: true })
    act(() =>
      result.current.play({
        runKey: "session:0:reduced",
        traces: [executedDoorTrace],
      }),
    )
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("finishes an active run when reduced motion becomes enabled", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ reducedMotion }) =>
        useVehicleFlowPlayback({
          stepMs: 200,
          reducedMotion,
          onEffect,
          onComplete,
        }),
      { initialProps: { reducedMotion: false } },
    )

    act(() =>
      result.current.play({
        runKey: "session:0:motion-change",
        traces: [executedDoorTrace],
      }),
    )
    act(() => vi.advanceTimersByTime(200))
    expect(onEffect).not.toHaveBeenCalled()

    rerender({ reducedMotion: true })

    expect(result.current.snapshot.phase).toBe("complete")
    expect(result.current.snapshot.segmentIndex).toBe(
      executedDoorTrace.route.length - 1,
    )
    expect(onEffect).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith("session:0:motion-change")
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.runAllTimers())
    expect(onEffect).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it("completes reduced motion synchronously with the same final semantics", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        reducedMotion: true,
        onEffect,
        onComplete,
      }),
    )

    act(() => result.current.play({
      runKey: "reduced-final-semantics",
      traces: [executedDoorTrace],
    }))

    expect(result.current.snapshot).toMatchObject({
      phase: "complete",
      trace: executedDoorTrace,
      traceIndex: 0,
      traceCount: 1,
      segmentIndex: executedDoorTrace.route.length - 1,
    })
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(onComplete).toHaveBeenCalledWith("reduced-final-semantics")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not complete an old run when its effect callback cancels it", () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()
    let cancelCurrent = () => {}
    const onEffect = vi.fn(() => cancelCurrent())
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
        onComplete,
        onCancel,
      }),
    )
    cancelCurrent = result.current.cancel

    act(() =>
      result.current.play({
        runKey: "session:0:cancel-from-effect",
        traces: [executedDoorTrace],
      }),
    )
    act(() => vi.runAllTimers())

    expect(onEffect).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledWith("session:0:cancel-from-effect")
    expect(onComplete).not.toHaveBeenCalled()
    expect(result.current.snapshot.phase).toBe("cancelled")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps cancellation visible until clear resets the playback to idle", () => {
    const onEffect = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
      }),
    )

    act(() =>
      result.current.play({
        runKey: "session:0:clear",
        traces: [executedDoorTrace],
      }),
    )
    act(() => result.current.cancel())
    expect(result.current.snapshot.phase).toBe("cancelled")

    act(() => result.current.clear())
    act(() => vi.runAllTimers())

    expect(result.current.snapshot).toMatchObject({
      playbackId: 0,
      phase: "idle",
      trace: null,
      traceCount: 0,
      segmentIndex: 0,
    })
    expect(onEffect).not.toHaveBeenCalled()
  })

  it("clears a completed playback without presenting it as cancelled", () => {
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: true }),
    )

    act(() =>
      result.current.play({
        runKey: "session:0:completed-clear",
        traces: [rejectedBodyTrace],
      }),
    )
    expect(result.current.snapshot.phase).toBe("complete")

    act(() => result.current.cancel())
    expect(result.current.snapshot.phase).toBe("complete")

    act(() => result.current.clear())
    expect(result.current.snapshot.phase).toBe("idle")
    expect(result.current.snapshot.trace).toBeNull()
  })

  it("keeps a replacement started by an effect callback authoritative", () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()
    let playReplacement = () => false
    const onEffect = vi.fn(() => {
      playReplacement()
    })
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: true,
        onEffect,
        onComplete,
        onCancel,
      }),
    )
    playReplacement = () =>
      result.current.play({
        runKey: "session:0:replacement",
        traces: [rejectedBodyTrace],
      })

    act(() =>
      result.current.play({
        runKey: "session:0:replaced-from-effect",
        traces: [executedDoorTrace],
      }),
    )
    act(() => vi.runAllTimers())

    expect(onEffect).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledWith("session:0:replaced-from-effect")
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith("session:0:replacement")
    expect(result.current.snapshot.phase).toBe("complete")
    expect(result.current.snapshot.trace?.traceId).toBe(
      rejectedBodyTrace.traceId,
    )
    expect(vi.getTimerCount()).toBe(0)
  })
})
