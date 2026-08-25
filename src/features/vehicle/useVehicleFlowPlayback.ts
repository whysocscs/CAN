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
} | { type: "finish" } | { type: "cancel" }

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

  const cancel = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    const cancelled = runRef.current
    runRef.current = null
    cursorRef.current = null
    dispatchSnapshot({ type: "cancel" })
    if (cancelled) optionsRef.current.onCancel?.(cancelled.runKey)
  }, [])

  const play = useCallback(
    (run: VehicleFlowRun) => {
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
  }
}
