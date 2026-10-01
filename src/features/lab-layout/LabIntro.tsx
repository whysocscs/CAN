import { Fragment, type ReactNode } from "react"
import { CaretRight } from "@phosphor-icons/react"
import "./labV2.css"

export interface LabIntroFact {
  label: string
  value: ReactNode
}

export interface LabIntroContent {
  kicker: string
  title: string
  description: ReactNode
  flowLabel?: string
  flow: readonly string[]
  flowNote?: ReactNode
  objectives: readonly ReactNode[]
  facts?: readonly LabIntroFact[]
  /** 진행 단계, 안전 범위처럼 시작 전에 알아야 하는 추가 정보. */
  notes?: ReactNode
}

interface LabIntroProps extends LabIntroContent {
  startLabel?: string
  onStart: () => void
}

/**
 * CAN 실습 VERSION 2 · INTRODUCTION 화면을 모든 실습이 같은 모양으로 쓰도록 분리했다.
 * 내용만 실습별로 넘기고, 배치와 스타일은 여기에서만 정한다.
 */
export default function LabIntro({
  kicker,
  title,
  description,
  flowLabel = "MESSAGE FLOW",
  flow,
  flowNote,
  objectives,
  facts,
  notes,
  startLabel = "실습 시작",
  onStart,
}: LabIntroProps) {
  return (
    <section className="lab-intro" aria-labelledby="lab-intro-title">
      <div className="lab-intro__header">
        <span className="lab-intro__kicker">{kicker}</span>
        <h1 id="lab-intro-title">{title}</h1>
        <p>{description}</p>
      </div>

      {facts?.length ? (
        <dl className="lab-intro__facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="lab-intro__grid">
        <section className="lab-intro__card" aria-label={flowLabel}>
          <span className="lab-intro__label">{flowLabel}</span>
          <div className="lab-intro__flow">
            {flow.map((node, index) => (
              <Fragment key={`${node}-${index}`}>
                {index > 0 ? <CaretRight size={16} aria-hidden="true" /> : null}
                <strong>{node}</strong>
              </Fragment>
            ))}
          </div>
          {flowNote ? <p>{flowNote}</p> : null}
        </section>

        <section className="lab-intro__card" aria-labelledby="lab-intro-objectives">
          <span className="lab-intro__label">LEARNING OBJECTIVES</span>
          <h2 id="lab-intro-objectives">이번 실습에서 확인할 것</h2>
          <ol>
            {objectives.map((objective, index) => (
              <li key={index}>{objective}</li>
            ))}
          </ol>
        </section>
      </div>

      {notes ? <div className="lab-intro__notes">{notes}</div> : null}

      <footer className="lab-intro__footer">
        <button className="lab-intro__start" type="button" onClick={onStart}>
          {startLabel} <CaretRight size={16} weight="bold" aria-hidden="true" />
        </button>
      </footer>
    </section>
  )
}
