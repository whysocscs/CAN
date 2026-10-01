import { useId, useState, type ReactNode } from "react"
import {
  ATTACK_LAB_LEARNING,
  type AttackLabLearningScenario,
  type AttackLabStageGuidance,
} from "./attackLabLearning"

export type AttackLabGuidanceMode = "guided" | "challenge"

export interface AttackLabGuidancePanelProps {
  scenario: AttackLabLearningScenario
  stageIndex: number
  mode?: AttackLabGuidanceMode
  defaultMode?: AttackLabGuidanceMode
  disabled?: boolean
  onModeChange?: (mode: AttackLabGuidanceMode) => void
}

const CHALLENGE_DECISIONS =
  "실행할 명령 또는 입력, 관찰할 증거, 성공·실패 판단 기준을 스스로 정하세요."

function currentStageIndex(
  scenario: AttackLabLearningScenario,
  stageIndex: number,
): number {
  const stages = ATTACK_LAB_LEARNING[scenario].stages
  const normalizedIndex = Number.isFinite(stageIndex)
    ? Math.trunc(stageIndex)
    : 0
  return Math.max(0, Math.min(normalizedIndex, stages.length - 1))
}

// 실습 중에 매번 필요한 건 "지금 할 일" 하나다. 나머지 근거 정보는 접어 두고 필요할 때 연다.
function MoreDetails({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}) {
  return (
    <details className="attack-lab-guidance__more">
      <summary>{summary}</summary>
      <dl>{children}</dl>
    </details>
  )
}

function GuidedContent({ stage }: { stage: AttackLabStageGuidance }) {
  return (
    <>
      <dl>
        <div data-field="action">
          <dt>지금 할 일</dt>
          <dd>{stage.action}</dd>
        </div>
      </dl>
      <MoreDetails summary="목적 · 증거 · 완료 기준">
        <div data-field="purpose">
          <dt>단계 목적</dt>
          <dd>{stage.purpose}</dd>
        </div>
        <div data-field="evidence">
          <dt>확인할 증거</dt>
          <dd>{stage.evidence}</dd>
        </div>
        <div data-field="completion">
          <dt>완료 기준</dt>
          <dd>{stage.completion}</dd>
        </div>
      </MoreDetails>
    </>
  )
}

function ChallengeContent({ stage }: { stage: AttackLabStageGuidance }) {
  return (
    <>
      <dl>
        <div data-field="action">
          <dt>스스로 정할 항목</dt>
          <dd>{CHALLENGE_DECISIONS}</dd>
        </div>
      </dl>
      <MoreDetails summary="단계 목적">
        <div data-field="purpose">
          <dt>단계 목적</dt>
          <dd>{stage.purpose}</dd>
        </div>
      </MoreDetails>
    </>
  )
}

export default function AttackLabGuidancePanel({
  scenario,
  stageIndex,
  mode: controlledMode,
  defaultMode = "guided",
  disabled = false,
  onModeChange,
}: AttackLabGuidancePanelProps) {
  const [localMode, setLocalMode] = useState<AttackLabGuidanceMode>(defaultMode)
  const mode = controlledMode ?? localMode
  const titleId = useId()
  const radioName = useId()
  const stages = ATTACK_LAB_LEARNING[scenario].stages
  const index = currentStageIndex(scenario, stageIndex)
  const stage = stages[index]
  const changeMode = (nextMode: AttackLabGuidanceMode) => {
    if (controlledMode === undefined) setLocalMode(nextMode)
    onModeChange?.(nextMode)
  }

  return (
    <section
      className="attack-lab-guidance"
      aria-labelledby={titleId}
      data-guidance-mode={mode}
    >
      <header>
        <div>
          <span>
            <span className="sr-only">단계 </span>
            {index + 1}/{stages.length}
          </span>
          <h2 id={titleId}>{stage.label}</h2>
        </div>
        <fieldset disabled={disabled}>
          <legend className="sr-only">학습 안내 모드</legend>
          <label title="멈춰서 한 단계씩 확인">
            <input
              type="radio"
              name={radioName}
              value="guided"
              checked={mode === "guided"}
              onChange={() => changeMode("guided")}
            />
            <span>초보자용<span className="sr-only"> · Guided</span></span>
          </label>
          <label title="스스로 계획하고 자동 재생">
            <input
              type="radio"
              name={radioName}
              value="challenge"
              checked={mode === "challenge"}
              onChange={() => changeMode("challenge")}
            />
            <span>실습자용<span className="sr-only"> · Challenge</span></span>
          </label>
        </fieldset>
      </header>
      <span className="sr-only">현재 학습 단계: {stage.label}</span>
      <div role="region" aria-label="현재 단계 안내">
        {mode === "guided" ? (
          <GuidedContent stage={stage} />
        ) : (
          <ChallengeContent stage={stage} />
        )}
      </div>
    </section>
  )
}
