import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react"

export interface RouteLessonChapter {
  id: string
  title: string
  summary: string
  content: ReactNode
  visual: ReactNode
}

interface RouteLessonProps {
  title: string
  introduction: string
  objective: ReactNode
  chapters: RouteLessonChapter[]
  snapScope?: "can-basics"
}

type TransitionStyle = "slide" | "fade" | "slide-h" | "scale"

const TRANSITION_LABELS: Record<TransitionStyle, string> = {
  slide: "수직 슬라이드",
  fade: "페이드",
  "slide-h": "수평 슬라이드",
  scale: "스케일",
}

const STATIONS_HEIGHT = 72
const WHEEL_GESTURE_THRESHOLD = 52
const WHEEL_INERTIA_RELEASE_MS = 220
const PAGE_SETTLE_MS = 520
const PAGE_LOCK_SAFETY_MS = 1400
const SNAP_POSITION_TOLERANCE = 2
const CHAPTER_ENTRANCE_MS = 520

type TravelDirection = "forward" | "backward"

interface ChapterEntrance {
  index: number
  direction: TravelDirection
  sequence: number
}

function normalizedWheelDelta(event: WheelEvent, viewportHeight: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * viewportHeight
  }
  return event.deltaY
}

function nestedElementCanScroll(
  target: EventTarget | null,
  root: HTMLElement,
  deltaY: number,
) {
  let element = target instanceof Element ? target : null

  while (element && element !== root) {
    if (element instanceof HTMLElement) {
      const { overflowY } = window.getComputedStyle(element)
      const scrollable =
        (overflowY === "auto" || overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight + 1

      if (scrollable) {
        const canScrollDown =
          element.scrollTop + element.clientHeight < element.scrollHeight - 1
        const canScrollUp = element.scrollTop > 1
        if ((deltaY > 0 && canScrollDown) || (deltaY < 0 && canScrollUp)) {
          return true
        }
      }
    }
    element = element.parentElement
  }

  return false
}

export default function RouteLesson({
  title,
  introduction,
  objective,
  chapters,
  snapScope,
}: RouteLessonProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLElement>(null)
  const chapterRefs = useRef<Array<HTMLElement | null>>([])
  const activeIndexRef = useRef(0)
  const snapSettlingRef = useRef(false)
  const entranceSequenceRef = useRef(0)
  const entranceClearTimerRef = useRef<number | undefined>(undefined)
  const [activeIndex, setActiveIndex] = useState(0)
  const [stageDirection, setStageDirection] =
    useState<TravelDirection>("forward")
  const [chapterEntrance, setChapterEntrance] =
    useState<ChapterEntrance | null>(null)
  const [motionReady, setMotionReady] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>("slide")
  const chapterKey = useMemo(
    () => chapters.map((chapter) => chapter.id).join("|"),
    [chapters],
  )
  const fullPageSnap = snapScope === "can-basics"

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setPrefersReducedMotion(media.matches)
    syncPreference()
    media.addEventListener("change", syncPreference)
    return () => media.removeEventListener("change", syncPreference)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMotionReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const activateChapter = useCallback(
    (nextIndex: number) => {
      const boundedIndex = Math.max(0, Math.min(nextIndex, chapters.length - 1))
      activeIndexRef.current = boundedIndex
      setActiveIndex(boundedIndex)
    },
    [chapters.length],
  )

  const commitChapter = useCallback(
    (nextIndex: number, direction: TravelDirection) => {
      setStageDirection(direction)
      activateChapter(nextIndex)
    },
    [activateChapter],
  )

  const startChapterEntrance = useCallback(
    (nextIndex: number, direction: TravelDirection) => {
      const boundedIndex = Math.max(0, Math.min(nextIndex, chapters.length - 1))
      if (!fullPageSnap || prefersReducedMotion) return

      const sequence = entranceSequenceRef.current + 1
      entranceSequenceRef.current = sequence
      setChapterEntrance({ index: boundedIndex, direction, sequence })

      if (entranceClearTimerRef.current !== undefined) {
        window.clearTimeout(entranceClearTimerRef.current)
      }
      entranceClearTimerRef.current = window.setTimeout(() => {
        setChapterEntrance((current) =>
          current?.sequence === sequence ? null : current,
        )
        entranceClearTimerRef.current = undefined
      }, CHAPTER_ENTRANCE_MS)
    },
    [chapters.length, fullPageSnap, prefersReducedMotion],
  )

  useEffect(
    () => () => {
      if (entranceClearTimerRef.current !== undefined) {
        window.clearTimeout(entranceClearTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!visible || (fullPageSnap && snapSettlingRef.current)) return
        const nextIndex = Number(
          (visible.target as HTMLElement).dataset.chapterIndex,
        )
        if (Number.isFinite(nextIndex)) activateChapter(nextIndex)
      },
      {
        root,
        rootMargin: "-22% 0px -42% 0px",
        threshold: [0.15, 0.35, 0.55, 0.75],
      },
    )

    chapterRefs.current.forEach((chapter) => {
      if (chapter) observer.observe(chapter)
    })

    return () => observer.disconnect()
  }, [activateChapter, chapterKey, fullPageSnap])

  const goToChapter = useCallback(
    (index: number) => {
      const root = scrollRootRef.current
      const chapter = chapterRefs.current[index]
      if (!root || !chapter) return

      const rootRect = root.getBoundingClientRect()
      const chapterRect = chapter.getBoundingClientRect()
      root.scrollTo({
        top:
          root.scrollTop +
          chapterRect.top -
          rootRect.top -
          STATIONS_HEIGHT,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      })
      commitChapter(
        index,
        index >= activeIndexRef.current ? "forward" : "backward",
      )
    },
    [commitChapter, prefersReducedMotion],
  )

  useEffect(() => {
    const root = scrollRootRef.current
    const intro = introRef.current
    if (!fullPageSnap || !root || !intro) return

    const desktop = window.matchMedia("(min-width: 1051px)")
    let wheelAccumulator = 0
    let pageLocked = false
    let lockStartedAt = 0
    let lockUntil = 0
    let settleTargetTop: number | null = null
    let pendingChapterIndex: number | null = null
    let pendingEntranceStarted = false
    let lockedDirection: 1 | -1 = 1
    let accumulatorResetTimer: number | undefined
    let lockReleaseTimer: number | undefined
    let arrivalFrame: number | undefined

    const clearAccumulator = () => {
      wheelAccumulator = 0
      if (accumulatorResetTimer !== undefined) {
        window.clearTimeout(accumulatorResetTimer)
        accumulatorResetTimer = undefined
      }
    }

    const cancelArrivalWatch = () => {
      if (arrivalFrame !== undefined) {
        window.cancelAnimationFrame(arrivalFrame)
        arrivalFrame = undefined
      }
    }

    const startPendingChapterEntrance = () => {
      if (pendingChapterIndex === null || pendingEntranceStarted) return
      startChapterEntrance(
        pendingChapterIndex,
        lockedDirection > 0 ? "forward" : "backward",
      )
      pendingEntranceStarted = true
    }

    const commitPendingChapter = () => {
      if (pendingChapterIndex === null) return
      startPendingChapterEntrance()
      commitChapter(
        pendingChapterIndex,
        lockedDirection > 0 ? "forward" : "backward",
      )
      pendingChapterIndex = null
    }

    const watchForArrival = () => {
      if (!pageLocked || settleTargetTop === null) {
        arrivalFrame = undefined
        return
      }

      const distanceToTarget = Math.abs(root.scrollTop - settleTargetTop)
      const effectiveViewport = Math.max(
        1,
        root.clientHeight - STATIONS_HEIGHT,
      )
      const entranceDistance = Math.max(
        140,
        Math.min(320, effectiveViewport * 0.32),
      )

      if (distanceToTarget <= entranceDistance) {
        startPendingChapterEntrance()
      }

      if (distanceToTarget <= SNAP_POSITION_TOLERANCE) {
        commitPendingChapter()
        arrivalFrame = undefined
        return
      }

      arrivalFrame = window.requestAnimationFrame(watchForArrival)
    }

    const finishPageLock = () => {
      if (lockReleaseTimer !== undefined) {
        window.clearTimeout(lockReleaseTimer)
        lockReleaseTimer = undefined
      }
      cancelArrivalWatch()
      if (
        settleTargetTop !== null &&
        Math.abs(root.scrollTop - settleTargetTop) > SNAP_POSITION_TOLERANCE
      ) {
        const previousScrollBehavior = root.style.scrollBehavior
        root.style.scrollBehavior = "auto"
        root.scrollTop = settleTargetTop
        root.style.scrollBehavior = previousScrollBehavior
      }
      commitPendingChapter()
      pageLocked = false
      snapSettlingRef.current = false
      lockStartedAt = 0
      lockUntil = 0
      settleTargetTop = null
      delete root.dataset.snapSettling
    }

    const releasePageLock = () => {
      const remaining = lockUntil - window.performance.now()
      if (remaining > 1) {
        lockReleaseTimer = window.setTimeout(releasePageLock, remaining)
        return
      }
      finishPageLock()
    }

    const extendPageLock = (
      duration: number,
      targetTop?: number,
      nextChapterIndex?: number | null,
      direction?: 1 | -1,
    ) => {
      const now = window.performance.now()
      if (!pageLocked) {
        lockStartedAt = now
        lockUntil = 0
      }
      pageLocked = true
      snapSettlingRef.current = true
      root.dataset.snapSettling = "true"
      if (targetTop !== undefined) {
        settleTargetTop = targetTop
        pendingChapterIndex = nextChapterIndex ?? null
        pendingEntranceStarted = false
        lockedDirection = direction ?? lockedDirection
        cancelArrivalWatch()
        arrivalFrame = window.requestAnimationFrame(watchForArrival)
      }
      lockUntil = Math.min(
        lockStartedAt + PAGE_LOCK_SAFETY_MS,
        Math.max(lockUntil, now + duration),
      )
      if (lockReleaseTimer !== undefined) {
        window.clearTimeout(lockReleaseTimer)
      }
      lockReleaseTimer = window.setTimeout(
        releasePageLock,
        Math.max(0, lockUntil - window.performance.now()),
      )
    }

    const onWheel = (event: WheelEvent) => {
      if (
        !desktop.matches ||
        event.ctrlKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15
      ) {
        return
      }

      const deltaY = normalizedWheelDelta(event, root.clientHeight)
      if (Math.abs(deltaY) < 1.5) return

      if (pageLocked) {
        const incomingDirection: 1 | -1 = deltaY > 0 ? 1 : -1
        const hasArrived =
          settleTargetTop !== null &&
          Math.abs(root.scrollTop - settleTargetTop) <= SNAP_POSITION_TOLERANCE

        if (incomingDirection !== lockedDirection && hasArrived) {
          finishPageLock()
        } else {
          event.preventDefault()
          if (incomingDirection === lockedDirection) {
            extendPageLock(WHEEL_INERTIA_RELEASE_MS)
          }
          return
        }
      }

      if (nestedElementCanScroll(event.target, root, deltaY)) {
        clearAccumulator()
        return
      }

      const rootRect = root.getBoundingClientRect()
      const nodes = [intro, ...chapterRefs.current.filter(Boolean)] as HTMLElement[]
      const snapTargets = nodes.map((node, index) => {
        const nodeRect = node.getBoundingClientRect()
        const viewportHeight =
          index === 0 ? root.clientHeight : root.clientHeight - STATIONS_HEIGHT
        return {
          top: Math.max(
            0,
            root.scrollTop +
              nodeRect.top -
              rootRect.top -
              (index === 0 ? 0 : STATIONS_HEIGHT),
          ),
          overflowing: nodeRect.height > viewportHeight + 2,
        }
      })

      if (snapTargets.length < 2) return

      const direction = deltaY > 0 ? 1 : -1
      const currentTop = root.scrollTop
      let containingIndex = 0
      snapTargets.forEach((target, index) => {
        if (target.top <= currentTop + 2) containingIndex = index
      })

      const containingTarget = snapTargets[containingIndex]
      if (containingTarget.overflowing) {
        const nextBoundary =
          snapTargets[containingIndex + 1]?.top ??
          root.scrollHeight - root.clientHeight
        const canContinueDown =
          direction > 0 && currentTop < nextBoundary - 6
        const canContinueUp =
          direction < 0 && currentTop > containingTarget.top + 6

        if (canContinueDown || canContinueUp) {
          clearAccumulator()
          return
        }
      }

      event.preventDefault()
      if (Math.sign(wheelAccumulator) !== direction) wheelAccumulator = 0
      wheelAccumulator += deltaY

      if (accumulatorResetTimer !== undefined) {
        window.clearTimeout(accumulatorResetTimer)
      }
      accumulatorResetTimer = window.setTimeout(clearAccumulator, 140)

      if (Math.abs(wheelAccumulator) < WHEEL_GESTURE_THRESHOLD) return

      const closestIndex = snapTargets.reduce(
        (closest, target, index) =>
          Math.abs(target.top - currentTop) <
          Math.abs(snapTargets[closest].top - currentTop)
            ? index
            : closest,
        0,
      )
      const anchorIndex = containingTarget.overflowing
        ? containingIndex
        : closestIndex
      const destinationIndex = Math.max(
        0,
        Math.min(anchorIndex + direction, snapTargets.length - 1),
      )

      clearAccumulator()
      if (destinationIndex === anchorIndex) return

      extendPageLock(
        prefersReducedMotion ? WHEEL_INERTIA_RELEASE_MS : PAGE_SETTLE_MS,
        snapTargets[destinationIndex].top,
        destinationIndex > 0 ? destinationIndex - 1 : null,
        direction,
      )
      root.scrollTo({
        top: snapTargets[destinationIndex].top,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      })
    }

    let wheelListenerAttached = false
    const syncWheelListener = () => {
      if (desktop.matches && !wheelListenerAttached) {
        root.addEventListener("wheel", onWheel, { passive: false })
        wheelListenerAttached = true
        return
      }

      if (!desktop.matches && wheelListenerAttached) {
        root.removeEventListener("wheel", onWheel)
        wheelListenerAttached = false
        clearAccumulator()
        finishPageLock()
      }
    }

    desktop.addEventListener("change", syncWheelListener)
    syncWheelListener()
    return () => {
      desktop.removeEventListener("change", syncWheelListener)
      if (wheelListenerAttached) root.removeEventListener("wheel", onWheel)
      if (accumulatorResetTimer !== undefined) {
        window.clearTimeout(accumulatorResetTimer)
      }
      if (lockReleaseTimer !== undefined) {
        window.clearTimeout(lockReleaseTimer)
      }
      cancelArrivalWatch()
      snapSettlingRef.current = false
      delete root.dataset.snapSettling
    }
  }, [
    chapterKey,
    commitChapter,
    fullPageSnap,
    prefersReducedMotion,
    startChapterEntrance,
  ])

  const activeChapter = chapters[activeIndex] ?? chapters[0]
  const rootClassName = [
    "route-lesson",
    fullPageSnap && "route-lesson--section-snap",
    fullPageSnap && motionReady && !prefersReducedMotion && "route-lesson--motion-ready",
    fullPageSnap && prefersReducedMotion && "route-lesson--reduced-motion",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      className={rootClassName}
      data-scroll-scope={snapScope}
      data-stage-direction={stageDirection}
      data-transition-style={transitionStyle}
      role={fullPageSnap ? "region" : undefined}
      aria-label={fullPageSnap ? `${title} 전체 화면 학습` : undefined}
      tabIndex={fullPageSnap ? 0 : undefined}
      ref={scrollRootRef}
    >
      <header ref={introRef} className="route-lesson__intro">
        <h1>{title}</h1>
        <p>{introduction}</p>
        <div className="route-lesson__objective">
          <strong>학습 목표</strong>
          <div>{objective}</div>
        </div>
      </header>

      <nav
        className="route-lesson__stations"
        aria-label="이 페이지의 학습 개념"
      >
        <div className="route-lesson__station-track">
          {chapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              className={
                index === activeIndex
                  ? "is-active"
                  : index < activeIndex
                    ? "is-complete"
                    : ""
              }
              aria-current={index === activeIndex ? "step" : undefined}
              onClick={() => goToChapter(index)}
            >
              <span aria-hidden="true" />
              <small>{chapter.title}</small>
            </button>
          ))}
        </div>
        <span className="route-lesson__progress-copy" aria-live="polite">
          {activeIndex + 1} / {chapters.length}
        </span>
      </nav>

      <div className="route-lesson__story">
        <main className="route-lesson__chapters">
          {chapters.map((chapter, index) => (
            <section
              key={chapter.id}
              ref={(node) => {
                chapterRefs.current[index] = node
              }}
              id={chapter.id}
              className="route-lesson__chapter"
              data-chapter-index={index}
              data-active={index === activeIndex}
              data-entering={
                chapterEntrance?.index === index ? "true" : undefined
              }
              data-enter-direction={
                chapterEntrance?.index === index
                  ? chapterEntrance.direction
                  : undefined
              }
              aria-labelledby={`${chapter.id}-title`}
            >
              <span
                className="route-lesson__chapter-station"
                aria-hidden="true"
              />
              <div className="route-lesson__chapter-copy">
                <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
                <p className="route-lesson__chapter-summary">
                  {chapter.summary}
                </p>
                <div className="route-lesson__chapter-content">
                  {chapter.content}
                </div>

                <div
                  className="route-lesson__mobile-visual"
                  aria-hidden={index !== activeIndex}
                >
                  {chapter.visual}
                </div>

                {index < chapters.length - 1 && (
                  <button
                    type="button"
                    className="route-lesson__inline-next"
                    onClick={() => goToChapter(index + 1)}
                  >
                    <span>{chapters[index + 1].title}</span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>
          ))}
        </main>

        <aside
          className="route-lesson__stage-column"
          aria-label="현재 개념 시각 자료"
        >
          <figure className="route-lesson__stage">
            <figcaption>
              <strong>{activeChapter.title}</strong>
              <span>CAN 기초 경로</span>
            </figcaption>
            <div className="route-lesson__stage-visual" key={activeChapter.id}>
              {activeChapter.visual}
            </div>
            <div className="route-lesson__stage-controls">
              <button
                type="button"
                aria-label="이전 개념"
                disabled={activeIndex === 0}
                onClick={() => goToChapter(activeIndex - 1)}
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <div className="route-lesson__transition-picker" role="group" aria-label="전환 스타일">
                {(["slide", "fade", "slide-h", "scale"] as TransitionStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={transitionStyle === style}
                    title={TRANSITION_LABELS[style]}
                    onClick={() => setTransitionStyle(style)}
                  >
                    {style === "slide" && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M7 2v10M3.5 5.5 7 2l3.5 3.5M3.5 8.5 7 12l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {style === "fade" && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 1.5"/>
                        <circle cx="7" cy="7" r="1.8" fill="currentColor"/>
                      </svg>
                    )}
                    {style === "slide-h" && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M2 7h10M5.5 3.5 2 7l3.5 3.5M8.5 3.5 12 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {style === "scale" && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                        <rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" strokeOpacity="0.5"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label="다음 개념"
                disabled={activeIndex === chapters.length - 1}
                onClick={() => goToChapter(activeIndex + 1)}
              >
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </figure>
        </aside>
      </div>
    </div>
  )
}
