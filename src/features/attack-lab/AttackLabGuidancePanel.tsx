import { useId, useState } from "react"
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

function currentStage(
  scenario: AttackLabLearningScenario,
  stageIndex: number,
): AttackLabStageGuidance {
  const stages = ATTACK_LAB_LEARNING[scenario].stages
  const normalizedIndex = Number.isFinite(stageIndex)
    ? Math.trunc(stageIndex)
    : 0
  return stages[Math.max(0, Math.min(normalizedIndex, stages.length - 1))]
}

function GuidedContent({ stage }: { stage: AttackLabStageGuidance }) {
  return (
    <dl>
      <div>
        <dt>단계 목적</dt>
        <dd>{stage.purpose}</dd>
      </div>
      <div>
        <dt>지금 할 일</dt>
        <dd>{stage.action}</dd>
      </div>
      <div>
        <dt>확인할 증거</dt>
        <dd>{stage.evidence}</dd>
      </div>
      <div>
        <dt>완료 기준</dt>
        <dd>{stage.completion}</dd>
      </div>
    </dl>
  )
}

function ChallengeContent({ stage }: { stage: AttackLabStageGuidance }) {
  return (
    <dl>
      <div>
        <dt>단계 목적</dt>
        <dd>{stage.purpose}</dd>
      </div>
      <div>
        <dt>스스로 정할 항목</dt>
        <dd>{CHALLENGE_DECISIONS}</dd>
      </div>
    </dl>
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
  const stage = currentStage(scenario, stageIndex)
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
        <span>Current stage</span>
        <h2 id={titleId}>{stage.label}</h2>
      </header>
      <span className="sr-only">현재 학습 단계: {stage.label}</span>

      <fieldset disabled={disabled}>
        <legend>학습 안내 모드</legend>
        <label>
          <input
            type="radio"
            name={radioName}
            value="guided"
            checked={mode === "guided"}
            onChange={() => changeMode("guided")}
          />
          초보자용 (Guided) — 멈춰서 한 단계씩 확인
        </label>
        <label>
          <input
            type="radio"
            name={radioName}
            value="challenge"
            checked={mode === "challenge"}
            onChange={() => changeMode("challenge")}
          />
          실습자용 (Challenge) — 스스로 계획하고 자동 재생
        </label>
      </fieldset>

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
