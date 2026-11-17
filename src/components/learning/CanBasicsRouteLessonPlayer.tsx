import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react"

export interface CanBasicsRouteLessonChapter {
  id: string
  title: string
  summary: string
  content: ReactNode
  visual: ReactNode
}

interface CanBasicsRouteLessonPlayerProps {
  sectionLabel: string
  title: string
  introduction: string
  objective: ReactNode
  chapters: CanBasicsRouteLessonChapter[]
}

type TravelDirection = "forward" | "backward"

type WheelGesture = {
  accumulatedDelta: number
  direction: number
  locked: boolean
  releaseTimer: number | null
}

const WHEEL_GESTURE_THRESHOLD = 48
const WHEEL_GESTURE_RELEASE_MS = 180

function hashToIndex(hash: string, chapters: CanBasicsRouteLessonChapter[]) {
  const requestedId = decodeURIComponent(hash.replace(/^#/, "")).split("/")[0]
  const chapterIndex = chapters.findIndex(
    (chapter) => chapter.id === requestedId,
  )
  return chapterIndex < 0 ? null : chapterIndex
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, select, textarea, [contenteditable='true']",
      ),
    )
  )
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

export default function CanBasicsRouteLessonPlayer({
  sectionLabel,
  title,
  introduction,
  objective,
  chapters,
}: CanBasicsRouteLessonPlayerProps) {
  const initialIndex =
    typeof window === "undefined"
      ? 0
      : (hashToIndex(window.location.hash, chapters) ?? 0)
  const activeIndexRef = useRef(initialIndex)
  const wheelGestureRef = useRef<WheelGesture>({
    accumulatedDelta: 0,
    direction: 0,
    locked: false,
    releaseTimer: null,
  })
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [direction, setDirection] = useState<TravelDirection>("forward")
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setPrefersReducedMotion(media.matches)
    syncPreference()
    media.addEventListener("change", syncPreference)
    return () => media.removeEventListener("change", syncPreference)
  }, [])

  useEffect(
    () => () => {
      const releaseTimer = wheelGestureRef.current.releaseTimer
      if (releaseTimer !== null) window.clearTimeout(releaseTimer)
    },
    [],
  )

  const moveTo = useCallback(
    (requestedIndex: number, history: "push" | "none" = "push") => {
      const nextIndex = Math.max(
        0,
        Math.min(requestedIndex, chapters.length - 1),
      )
      const currentIndex = activeIndexRef.current
      if (nextIndex === currentIndex) return

      setDirection(nextIndex > currentIndex ? "forward" : "backward")
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)

      if (history === "none") return
      const nextHash = `#${chapters[nextIndex].id}`
      if (window.location.hash === nextHash) return
      window.history.pushState(null, "", nextHash)
    },
    [chapters],
  )

  useEffect(() => {
    const syncFromHistory = () => {
      const nextIndex = hashToIndex(window.location.hash, chapters)
      if (nextIndex !== null) moveTo(nextIndex, "none")
    }
    window.addEventListener("hashchange", syncFromHistory)
    window.addEventListener("popstate", syncFromHistory)
    return () => {
      window.removeEventListener("hashchange", syncFromHistory)
      window.removeEventListener("popstate", syncFromHistory)
    }
  }, [chapters, moveTo])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      isInteractiveTarget(event.target) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return
    }

    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "PageDown"
    ) {
      event.preventDefault()
      moveTo(activeIndexRef.current + 1)
    } else if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp" ||
      event.key === "PageUp"
    ) {
      event.preventDefault()
      moveTo(activeIndexRef.current - 1)
    } else if (event.key === "Home") {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === "End") {
      event.preventDefault()
      moveTo(chapters.length - 1)
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

    const deltaScale =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? window.innerHeight
          : 1
    const delta = event.deltaY * deltaScale
    if (nestedElementCanScroll(event.target, event.currentTarget, delta)) return
    event.preventDefault()

    const wheelDirection = Math.sign(delta)
    const gesture = wheelGestureRef.current

    if (gesture.direction !== wheelDirection) {
      gesture.accumulatedDelta = 0
      gesture.direction = wheelDirection
    }

    if (gesture.releaseTimer !== null) {
      window.clearTimeout(gesture.releaseTimer)
    }
    gesture.releaseTimer = window.setTimeout(() => {
      gesture.accumulatedDelta = 0
      gesture.direction = 0
      gesture.locked = false
      gesture.releaseTimer = null
    }, WHEEL_GESTURE_RELEASE_MS)

    if (gesture.locked) return

    gesture.accumulatedDelta += delta
    if (Math.abs(gesture.accumulatedDelta) < WHEEL_GESTURE_THRESHOLD) return

    gesture.accumulatedDelta = 0
    gesture.locked = true
    moveTo(activeIndexRef.current + wheelDirection)
  }

  const current = chapters[activeIndex] ?? chapters[0]
  const isFinalStep = activeIndex === chapters.length - 1
  const progress = ((activeIndex + 1) / chapters.length) * 100
  const stationStyle = {
    gridTemplateColumns: `repeat(${chapters.length}, minmax(72px, 1fr))`,
  } satisfies CSSProperties

  return (
    <div
      className={`can-lesson-player can-lesson-player--route${
        prefersReducedMotion ? " can-lesson-player--reduced-motion" : ""
      }`}
      data-direction={direction}
      role="region"
      aria-label={`${sectionLabel} 한 화면 학습`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    >
      <header className="can-lesson-player__header">
        <div className="can-lesson-player__header-copy">
          <span>CAN 기초</span>
          <strong>{sectionLabel}</strong>
        </div>

        <nav
          className="can-lesson-player__chapters"
          aria-label={`${sectionLabel} 개념 진행 상황`}
        >
          <ol style={stationStyle}>
            {chapters.map((chapter, index) => (
              <li
                key={chapter.id}
                className={index === activeIndex ? "is-active" : ""}
                aria-current={index === activeIndex ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{chapter.title}</small>
              </li>
            ))}
          </ol>
        </nav>

        <div className="can-lesson-player__count" aria-live="polite">
          <strong>{String(activeIndex + 1).padStart(2, "0")}</strong>
          <span>/ {String(chapters.length).padStart(2, "0")}</span>
        </div>

        <div className="can-lesson-player__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="can-lesson-player__viewport">
        <section
          className="can-lesson-player__slide"
          aria-labelledby="can-route-lesson-title"
        >
          <article
            key={`copy-${current.id}`}
            className="can-lesson-player__copy"
          >
            <div className="can-lesson-player__eyebrow">
              <span>{sectionLabel}</span>
              <strong>{title}</strong>
            </div>
            <span className="can-lesson-player__step-label">
              Concept {String(activeIndex + 1).padStart(2, "0")}
            </span>
            <h1 id="can-route-lesson-title">{current.title}</h1>
            <p>{current.summary}</p>

            <div className="can-lesson-player__route-content">
              {current.content}
            </div>

            {activeIndex === 0 && (
              <details className="can-lesson-player__overview">
                <summary>과정 소개와 학습 목표</summary>
                <p>{introduction}</p>
                <div>
                  <strong>학습 목표</strong>
                  <div>{objective}</div>
                </div>
              </details>
            )}
          </article>

          <figure
            key={`visual-${current.id}`}
            className="can-lesson-player__visual"
          >
            <figcaption>
              <span>
                <small>{String(activeIndex + 1).padStart(2, "0")}</small>
                <strong>{current.title}</strong>
              </span>
              <em>{sectionLabel}</em>
            </figcaption>
            <div className="can-lesson-player__visual-canvas can-lesson-player__visual-canvas--route">
              {current.visual}
            </div>
          </figure>
        </section>
      </main>

      <footer className="can-lesson-player__footer">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={() => moveTo(activeIndex - 1)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          이전 개념
        </button>
        <div>
          <strong>{current.title}</strong>
          <span>
            {activeIndex + 1} / {chapters.length}
          </span>
        </div>
        <button
          type="button"
          disabled={isFinalStep}
          onClick={() => moveTo(activeIndex + 1)}
        >
          다음 개념
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </footer>

      <div
        className="can-lesson-player__announcer"
        aria-live="polite"
        aria-atomic="true"
      >
        {sectionLabel}, {current.title}
      </div>
    </div>
  )
}
