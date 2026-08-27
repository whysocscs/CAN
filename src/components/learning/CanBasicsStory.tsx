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
  BusAccessVisual,
  MessageBasedVisual,
  ReliabilityVisual,
  SharedBusVisual,
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
        title: "기능이 늘수록 배선도 빠르게 복잡해집니다",
        body: "ECU 사이에서 신호를 개별 배선으로 주고받으면, 교환해야 할 신호가 늘어날수록 전용 배선과 커넥터도 함께 증가합니다.",
      },
      {
        title: "여러 ECU가 하나의 CAN Bus를 공유합니다",
        body: "CAN에서는 같은 네트워크에 연결된 여러 ECU가 공용 CAN Bus를 함께 사용합니다.",
      },
      {
        title: "하나의 통신망을 여러 ECU가 함께 사용합니다",
        body: "같은 CAN Bus에 연결된 ECU들은 하나의 공용 통신망을 통해 정보를 주고받습니다.",
      },
    ],
  },
  {
    id: "shared-bus",
    title: "Shared Bus",
    koreanTitle: "여러 ECU가 같은 Bus를 사용하는 방법",
    steps: [
      {
        title: "CAN에는 중앙 Master가 필요하지 않습니다",
        body: "같은 Bus에 연결된 ECU들은 매번 중앙 제어기의 허가를 받아 통신하는 구조가 아닙니다. CAN은 여러 노드가 통신에 참여할 수 있는 Multi-Master 방식입니다.",
      },
      {
        title: "Bus가 비어 있으면 ECU가 전송을 시작합니다",
        body: "전송할 정보가 있는 ECU는 Bus가 사용 가능한 상태인지 확인한 뒤 통신을 시작합니다.",
      },
      {
        title: "모든 노드는 같은 Bus 상태를 관찰합니다",
        body: "CAN에 참여하는 노드는 송신 중에도 Bus를 관찰하며, 다른 노드의 통신과 현재 Bus 상태를 함께 확인합니다.",
      },
    ],
  },
  {
    id: "message-based",
    title: "Message-Based",
    koreanTitle: "장치가 아니라 메시지를 식별하는 방식",
    steps: [
      {
        title: "CAN은 특정 ECU 주소로 메시지를 보내지 않습니다",
        body: "CAN에서는 일반적인 1:1 주소 기반 통신처럼 목적지 ECU 주소를 지정해 전송하지 않습니다.",
      },
      {
        title: "CAN ID가 메시지를 구분합니다",
        body: "각 CAN 메시지는 Identifier를 가지며, CAN ID는 어떤 메시지인지 구분하는 데 사용됩니다.",
      },
      {
        title: "각 ECU는 필요한 메시지를 선택합니다",
        body: "같은 Bus의 노드들은 전송되는 메시지를 관찰하고, 자신에게 필요한 CAN ID의 메시지를 선택해 처리합니다.",
      },
    ],
  },
  {
    id: "bus-access",
    title: "Bus Access & Arbitration",
    koreanTitle: "동시에 전송하려 할 때 우선순위를 정하는 방법",
    steps: [
      {
        title: "여러 ECU가 동시에 전송을 시작할 수 있습니다",
        body: "CAN은 Multi-Master 방식이기 때문에 둘 이상의 ECU가 같은 시점에 Bus 사용을 시작할 수 있습니다.",
      },
      {
        title: "CAN은 전송하면서 우선순위를 비교합니다",
        body: "각 송신 노드는 자신이 보내는 값과 실제 Bus 상태를 함께 관찰하면서 중재에 참여합니다.",
      },
      {
        title: "우선순위가 높은 메시지가 전송을 계속합니다",
        body: "중재에서 우선순위가 낮은 노드는 전송을 멈추고, 승리한 메시지를 방해하지 않습니다. Bus가 다시 사용 가능해지면 이후 재시도합니다.",
      },
    ],
  },
  {
    id: "reliability",
    title: "Reliability",
    koreanTitle: "오류를 감지하고 네트워크를 보호하는 방법",
    steps: [
      {
        title: "CAN은 전송 중에도 오류를 검사합니다",
        body: "CAN 노드들은 송수신 과정에서 Bus 상태와 전달된 정보를 확인하며 통신 오류를 감지합니다.",
      },
      {
        title: "오류가 발견되면 잘못된 전송을 무효화합니다",
        body: "오류를 감지한 노드는 현재 전송에 오류가 있음을 알리고, 잘못된 메시지가 정상 데이터로 처리되지 않도록 합니다. 송신 노드는 Bus가 다시 사용 가능해지면 재전송을 시도할 수 있습니다.",
      },
      {
        title: "반복 오류 노드는 통신 참여가 제한됩니다",
        body: "CAN은 각 노드의 오류 상태를 관리하며, 반복적으로 오류를 발생시키는 노드가 전체 Bus 통신을 계속 방해하지 못하도록 단계적으로 참여를 제한합니다.",
      },
    ],
  },
] as const

const checkpointOptions = [
  "모든 메시지는 특정 ECU의 목적지 주소를 포함한다",
  "중앙 Master만 CAN Bus에서 전송할 수 있다",
  "여러 ECU가 공용 Bus를 사용하며 CAN ID로 메시지를 구분한다",
  "오류가 발생하면 항상 Bus 전체가 즉시 종료된다",
] as const
const correctCheckpointAnswer = checkpointOptions[2]

const legacyChapterIds: Record<string, string> = {
  "dominant-recessive": "shared-bus",
  arbitration: "message-based",
  frame: "bus-access",
  "ack-error-practice": "reliability",
}
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
  const requestedId = decodeURIComponent(hash.replace(/^#/, ""))
  const id = legacyChapterIds[requestedId] ?? requestedId
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
    if (answer === correctCheckpointAnswer && !completedRef.current) {
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
    if (visualChapterIndex === 1) return <SharedBusVisual step={visualStep} />
    if (visualChapterIndex === 2) return <MessageBasedVisual step={visualStep} />
    if (visualChapterIndex === 3) return <BusAccessVisual step={visualStep} />
    return (
      <ReliabilityVisual
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

                        {currentChapterIndex === 2 &&
                          currentStepIndex === 1 && (
                            <blockquote>
                              CAN ID는 목적지 주소가 아닙니다
                            </blockquote>
                          )}

                        {currentChapterIndex === 3 &&
                          currentStepIndex === 1 && (
                          <dl className="can-story__signal-facts">
                            <div>
                              <dt>Dominant 0</dt>
                              <dd>Bus에 0이 남음</dd>
                            </div>
                            <div>
                              <dt>Recessive 1</dt>
                              <dd>0과 만나면 양보</dd>
                            </div>
                          </dl>
                        )}

                        {currentChapterIndex === 3 &&
                          currentStepIndex === 2 && (
                            <p className="can-story__conclusion">
                              11-bit Standard Data Frame 예시에서는 더 낮은
                              Identifier 값이 높은 중재 우선순위를 갖습니다.
                            </p>
                          )}

                        {chapter.id === "reliability" &&
                          currentStepIndex === 2 && (
                            <fieldset className="can-story__checkpoint">
                              <legend>
                                CAN 통신의 특징으로 가장 적절한 것은 무엇입니까?
                              </legend>
                              <div>
                                {checkpointOptions.map((option) => {
                                  const selected = checkpointAnswer === option
                                  const correct =
                                    selected && option === correctCheckpointAnswer
                                  const wrong =
                                    selected && option !== correctCheckpointAnswer
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
                                        name="can-protocol-checkpoint"
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
                                    checkpointAnswer === correctCheckpointAnswer
                                      ? " is-correct"
                                      : " is-wrong"
                                  }`}
                                  role="status"
                                  aria-live="polite"
                                >
                                  {checkpointAnswer === correctCheckpointAnswer
                                    ? "정답입니다. CAN은 공용 Bus와 메시지 Identifier를 사용하는 Multi-Master 통신입니다."
                                    : "다시 확인해 보세요. CAN은 중앙 Master나 목적지 주소에 의존하지 않습니다."}
                                </div>
                              )}
                              {checkpointAnswer === correctCheckpointAnswer && (
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
