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
}

export default function RouteLesson({
  title,
  introduction,
  objective,
  chapters,
}: RouteLessonProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<Array<HTMLElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const chapterKey = useMemo(
    () => chapters.map((chapter) => chapter.id).join("|"),
    [chapters],
  )

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setPrefersReducedMotion(media.matches)
    syncPreference()
    media.addEventListener("change", syncPreference)
    return () => media.removeEventListener("change", syncPreference)
  }, [])

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!visible) return
        const nextIndex = Number(
          (visible.target as HTMLElement).dataset.chapterIndex,
        )
        if (Number.isFinite(nextIndex)) setActiveIndex(nextIndex)
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
  }, [chapterKey])

  const goToChapter = useCallback(
    (index: number) => {
      const root = scrollRootRef.current
      const chapter = chapterRefs.current[index]
      if (!root || !chapter) return

      const rootRect = root.getBoundingClientRect()
      const chapterRect = chapter.getBoundingClientRect()
      root.scrollTo({
        top: root.scrollTop + chapterRect.top - rootRect.top - 72,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      })
      setActiveIndex(index)
    },
    [prefersReducedMotion],
  )

  const activeChapter = chapters[activeIndex] ?? chapters[0]

  return (
    <div className="route-lesson" ref={scrollRootRef}>
      <header className="route-lesson__intro">
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
              <span>
                {activeIndex + 1} / {chapters.length}
              </span>
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
