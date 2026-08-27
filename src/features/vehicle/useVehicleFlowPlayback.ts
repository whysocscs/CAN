import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import type {
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "./vehicleFlowTypes"

const DEFAULT_STEP_MS = 220
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const IDLE: VehicleFlowPlaybackSnapshot = {
  playbackId: 0,
  phase: "idle",
  trace: null,
  traceIndex: 0,
  traceCount: 0,
  segmentIndex: 0,
}

type SnapshotAction = {
  type: "replace"
  snapshot: VehicleFlowPlaybackSnapshot
} | { type: "finish" } | { type: "cancel" } | { type: "clear" }

function snapshotReducer(
  snapshot: VehicleFlowPlaybackSnapshot,
  action: SnapshotAction,
): VehicleFlowPlaybackSnapshot {
  switch (action.type) {
    case "replace":
      return action.snapshot
    case "finish":
      return { ...snapshot, phase: "complete" }
    case "cancel":
      return snapshot.phase === "playing"
        ? { ...snapshot, phase: "cancelled" }
        : snapshot
    case "clear":
      return IDLE
  }
}

function useSystemReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = () => setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener("change", handleChange)
    handleChange()
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  return reducedMotion
}

function dedupeTraces(traces: VehicleFlowTrace[]): VehicleFlowTrace[] {
  const seen = new Set<string>()
  return traces.filter((trace) => {
    if (seen.has(trace.traceId)) return false
    seen.add(trace.traceId)
    return true
  })
}

export interface VehicleFlowRun {
  runKey: string
  traces: VehicleFlowTrace[]
}

export interface VehicleFlowPlaybackOptions {
  stepMs?: number
  reducedMotion?: boolean
  onEffect?: (trace: VehicleFlowTrace) => void
  onComplete?: (runKey: string) => void
  onCancel?: (runKey: string) => void
}

interface PlaybackCursor {
  generation: number
  traceIndex: number
}

/**
 * 서버가 확정한 flow trace를 화면용 타임라인으로 재생한다.
 *
 * 이 훅은 CAN 바이트를 다시 해석하지 않는다. route와 effectApplied는 서버 결과를
 * 그대로 따르고, generation으로 이전 타이머와 재진입 콜백이 새 재생을 건드리지
 * 못하게 한다.
 */
export function useVehicleFlowPlayback(options: VehicleFlowPlaybackOptions) {
  const systemReducedMotion = useSystemReducedMotion()
  const reducedMotion = options.reducedMotion ?? systemReducedMotion
  const [snapshot, dispatchSnapshot] = useReducer(snapshotReducer, IDLE)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const runRef = useRef<VehicleFlowRun | null>(null)
  const cursorRef = useRef<PlaybackCursor | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = { ...options, reducedMotion }

  const ownsRun = useCallback(
    (generation: number, run: VehicleFlowRun) =>
      generationRef.current === generation && runRef.current === run,
    [],
  )

  const finishSynchronously = useCallback(
    (generation: number) => {
      const run = runRef.current
      if (!run || !ownsRun(generation, run)) return

      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      const cursor = cursorRef.current
      const startTraceIndex =
        cursor?.generation === generation ? cursor.traceIndex : 0

      // 사용자가 재생 중 모션 축소를 켜도 이미 적용한 trace는 한 번 더 실행하지 않는다.
      for (
        let traceIndex = startTraceIndex;
        traceIndex < run.traces.length;
        traceIndex += 1
      ) {
        if (!ownsRun(generation, run)) return
        const trace = run.traces[traceIndex]
        dispatchSnapshot({
          type: "replace",
          snapshot: {
            playbackId: generation,
            phase: "playing",
            trace,
            traceIndex,
            traceCount: run.traces.length,
            segmentIndex: trace.route.length - 1,
          },
        })
        cursorRef.current = { generation, traceIndex: traceIndex + 1 }
        if (trace.effectApplied) {
          optionsRef.current.onEffect?.(trace)
          if (!ownsRun(generation, run)) return
        }
      }

      if (!ownsRun(generation, run)) return
      runRef.current = null
      cursorRef.current = null
      dispatchSnapshot({ type: "finish" })
      optionsRef.current.onComplete?.(run.runKey)
    },
    [ownsRun],
  )

  const advance = useCallback(
    (generation: number, traceIndex: number, segmentIndex: number) => {
      const run = runRef.current
      if (!run || generationRef.current !== generation) return

      const trace = run.traces[traceIndex]
      dispatchSnapshot({
        type: "replace",
        snapshot: {
          playbackId: generation,
          phase: "playing",
          trace,
          traceIndex,
          traceCount: run.traces.length,
          segmentIndex,
        },
      })

      const finalNode = trace.route.length - 1
      if (segmentIndex >= finalNode) {
        timerRef.current = null
        cursorRef.current = { generation, traceIndex: traceIndex + 1 }
        if (trace.effectApplied) {
          optionsRef.current.onEffect?.(trace)
          if (!ownsRun(generation, run)) return
        }
        if (traceIndex + 1 < run.traces.length) {
          timerRef.current = setTimeout(
            () => advance(generation, traceIndex + 1, 0),
            optionsRef.current.stepMs ?? DEFAULT_STEP_MS,
          )
          return
        }

        runRef.current = null
        cursorRef.current = null
        dispatchSnapshot({ type: "finish" })
        optionsRef.current.onComplete?.(run.runKey)
        return
      }

      timerRef.current = setTimeout(
        () => advance(generation, traceIndex, segmentIndex + 1),
        optionsRef.current.stepMs ?? DEFAULT_STEP_MS,
      )
    },
    [ownsRun],
  )

  const stop = useCallback((clearSnapshot: boolean) => {
    // 타이머를 지우는 것만으로는 이미 큐에 들어간 콜백을 막을 수 없다. generation도
    // 올려서 늦게 도착한 콜백이 현재 run의 소유자가 아님을 확인하게 한다.
    generationRef.current += 1
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    const cancelled = runRef.current
    runRef.current = null
    cursorRef.current = null
    dispatchSnapshot({ type: clearSnapshot ? "clear" : "cancel" })
    if (cancelled) optionsRef.current.onCancel?.(cancelled.runKey)
  }, [])

  const cancel = useCallback(() => stop(false), [stop])
  const clear = useCallback(() => stop(true), [stop])

  const play = useCallback(
    (run: VehicleFlowRun) => {
      // onCancel은 사용자 코드라서 새 play를 재진입시킬 수 있다. cancel 이후에도
      // 우리가 예상한 generation인지 확인한 뒤에만 전달받은 run을 시작한다.
      const cancelledGeneration = generationRef.current + 1
      cancel()
      if (
        generationRef.current !== cancelledGeneration ||
        runRef.current !== null
      )
        return false
      const traces = dedupeTraces(run.traces).sort(
        (left, right) => left.sequence - right.sequence,
      )
      if (traces.length === 0) return false

      runRef.current = { ...run, traces }
      const generation = ++generationRef.current
      cursorRef.current = { generation, traceIndex: 0 }
      if (optionsRef.current.reducedMotion) {
        finishSynchronously(generation)
        return true
      }

      advance(generation, 0, 0)
      return true
    },
    [advance, cancel, finishSynchronously],
  )

  useEffect(() => {
    if (reducedMotion && runRef.current) {
      finishSynchronously(generationRef.current)
    }
  }, [finishSynchronously, reducedMotion])

  useEffect(
    () => () => {
      generationRef.current += 1
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      runRef.current = null
      cursorRef.current = null
    },
    [],
  )

  return {
    snapshot,
    isPlaying: snapshot.phase === "playing",
    play,
    cancel,
    clear,
  }
}
