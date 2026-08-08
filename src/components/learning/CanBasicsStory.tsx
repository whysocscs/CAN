import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react"
import {
  AckErrorVisual,
  ArbitrationVisual,
  FrameVisual,
  SignalVisual,
  WhyCanVisual,
} from "@/components/learning/CanBasicsVisuals"

type StoryPosition = {
  chapterIndex: number
  stepIndex: number
}

type PositionSource = "scroll" | "settle" | "button" | "keyboard" | "rail" | "hash"

type PositionOptions = {
  source: PositionSource
  scroll?: boolean
  history?: "push" | "replace" | "none"
}

type ProgrammaticTarget = StoryPosition & {
  expiresAt: number
}

const chapters = [
  {
    id: "why-can",
    title: "Why CAN",
    koreanTitle: "왜 CAN이 필요한가",
    steps: [
      {
        title: "배선은 기능보다 빠르게 복잡해집니다",
        body: "ECU를 서로 직접 연결하면 장치 하나가 추가될 때마다 전용 배선과 커넥터가 함께 늘어납니다.",
      },
      {
        title: "각 ECU의 신호를 한 경로로 모읍니다",
        body: "각 ECU는 긴 전용 배선 대신 짧은 분기선으로 CAN_H와 CAN_L 공용 버스에 연결됩니다.",
      },
      {
        title: "여러 장치가 하나의 버스를 공유한다",
        body: "주소선을 따로 만들지 않고 모든 노드가 같은 프레임을 들은 뒤 필요한 메시지만 처리합니다.",
      },
    ],
  },
  {
    id: "dominant-recessive",
    title: "Dominant and Recessive",
    koreanTitle: "0과 1을 구분하는 방법",
    steps: [
      {
        title: "Recessive 1에서는 두 선이 같은 전압입니다",
        body: "CAN_H와 CAN_L가 모두 약 2.5V일 때 수신 노드는 논리 1로 읽습니다.",
      },
      {
        title: "Dominant 0은 두 선의 전압 차이를 만듭니다",
        body: "CAN_H는 약 3.5V, CAN_L는 약 1.5V가 되어 수신 노드가 논리 0을 판정합니다.",
      },
      {
        title: "0은 같은 순간에 전송된 1보다 우선합니다",
        body: "노드는 자신이 보낸 비트와 실제 버스 값을 비교해 계속 전송할지 판단합니다.",
      },
    ],
  },
  {
    id: "arbitration",
    title: "Arbitration",
    koreanTitle: "충돌 없이 우선순위 정하기",
    steps: [
      {
        title: "세 ECU가 동시에 전송을 시작합니다",
        body: "각 노드는 자신의 11-bit identifier를 가장 높은 비트부터 한 자리씩 내보냅니다.",
      },
      {
        title: "0x300이 첫 번째로 양보합니다",
        body: "Recessive 1을 보냈지만 버스에서 Dominant 0을 읽었기 때문에 해당 비트에서 전송을 멈춥니다.",
      },
      {
        title: "가장 낮은 0x120이 버스를 차지합니다",
        body: "0x128도 뒤의 비교 비트에서 양보합니다. 숫자가 낮은 identifier가 더 이른 Dominant 0을 유지합니다.",
      },
    ],
  },
  {
    id: "frame",
    title: "CAN Frame",
    koreanTitle: "버스를 오가는 메시지 단위",
    steps: [
      {
        title: "Frame은 버스 위를 오가는 메시지 한 묶음입니다",
        body: "CAN은 특정 ECU 주소가 아니라 Frame을 보냅니다. 모든 노드가 같은 Frame을 듣고, 필요한 메시지인지 각자 판단합니다.",
      },
      {
        title: "Identifier가 메시지의 의미와 우선순위를 알려줍니다",
        body: "Identifier는 수신 대상의 주소가 아닙니다. 어떤 종류의 메시지인지와 동시에 전송될 때의 중재 우선순위를 함께 나타냅니다.",
      },
      {
        title: "Data를 어떻게 읽는지는 CAN Frame에서 자세히 다룹니다",
        body: "Data 길이, 실제 값, CRC와 ACK처럼 한 Frame의 세부 필드는 다음 CAN Frame 학습에서 교육용 예시와 함께 해석합니다.",
      },
    ],
  },
  {
    id: "ack-error-practice",
    title: "ACK, Error and Practice",
    koreanTitle: "수신 확인과 오류 복구",
    steps: [
      {
        title: "정상 수신 노드가 ACK를 기록합니다",
        body: "송신 노드는 ACK 슬롯을 Recessive 1로 보내고, 정상 수신한 노드가 이를 Dominant 0으로 바꿉니다.",
      },
      {
        title: "오류 프레임은 중단하고 다시 전송합니다",
        body: "오류를 감지한 노드가 Error flag를 보내면 현재 프레임을 폐기하고 버스가 비었을 때 다시 시도합니다.",
      },
      {
        title: "Checkpoint",
        body: "identifier의 비트를 비교해 어떤 노드가 가장 먼저 버스를 차지하는지 선택하세요.",
      },
    ],
  },
] as const

const checkpointOptions = ["0x120", "0x128", "0x300"] as const
const totalSteps = chapters.reduce(
  (total, chapter) => total + chapter.steps.length,
  0,
)

function clampPosition(position: StoryPosition): StoryPosition {
  const chapterIndex = Math.max(
    0,
    Math.min(position.chapterIndex, chapters.length - 1),
  )
  const stepIndex = Math.max(
    0,
    Math.min(position.stepIndex, chapters[chapterIndex].steps.length - 1),
  )
  return { chapterIndex, stepIndex }
}

function positionToFlatIndex(position: StoryPosition) {
  let index = 0
  for (
    let chapterIndex = 0;
    chapterIndex < position.chapterIndex;
    chapterIndex += 1
  ) {
    index += chapters[chapterIndex].steps.length
  }
  return index + position.stepIndex
}

function flatIndexToPosition(index: number): StoryPosition {
  let remaining = Math.max(0, Math.min(index, totalSteps - 1))
  for (
    let chapterIndex = 0;
    chapterIndex < chapters.length;
    chapterIndex += 1
  ) {
    const stepCount = chapters[chapterIndex].steps.length
    if (remaining < stepCount) return { chapterIndex, stepIndex: remaining }
    remaining -= stepCount
  }
  return {
    chapterIndex: chapters.length - 1,
    stepIndex: chapters.at(-1)!.steps.length - 1,
  }
}

function hashToPosition(hash: string): StoryPosition | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""))
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === id)
  return chapterIndex >= 0 ? { chapterIndex, stepIndex: 0 } : null
}

function interactiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, select, textarea, [contenteditable='true']",
      ),
    )
  )
}

function storyViewportMetrics(root: HTMLElement) {
  const topInset = window.matchMedia(
    "(min-width: 901px) and (max-width: 1180px)",
  ).matches
    ? 62
    : 0
  const usableHeight = Math.max(1, root.clientHeight - topInset)
  const rootRect = root.getBoundingClientRect()

  return {
    focusLine: rootRect.top + topInset + usableHeight / 2,
    rootRect,
    topInset,
    usableHeight,
  }
}

export default function CanBasicsStory({
  onComplete,
  onContinue,
}: {
  onComplete: () => void
  onContinue: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef<Array<Array<HTMLElement | null>>>([])
  const positionRef = useRef<StoryPosition>({ chapterIndex: 0, stepIndex: 0 })
  const programmaticTargetRef = useRef<ProgrammaticTarget | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const pointerDownRef = useRef(false)
  const didScrollDuringPointerRef = useRef(false)
  const lastScrollTopRef = useRef(0)
  const scrollDirectionRef = useRef<-1 | 0 | 1>(0)
  const completedRef = useRef(false)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [checkpointAnswer, setCheckpointAnswer] = useState<string | null>(null)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const syncPreference = () => setPrefersReducedMotion(media.matches)
    syncPreference()
    media.addEventListener("change", syncPreference)
    return () => media.removeEventListener("change", syncPreference)
  }, [])

  const setLearningPosition = useCallback(
    (requestedPosition: StoryPosition, options: PositionOptions) => {
      const nextPosition = clampPosition(requestedPosition)
      positionRef.current = nextPosition
      setChapterIndex(nextPosition.chapterIndex)
      setStepIndex(nextPosition.stepIndex)

      const chapter = chapters[nextPosition.chapterIndex]
      const nextHash = `#${chapter.id}`
      if (options.history !== "none" && window.location.hash !== nextHash) {
        const method = options.history === "push" ? "pushState" : "replaceState"
        window.history[method](null, "", nextHash)
      }

      if (options.scroll) {
        const target =
          stepRefs.current[nextPosition.chapterIndex]?.[nextPosition.stepIndex]
        if (!target) return
        const compactLayout = window.matchMedia("(max-width: 900px)").matches
        const behavior = prefersReducedMotion ? "auto" : "smooth"

        if (compactLayout) {
          programmaticTargetRef.current = {
            ...nextPosition,
            expiresAt: window.performance.now() + 2200,
          }
          target.scrollIntoView({ block: "start", behavior })
          return
        }

        const root = rootRef.current
        if (!root) return
        const { focusLine } = storyViewportMetrics(root)
        const targetRect = target.getBoundingClientRect()
        const requestedTop =
          root.scrollTop + (targetRect.top + targetRect.height / 2 - focusLine)
        const targetTop = Math.max(
          0,
          Math.min(requestedTop, root.scrollHeight - root.clientHeight),
        )

        if (Math.abs(targetTop - root.scrollTop) <= 1) {
          programmaticTargetRef.current = null
          return
        }

        programmaticTargetRef.current = {
          ...nextPosition,
          expiresAt: window.performance.now() + 2200,
        }
        root.scrollTo({ top: targetTop, behavior })
      }
    },
    [prefersReducedMotion],
  )

  const moveByStep = useCallback(
    (offset: number, source: PositionSource) => {
      const currentFlatIndex = positionToFlatIndex(positionRef.current)
      setLearningPosition(flatIndexToPosition(currentFlatIndex + offset), {
        source,
        scroll: true,
        history: "push",
      })
    },
    [setLearningPosition],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === "undefined") return

    const visibleSteps = new Set<Element>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleSteps.add(entry.target)
          else visibleSteps.delete(entry.target)
        })

        const { focusLine } = storyViewportMetrics(root)
        const candidate = [...visibleSteps].sort((first, second) => {
          const firstRect = first.getBoundingClientRect()
          const secondRect = second.getBoundingClientRect()
          const firstCenter = firstRect.top + firstRect.height / 2
          const secondCenter = secondRect.top + secondRect.height / 2
          return (
            Math.abs(firstCenter - focusLine) -
            Math.abs(secondCenter - focusLine)
          )
        })[0]

        if (!candidate) return
        const nextPosition = {
          chapterIndex: Number((candidate as HTMLElement).dataset.chapterIndex),
          stepIndex: Number((candidate as HTMLElement).dataset.stepIndex),
        }
        if (
          !Number.isFinite(nextPosition.chapterIndex) ||
          !Number.isFinite(nextPosition.stepIndex)
        )
          return

        const target = programmaticTargetRef.current
        if (target) {
          const targetReached =
            target.chapterIndex === nextPosition.chapterIndex &&
            target.stepIndex === nextPosition.stepIndex
          const targetExpired = window.performance.now() >= target.expiresAt
          if (!targetReached && !targetExpired) return
          if (targetExpired) programmaticTargetRef.current = null
        }

        if (
          positionRef.current.chapterIndex === nextPosition.chapterIndex &&
          positionRef.current.stepIndex === nextPosition.stepIndex
        ) {
          return
        }

        setLearningPosition(nextPosition, {
          source: "scroll",
          history: "replace",
        })
      },
      {
        root,
        rootMargin: "-38% 0px -40% 0px",
        threshold: [0, 0.01, 0.4],
      },
    )

    stepRefs.current.flat().forEach((step) => {
      if (step) observer.observe(step)
    })
    return () => observer.disconnect()
  }, [setLearningPosition])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const clearSettleTimer = () => {
      if (settleTimerRef.current === null) return
      window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }

    const settleNearestStep = () => {
      clearSettleTimer()
      const programmaticTarget = programmaticTargetRef.current
      if (
        programmaticTarget &&
        window.performance.now() >= programmaticTarget.expiresAt
      ) {
        programmaticTargetRef.current = null
      }
      if (
        window.matchMedia("(max-width: 900px)").matches ||
        pointerDownRef.current ||
        programmaticTargetRef.current
      ) {
        return
      }

      const { focusLine, usableHeight } = storyViewportMetrics(root)
      const projectedLine =
        focusLine + scrollDirectionRef.current * usableHeight * 0.06
      const candidates = stepRefs.current
        .flat()
        .filter(Boolean) as HTMLElement[]
      const target = candidates.sort((first, second) => {
        const firstRect = first.getBoundingClientRect()
        const secondRect = second.getBoundingClientRect()
        const firstCenter = firstRect.top + firstRect.height / 2
        const secondCenter = secondRect.top + secondRect.height / 2
        return (
          Math.abs(firstCenter - projectedLine) -
          Math.abs(secondCenter - projectedLine)
        )
      })[0]
      if (!target) return

      const focusedElement = document.activeElement
      if (
        focusedElement instanceof Element &&
        target.contains(focusedElement) &&
        interactiveTarget(focusedElement)
      ) {
        return
      }

      const targetRect = target.getBoundingClientRect()
      const distance = targetRect.top + targetRect.height / 2 - focusLine
      const maximumSettleDistance = Math.min(440, usableHeight * 0.48)
      const targetCoversFocusLine =
        targetRect.top <= focusLine && targetRect.bottom >= focusLine
      if (
        Math.abs(distance) <= 8 ||
        Math.abs(distance) > maximumSettleDistance ||
        (targetRect.height > usableHeight - 32 && targetCoversFocusLine)
      ) {
        return
      }

      const nextPosition = {
        chapterIndex: Number(target.dataset.chapterIndex),
        stepIndex: Number(target.dataset.stepIndex),
      }
      if (
        !Number.isFinite(nextPosition.chapterIndex) ||
        !Number.isFinite(nextPosition.stepIndex)
      ) {
        return
      }

      setLearningPosition(nextPosition, {
        source: "settle",
        scroll: true,
        history: "replace",
      })
    }

    const scheduleSettle = () => {
      clearSettleTimer()
      settleTimerRef.current = window.setTimeout(settleNearestStep, 260)
    }

    const handleScroll = () => {
      const nextScrollTop = root.scrollTop
      const delta = nextScrollTop - lastScrollTopRef.current
      if (Math.abs(delta) > 0.5) scrollDirectionRef.current = delta > 0 ? 1 : -1
      lastScrollTopRef.current = nextScrollTop
      if (pointerDownRef.current) didScrollDuringPointerRef.current = true
      if (window.matchMedia("(min-width: 901px)").matches) scheduleSettle()
    }

    const handlePointerDown = () => {
      pointerDownRef.current = true
      didScrollDuringPointerRef.current = false
      const hadProgrammaticTarget = programmaticTargetRef.current !== null
      programmaticTargetRef.current = null
      if (hadProgrammaticTarget) {
        const cancellationOffset = scrollDirectionRef.current > 0 ? -1 : 1
        root.scrollTo({
          top: root.scrollTop + cancellationOffset,
          behavior: "instant",
        })
      }
      clearSettleTimer()
    }

    const handlePointerUp = () => {
      const shouldSettle = didScrollDuringPointerRef.current
      pointerDownRef.current = false
      didScrollDuringPointerRef.current = false
      if (shouldSettle && window.matchMedia("(min-width: 901px)").matches) {
        scheduleSettle()
      }
    }

    const handleNewWheelInput = (event: WheelEvent) => {
      const hadProgrammaticTarget = programmaticTargetRef.current !== null
      programmaticTargetRef.current = null
      if (hadProgrammaticTarget) {
        const cancellationOffset = Math.sign(event.deltaY || event.deltaX) || 1
        root.scrollTo({
          top: root.scrollTop + cancellationOffset,
          behavior: "instant",
        })
      }
      clearSettleTimer()
    }

    const handleScrollEnd = () => {
      clearSettleTimer()
      if (programmaticTargetRef.current) {
        programmaticTargetRef.current = null
        return
      }
      scheduleSettle()
    }

    lastScrollTopRef.current = root.scrollTop
    root.addEventListener("scroll", handleScroll, { passive: true })
    root.addEventListener("scrollend", handleScrollEnd)
    root.addEventListener("pointerdown", handlePointerDown, { passive: true })
    root.addEventListener("wheel", handleNewWheelInput, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    window.addEventListener("pointercancel", handlePointerUp, { passive: true })

    return () => {
      clearSettleTimer()
      root.removeEventListener("scroll", handleScroll)
      root.removeEventListener("scrollend", handleScrollEnd)
      root.removeEventListener("pointerdown", handlePointerDown)
      root.removeEventListener("wheel", handleNewWheelInput)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [setLearningPosition])

  useEffect(() => {
    const syncFromHash = () => {
      const position = hashToPosition(window.location.hash)
      if (!position) return
      setLearningPosition(position, {
        source: "hash",
        scroll: true,
        history: "none",
      })
    }

    const frame = window.requestAnimationFrame(() => {
      const initialPosition = hashToPosition(window.location.hash)
      if (initialPosition) syncFromHash()
      else window.history.replaceState(null, "", `#${chapters[0].id}`)
    })
    window.addEventListener("hashchange", syncFromHash)
    window.addEventListener("popstate", syncFromHash)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("hashchange", syncFromHash)
      window.removeEventListener("popstate", syncFromHash)
    }
  }, [setLearningPosition])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      interactiveTarget(event.target) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return

    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault()
      moveByStep(1, "keyboard")
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault()
      moveByStep(-1, "keyboard")
    } else if (event.key === "Home") {
      event.preventDefault()
      setLearningPosition({ chapterIndex: 0, stepIndex: 0 }, {
        source: "keyboard",
        scroll: true,
        history: "push",
      })
    } else if (event.key === "End") {
      event.preventDefault()
      setLearningPosition(
        {
          chapterIndex: chapters.length - 1,
          stepIndex: chapters.at(-1)!.steps.length - 1,
        },
        { source: "keyboard", scroll: true, history: "push" },
      )
    }
  }

  const selectCheckpointAnswer = (answer: string) => {
    setCheckpointAnswer(answer)
    if (answer === checkpointOptions[0] && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }

  const flatIndex = positionToFlatIndex({ chapterIndex, stepIndex })
  const progress = totalSteps === 1 ? 1 : flatIndex / (totalSteps - 1)
  const currentChapter = chapters[chapterIndex]
  const currentStep = currentChapter.steps[stepIndex]
  const rootStyle = { "--can-story-progress": progress } as CSSProperties

  const visualStepForChapter = (visualChapterIndex: number) =>
    visualChapterIndex === chapterIndex
      ? stepIndex
      : visualChapterIndex < chapterIndex
        ? chapters[visualChapterIndex].steps.length - 1
        : 0

  const renderVisual = (visualChapterIndex: number) => {
    const visualStep = visualStepForChapter(visualChapterIndex)

    if (visualChapterIndex === 0) return <WhyCanVisual step={visualStep} />
    if (visualChapterIndex === 1) {
      return (
        <SignalVisual
          step={visualStep}
          onStepChange={(nextStep) =>
            setLearningPosition({ chapterIndex: 1, stepIndex: nextStep }, {
              source: "button",
              scroll: true,
              history: "replace",
            })
          }
        />
      )
    }
    if (visualChapterIndex === 2) return <ArbitrationVisual step={visualStep} />
    if (visualChapterIndex === 3) {
      return (
        <FrameVisual
          step={visualStep}
          onStepChange={(nextStep) =>
            setLearningPosition({ chapterIndex: 3, stepIndex: nextStep }, {
              source: "button",
              scroll: true,
              history: "replace",
            })
          }
        />
      )
    }
    return (
      <AckErrorVisual
        step={visualStep}
        checkpointAnswer={checkpointAnswer}
        reducedMotion={prefersReducedMotion}
      />
    )
  }

  return (
    <div
      ref={rootRef}
      className={`can-story${
        prefersReducedMotion ? " can-story--reduced-motion" : ""
      }`}
      style={rootStyle}
      role="region"
      aria-label="CAN 기초 인터랙티브 학습"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="can-story__shell">
        <nav className="can-story__rail" aria-label="CAN 기초 챕터">
          <div className="can-story__rail-heading">
            <strong>
              {String(chapterIndex + 1).padStart(2, "0")} /{" "}
              {String(chapters.length).padStart(2, "0")}
            </strong>
            <span>CAN 기초</span>
          </div>
          <div className="can-story__rail-track">
            <i aria-hidden="true" />
            {chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                className={index === chapterIndex ? "is-active" : ""}
                aria-current={index === chapterIndex ? "step" : undefined}
                aria-label={`${index + 1}장 ${chapter.title}`}
                onClick={() =>
                  setLearningPosition({ chapterIndex: index, stepIndex: 0 }, {
                    source: "rail",
                    scroll: true,
                    history: "push",
                  })
                }
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{chapter.title}</small>
              </button>
            ))}
          </div>
        </nav>

        <div className="can-story__chapters">
          {chapters.map((chapter, currentChapterIndex) => (
            <section
              key={chapter.id}
              id={chapter.id}
              className="can-story__chapter"
              data-active={currentChapterIndex === chapterIndex}
              aria-labelledby={`${chapter.id}-title`}
            >
              <div className="can-story__narrative">
                {chapter.steps.map((step, currentStepIndex) => {
                  const active =
                    currentChapterIndex === chapterIndex &&
                    currentStepIndex === stepIndex
                  return (
                    <article
                      key={step.title}
                      ref={(node) => {
                        stepRefs.current[currentChapterIndex] ??= []
                        stepRefs.current[currentChapterIndex][
                          currentStepIndex
                        ] = node
                      }}
                      className="can-story__step"
                      data-chapter-index={currentChapterIndex}
                      data-step-index={currentStepIndex}
                      data-active={active}
                      aria-current={active ? "step" : undefined}
                    >
                      <div>
                        {currentStepIndex === 0 && (
                          <header className="can-story__chapter-heading">
                            {currentChapterIndex === 0 ? (
                              <h1 id={`${chapter.id}-title`}>
                                CAN은 어떻게 흐르는가
                              </h1>
                            ) : (
                              <h2 id={`${chapter.id}-title`}>
                                {chapter.title}
                              </h2>
                            )}
                            <p>{chapter.koreanTitle}</p>
                          </header>
                        )}
                        <span
                          className="can-story__step-number"
                          aria-hidden="true"
                        >
                          {String(currentStepIndex + 1).padStart(2, "0")}
                        </span>
                        <h3>{step.title}</h3>
                        <p>{step.body}</p>

                        {currentChapterIndex === 0 &&
                          currentStepIndex === 2 && (
                            <blockquote>
                              여러 장치가 하나의 버스를 공유한다
                            </blockquote>
                          )}

                        {currentChapterIndex === 1 && (
                          <dl className="can-story__signal-facts">
                            <div>
                              <dt>Dominant 0</dt>
                              <dd>3.5V / 1.5V</dd>
                            </div>
                            <div>
                              <dt>Recessive 1</dt>
                              <dd>2.5V / 2.5V</dd>
                            </div>
                          </dl>
                        )}

                        {currentChapterIndex === 2 &&
                          currentStepIndex === 2 && (
                            <p className="can-story__conclusion">
                              0x120은 가장 먼저 Dominant 0을 유지했기 때문에
                              승리합니다.
                            </p>
                          )}

                        {chapter.id === "ack-error-practice" &&
                          currentStepIndex === 2 && (
                            <fieldset className="can-story__checkpoint">
                              <legend>
                                세 노드가 동시에 전송할 때 어떤 identifier가
                                승리합니까?
                              </legend>
                              <div>
                                {checkpointOptions.map((option) => {
                                  const selected = checkpointAnswer === option
                                  const correct =
                                    selected && option === checkpointOptions[0]
                                  const wrong =
                                    selected && option !== checkpointOptions[0]
                                  return (
                                    <label
                                      key={option}
                                      className={`${
                                        selected ? "is-selected" : ""
                                      }${correct ? " is-correct" : ""}${
                                        wrong ? " is-wrong" : ""
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="can-arbitration-checkpoint"
                                        value={option}
                                        checked={selected}
                                        onChange={() =>
                                          selectCheckpointAnswer(option)
                                        }
                                      />
                                      <span>{option}</span>
                                      {correct && (
                                        <Check
                                          size={18}
                                          weight="bold"
                                          aria-label="정답"
                                        />
                                      )}
                                      {wrong && (
                                        <X
                                          size={18}
                                          weight="bold"
                                          aria-label="오답"
                                        />
                                      )}
                                    </label>
                                  )
                                })}
                              </div>
                              {checkpointAnswer && (
                                <div
                                  className={`can-story__checkpoint-result${
                                    checkpointAnswer === checkpointOptions[0]
                                      ? " is-correct"
                                      : " is-wrong"
                                  }`}
                                  role="status"
                                  aria-live="polite"
                                >
                                  {checkpointAnswer === checkpointOptions[0]
                                    ? "정답입니다. 0x120이 비교 과정에서 가장 먼저 Dominant 0을 유지합니다."
                                    : "다시 확인해 보세요. identifier 값이 낮을수록 더 이른 위치에서 Dominant 0을 보냅니다."}
                                </div>
                              )}
                              {checkpointAnswer === checkpointOptions[0] && (
                                <button
                                  type="button"
                                  className="can-story__continue"
                                  onClick={onContinue}
                                >
                                  CAN 프레임 심화로 이동
                                  <ArrowRight size={17} aria-hidden="true" />
                                </button>
                              )}
                            </fieldset>
                          )}
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="can-story__stage-column">
                <figure className="can-story__stage">
                  <figcaption>
                    <span>
                      <small>
                        {String(currentChapterIndex + 1).padStart(2, "0")}
                      </small>
                      <strong>{chapter.title}</strong>
                    </span>
                    <em>{chapter.koreanTitle}</em>
                  </figcaption>
                  <div className="can-story__stage-visual">
                    {renderVisual(currentChapterIndex)}
                  </div>
                  <div className="can-story__stage-controls">
                    <button
                      type="button"
                      aria-label="이전 학습 단계"
                      disabled={flatIndex === 0}
                      onClick={() => moveByStep(-1, "button")}
                    >
                      <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <span>
                      Step {visualStepForChapter(currentChapterIndex) + 1} /{" "}
                      {chapter.steps.length}
                    </span>
                    <button
                      type="button"
                      aria-label="다음 학습 단계"
                      disabled={flatIndex === totalSteps - 1}
                      onClick={() => moveByStep(1, "button")}
                    >
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                </figure>
              </div>
            </section>
          ))}
        </div>
      </div>

      <div
        className="can-story__announcer"
        aria-live="polite"
        aria-atomic="true"
      >
        {currentChapter.title}, {currentStep.title}
      </div>
    </div>
  )
}
