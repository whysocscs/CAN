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

  it("starts a step-mode run paused at the first segment without scheduling a timer", () => {
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "guided-first-step",
      route: ["terminal", "obd", "body"],
      stoppedAt: "body",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() =>
      result.current.play({
        runKey: "guided-step-mode",
        traces: [trace],
        playbackMode: "step",
      }),
    )

    expect(result.current.snapshot).toMatchObject({
      phase: "playing",
      traceIndex: 0,
      segmentIndex: 0,
    })
    expect(result.current.isPaused).toBe(true)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isActive).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.runAllTimers())
    expect(result.current.snapshot.segmentIndex).toBe(0)

    act(() => result.current.nextStep())
    expect(result.current.snapshot.segmentIndex).toBe(1)
  })

  it("completes a final step-mode trace when the learner reaches its endpoint", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        reducedMotion: false,
        onEffect,
        onComplete,
      }),
    )

    act(() =>
      result.current.play({
        runKey: "guided-final-endpoint",
        traces: [executedDoorTrace],
        playbackMode: "step",
      }),
    )

    for (let index = 1; index < executedDoorTrace.route.length; index += 1) {
      act(() => result.current.nextStep())
    }

    expect(result.current.snapshot).toMatchObject({
      phase: "complete",
      segmentIndex: executedDoorTrace.route.length - 1,
    })
    expect(result.current.isPaused).toBe(false)
    expect(result.current.isActive).toBe(false)
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(onComplete).toHaveBeenCalledWith("guided-final-endpoint")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("pauses the pending timer without giving up run ownership", () => {
    const onCancel = vi.fn()
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "paused-run",
      route: ["terminal", "obd", "body"],
      stoppedAt: "body",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false, onCancel }),
    )

    act(() => result.current.play({ runKey: "pause-owned", traces: [trace] }))
    act(() => vi.advanceTimersByTime(300))
    act(() => result.current.pause())

    expect(result.current.isPaused).toBe(true)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.isActive).toBe(true)
    expect(result.current.snapshot.segmentIndex).toBe(0)
    expect(onCancel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.runAllTimers())
    expect(result.current.snapshot.segmentIndex).toBe(0)
  })

  it("advances one paused segment at a time and applies its effect only at the endpoint", () => {
    const onEffect = vi.fn()
    const trace: VehicleFlowTrace = {
      ...executedDoorTrace,
      traceId: "manual-segments",
      route: ["terminal", "obd", "body"],
      stoppedAt: "body",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false, onEffect }),
    )

    act(() => result.current.play({ runKey: "manual-step", traces: [trace] }))
    act(() => result.current.pause())

    act(() => result.current.nextStep())
    expect(result.current.snapshot.segmentIndex).toBe(1)
    expect(onEffect).not.toHaveBeenCalled()

    act(() => vi.runAllTimers())
    expect(result.current.snapshot.segmentIndex).toBe(1)

    act(() => result.current.nextStep())
    expect(result.current.snapshot.segmentIndex).toBe(2)
    expect(onEffect).toHaveBeenCalledOnce()
    expect(result.current.isPaused).toBe(true)
    expect(result.current.isActive).toBe(true)
  })

  it("crosses exactly one trace boundary when stepping from a paused final node", () => {
    const first: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "manual-first",
      sequence: 1,
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const second: VehicleFlowTrace = {
      ...first,
      traceId: "manual-second",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() =>
      result.current.play({
        runKey: "manual-boundary",
        traces: [first, second],
      }),
    )
    act(() => result.current.pause())

    act(() => result.current.nextStep())
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 0,
      segmentIndex: 1,
      phase: "playing",
    })

    act(() => result.current.nextStep())
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 1,
      segmentIndex: 0,
      phase: "playing",
    })
    expect(result.current.isPaused).toBe(true)
  })

  it("resumes automatic playback from the paused boundary", () => {
    const onComplete = vi.fn()
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "resumed-run",
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false, onComplete }),
    )

    act(() => result.current.play({ runKey: "resume-owned", traces: [trace] }))
    act(() => result.current.pause())
    act(() => result.current.resume())

    expect(result.current.isPaused).toBe(false)
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.isActive).toBe(true)

    act(() => vi.advanceTimersByTime(599))
    expect(result.current.snapshot.segmentIndex).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot.segmentIndex).toBe(1)

    act(() => vi.advanceTimersByTime(900))
    expect(result.current.snapshot.phase).toBe("complete")
    expect(result.current.isActive).toBe(false)
    expect(onComplete).toHaveBeenCalledWith("resume-owned")
  })

  it("resumes an ordinary boundary with only its unelapsed delay", () => {
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "resume-remaining-step",
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() =>
      result.current.play({ runKey: "remaining-step", traces: [trace] }),
    )
    act(() => vi.advanceTimersByTime(599))
    act(() => result.current.pause())
    act(() => vi.advanceTimersByTime(1_000))
    act(() => result.current.resume())

    expect(result.current.snapshot.segmentIndex).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot.segmentIndex).toBe(1)
  })

  it("resumes a final hold with only its unelapsed delay", () => {
    const first: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      traceId: "resume-remaining-hold-first",
      sequence: 1,
      route: ["terminal", "obd"],
      stoppedAt: "obd",
    }
    const second: VehicleFlowTrace = {
      ...first,
      traceId: "resume-remaining-hold-second",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({ reducedMotion: false }),
    )

    act(() =>
      result.current.play({
        runKey: "remaining-final-hold",
        traces: [first, second],
      }),
    )
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 0,
      segmentIndex: 1,
    })

    act(() => vi.advanceTimersByTime(899))
    act(() => result.current.pause())
    act(() => vi.advanceTimersByTime(1_000))
    act(() => result.current.resume())

    expect(result.current.snapshot.traceIndex).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.snapshot).toMatchObject({
      traceIndex: 1,
      segmentIndex: 0,
    })
  })

  it("keeps a paused run step-driven when reduced motion becomes enabled", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ reducedMotion }) =>
        useVehicleFlowPlayback({ reducedMotion, onEffect, onComplete }),
      { initialProps: { reducedMotion: false } },
    )

    act(() =>
      result.current.play({
        runKey: "paused-reduced-motion",
        traces: [executedDoorTrace],
      }),
    )
    act(() => result.current.pause())
    rerender({ reducedMotion: true })

    expect(result.current.snapshot).toMatchObject({
      phase: "playing",
      segmentIndex: 0,
    })
    expect(result.current.isPaused).toBe(true)
    expect(result.current.isActive).toBe(true)
    expect(onEffect).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    act(() => result.current.nextStep())
    expect(result.current.snapshot.segmentIndex).toBe(1)
    act(() => result.current.resume())
    act(() => vi.runAllTimers())

    expect(result.current.snapshot.phase).toBe("complete")
    expect(onEffect).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith("paused-reduced-motion")
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

    act(() =>
      result.current.play({ runKey: "hold-900", traces: [first, second] }),
    )
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

    act(() =>
      result.current.play({
        runKey: "last-hold",
        traces: [rejectedBodyTrace],
      }),
    )
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

    act(() =>
      result.current.play({
        runKey: "cancel-final-hold",
        traces: [rejectedBodyTrace, second],
      }),
    )
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

  it("replaces an old run without skipping reduced-motion stages", () => {
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
    expect(result.current.snapshot).toMatchObject({
      phase: "playing",
      segmentIndex: 0,
    })
    expect(onEffect).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.runAllTimers())
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves active stage evidence when reduced motion becomes enabled", () => {
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

    expect(result.current.snapshot).toMatchObject({
      phase: "playing",
      segmentIndex: 1,
    })
    expect(onEffect).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.runAllTimers())
    expect(onEffect).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith("session:0:motion-change")
  })

  it("keeps reduced motion pausable with discrete stage progression", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        reducedMotion: true,
        onEffect,
        onComplete,
      }),
    )

    act(() =>
      result.current.play({
        runKey: "reduced-final-semantics",
        traces: [executedDoorTrace],
      }),
    )

    expect(result.current.snapshot).toMatchObject({
      phase: "playing",
      trace: executedDoorTrace,
      traceIndex: 0,
      traceCount: 1,
      segmentIndex: 0,
    })
    expect(onEffect).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    act(() => result.current.pause())
    expect(vi.getTimerCount()).toBe(0)
    act(() => result.current.nextStep())
    expect(result.current.snapshot.segmentIndex).toBe(1)
    act(() => vi.runAllTimers())
    expect(result.current.snapshot.segmentIndex).toBe(1)

    act(() => result.current.resume())
    act(() => vi.runAllTimers())
    expect(result.current.snapshot.phase).toBe("complete")
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(onComplete).toHaveBeenCalledWith("reduced-final-semantics")
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
    act(() => vi.runAllTimers())
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
