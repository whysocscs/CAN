// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { executedDoorTrace, rejectedBodyTrace } from "./vehicleFlowTestFixtures"
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
    expect(onComplete).toHaveBeenCalledWith("session:0:run-1")
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
})
