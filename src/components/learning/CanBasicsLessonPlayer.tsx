import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { ArrowLeft, ArrowRight, Check, X } from "@phosphor-icons/react"
import {
  BusAccessVisual,
  MessageBasedVisual,
  ReliabilityVisual,
  SharedBusVisual,
  WhyCanVisual,
} from "@/components/learning/CanBasicsVisuals"

type TravelDirection = "forward" | "backward"

type WheelGesture = {
  accumulatedDelta: number
  direction: number
  locked: boolean
  releaseTimer: number | null
}

const WHEEL_GESTURE_THRESHOLD = 48
const WHEEL_GESTURE_RELEASE_MS = 180

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

const lessonSteps = chapters.flatMap((chapter, chapterIndex) =>
  chapter.steps.map((step, stepIndex) => ({
    chapter,
    chapterIndex,
    step,
    stepIndex,
  })),
)

function chapterStartIndex(chapterIndex: number) {
  return lessonSteps.findIndex((item) => item.chapterIndex === chapterIndex)
}

function hashToIndex(hash: string) {
  const [requestedId, requestedStep] = decodeURIComponent(
    hash.replace(/^#/, ""),
  ).split("/")
  const chapterId = legacyChapterIds[requestedId] ?? requestedId
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId)
  if (chapterIndex < 0) return null

  const chapterStart = chapterStartIndex(chapterIndex)
  const parsedStep = Number.parseInt(requestedStep ?? "1", 10)
  const stepIndex = Number.isNaN(parsedStep)
    ? 0
    : Math.max(
        0,
        Math.min(parsedStep - 1, chapters[chapterIndex].steps.length - 1),
      )
  return chapterStart + stepIndex
}

function indexToHash(index: number) {
  const item = lessonSteps[index]
  return `#${item.chapter.id}/${item.stepIndex + 1}`
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

export default function CanBasicsLessonPlayer({
  onComplete,
  onContinue,
}: {
  onComplete: () => void
  onContinue: () => void
}) {
  const initialIndex =
    typeof window === "undefined" ? 0 : (hashToIndex(window.location.hash) ?? 0)
  const activeIndexRef = useRef(initialIndex)
  const completedRef = useRef(false)
  const wheelGestureRef = useRef<WheelGesture>({
    accumulatedDelta: 0,
    direction: 0,
    locked: false,
    releaseTimer: null,
  })
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [direction, setDirection] = useState<TravelDirection>("forward")
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [checkpointAnswer, setCheckpointAnswer] = useState<string | null>(null)

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
    (requestedIndex: number, history: "push" | "replace" | "none" = "push") => {
      const nextIndex = Math.max(
        0,
        Math.min(requestedIndex, lessonSteps.length - 1),
      )
      const currentIndex = activeIndexRef.current
      if (nextIndex === currentIndex) return

      setDirection(nextIndex > currentIndex ? "forward" : "backward")
      activeIndexRef.current = nextIndex
      setActiveIndex(nextIndex)

      if (history === "none") return
      const nextHash = indexToHash(nextIndex)
      if (window.location.hash === nextHash) return
      const method = history === "push" ? "pushState" : "replaceState"
      window.history[method](null, "", nextHash)
    },
    [],
  )

  useEffect(() => {
    const syncFromHistory = () => {
      const nextIndex = hashToIndex(window.location.hash)
      if (nextIndex !== null) moveTo(nextIndex, "none")
    }
    window.addEventListener("hashchange", syncFromHistory)
    window.addEventListener("popstate", syncFromHistory)
    return () => {
      window.removeEventListener("hashchange", syncFromHistory)
      window.removeEventListener("popstate", syncFromHistory)
    }
  }, [moveTo])

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
      moveTo(lessonSteps.length - 1)
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    event.preventDefault()

    const deltaScale =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? window.innerHeight
          : 1
    const delta = event.deltaY * deltaScale
    const direction = Math.sign(delta)
    const gesture = wheelGestureRef.current

    if (gesture.direction !== direction) {
      gesture.accumulatedDelta = 0
      gesture.direction = direction
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
    moveTo(activeIndexRef.current + direction)
  }

  const selectCheckpointAnswer = (answer: string) => {
    setCheckpointAnswer(answer)
    if (answer === correctCheckpointAnswer && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }

  const current = lessonSteps[activeIndex]
  const isFinalStep = activeIndex === lessonSteps.length - 1
  const progress = ((activeIndex + 1) / lessonSteps.length) * 100

  const renderVisual = () => {
    if (current.chapterIndex === 0)
      return <WhyCanVisual step={current.stepIndex} />
    if (current.chapterIndex === 1)
      return <SharedBusVisual step={current.stepIndex} />
    if (current.chapterIndex === 2)
      return <MessageBasedVisual step={current.stepIndex} />
    if (current.chapterIndex === 3)
      return <BusAccessVisual step={current.stepIndex} />
    return (
      <ReliabilityVisual
        step={current.stepIndex}
        checkpointAnswer={checkpointAnswer}
        reducedMotion={prefersReducedMotion}
      />
    )
  }

  return (
    <div
      className={`can-lesson-player${
        prefersReducedMotion ? " can-lesson-player--reduced-motion" : ""
      }`}
      data-direction={direction}
      role="region"
      aria-label="CAN 기초 한 화면 학습"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    >
      <header className="can-lesson-player__header">
        <div className="can-lesson-player__header-copy">
          <span>CAN 기초</span>
          <strong>{current.chapter.title}</strong>
        </div>

        <nav
          className="can-lesson-player__chapters"
          aria-label="CAN 기초 챕터 진행 상황"
        >
          <ol>
            {chapters.map((chapter, index) => (
              <li
                key={chapter.id}
                className={index === current.chapterIndex ? "is-active" : ""}
                aria-current={
                  index === current.chapterIndex ? "step" : undefined
                }
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{chapter.title}</small>
              </li>
            ))}
          </ol>
        </nav>

        <div className="can-lesson-player__count" aria-live="polite">
          <strong>{String(activeIndex + 1).padStart(2, "0")}</strong>
          <span>/ {String(lessonSteps.length).padStart(2, "0")}</span>
        </div>

        <div className="can-lesson-player__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="can-lesson-player__viewport">
        <section
          className="can-lesson-player__slide"
          aria-labelledby="can-lesson-title"
        >
          <article
            key={`copy-${activeIndex}`}
            className="can-lesson-player__copy"
          >
            <div className="can-lesson-player__eyebrow">
              <span>
                Chapter {String(current.chapterIndex + 1).padStart(2, "0")}
              </span>
              <strong>{current.chapter.koreanTitle}</strong>
            </div>
            <span className="can-lesson-player__step-label">
              Concept {String(current.stepIndex + 1).padStart(2, "0")}
            </span>
            <h1 id="can-lesson-title">{current.step.title}</h1>
            <p>{current.step.body}</p>

            {current.chapterIndex === 2 && current.stepIndex === 1 && (
              <blockquote>CAN ID는 목적지 주소가 아닙니다</blockquote>
            )}

            {current.chapterIndex === 3 && current.stepIndex === 1 && (
              <dl className="can-lesson-player__signal-facts">
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

            {current.chapterIndex === 3 && current.stepIndex === 2 && (
              <p className="can-lesson-player__note">
                11-bit Standard Data Frame에서는 더 낮은 Identifier 값이 높은
                중재 우선순위를 갖습니다.
              </p>
            )}

            {isFinalStep && (
              <fieldset className="can-lesson-player__checkpoint">
                <legend>
                  CAN 통신의 특징으로 가장 적절한 것은 무엇입니까?
                </legend>
                <div>
                  {checkpointOptions.map((option) => {
                    const selected = checkpointAnswer === option
                    const correct =
                      selected && option === correctCheckpointAnswer
                    const wrong = selected && option !== correctCheckpointAnswer
                    return (
                      <label
                        key={option}
                        className={`${selected ? "is-selected" : ""}${
                          correct ? " is-correct" : ""
                        }${wrong ? " is-wrong" : ""}`}
                      >
                        <input
                          type="radio"
                          name="can-protocol-player-checkpoint"
                          value={option}
                          checked={selected}
                          onChange={() => selectCheckpointAnswer(option)}
                        />
                        <span>{option}</span>
                        {correct && (
                          <Check size={17} weight="bold" aria-label="정답" />
                        )}
                        {wrong && (
                          <X size={17} weight="bold" aria-label="오답" />
                        )}
                      </label>
                    )
                  })}
                </div>
                {checkpointAnswer && (
                  <p
                    className={`can-lesson-player__result${
                      checkpointAnswer === correctCheckpointAnswer
                        ? " is-correct"
                        : " is-wrong"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {checkpointAnswer === correctCheckpointAnswer
                      ? "정답입니다. 공용 Bus와 CAN ID를 사용하는 Multi-Master 통신입니다."
                      : "다시 확인해 보세요. CAN은 중앙 Master나 목적지 주소에 의존하지 않습니다."}
                  </p>
                )}
                {checkpointAnswer === correctCheckpointAnswer && (
                  <button
                    type="button"
                    className="can-lesson-player__continue"
                    onClick={onContinue}
                  >
                    CAN 프레임 심화로 이동
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
              </fieldset>
            )}
          </article>

          <figure
            key={`visual-${activeIndex}`}
            className="can-lesson-player__visual"
          >
            <figcaption>
              <span>
                <small>
                  {String(current.chapterIndex + 1).padStart(2, "0")}
                </small>
                <strong>{current.chapter.title}</strong>
              </span>
              <em>{current.chapter.koreanTitle}</em>
            </figcaption>
            <div className="can-lesson-player__visual-canvas">
              {renderVisual()}
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
          <strong>{current.chapter.title}</strong>
          <span>
            {current.stepIndex + 1} / {current.chapter.steps.length}
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
        {current.chapter.title}, {current.step.title}
      </div>
    </div>
  )
}
