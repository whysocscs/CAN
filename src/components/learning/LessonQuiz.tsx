import type { ReactNode } from "react"
import { ArrowRight, Check, X } from "@phosphor-icons/react"

interface LessonQuizProps {
  question: string
  options: string[]
  correctIndex: number
  selectedIndex: number | null
  submitted: boolean
  onSelect: (index: number) => void
  onSubmit: () => void
  onRetry: () => void
  successAction?: ReactNode
}

export default function LessonQuiz({
  question,
  options,
  correctIndex,
  selectedIndex,
  submitted,
  onSelect,
  onSubmit,
  onRetry,
  successAction,
}: LessonQuizProps) {
  const correct = submitted && selectedIndex === correctIndex

  return (
    <form
      className="lesson-quiz"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <fieldset>
        <legend>{question}</legend>
        <div className="lesson-quiz__options">
          {options.map((option, index) => {
            const selected = selectedIndex === index
            const isCorrect = submitted && index === correctIndex
            const isWrong = submitted && selected && index !== correctIndex
            return (
              <label
                key={option}
                className={`${selected ? "is-selected" : ""}${
                  isCorrect ? " is-correct" : ""
                }${isWrong ? " is-wrong" : ""}`}
              >
                <input
                  type="radio"
                  name="lesson-answer"
                  checked={selected}
                  disabled={submitted}
                  onChange={() => onSelect(index)}
                />
                <span>{option}</span>
                {isCorrect && (
                  <Check size={17} weight="bold" aria-label="정답" />
                )}
                {isWrong && <X size={17} weight="bold" aria-label="오답" />}
              </label>
            )
          })}
        </div>
      </fieldset>

      {submitted && (
        <p
          className={`lesson-quiz__result ${
            correct ? "is-correct" : "is-wrong"
          }`}
          role="status"
        >
          {correct
            ? "정답입니다. 다음 학습으로 이동할 수 있습니다."
            : "정답이 아닙니다. 개념을 다시 확인한 뒤 재시도하세요."}
        </p>
      )}

      <div className="lesson-quiz__actions">
        {!submitted && (
          <button
            type="submit"
            className="route-action route-action--primary"
            disabled={selectedIndex === null}
          >
            답안 확인
          </button>
        )}
        {submitted && !correct && (
          <button
            type="button"
            className="route-action route-action--secondary"
            onClick={onRetry}
          >
            다시 시도
          </button>
        )}
        {correct && successAction}
      </div>
    </form>
  )
}

export function RouteAction({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      className={`route-action ${
        primary ? "route-action--primary" : "route-action--secondary"
      }`}
      onClick={onClick}
    >
      <span>{children}</span>
      {primary && <ArrowRight size={17} aria-hidden="true" />}
    </button>
  )
}
