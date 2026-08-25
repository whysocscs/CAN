export interface AttackLabLearningCheckProps {
  predictionDraft: string
  predictionBeforeAction: string
  explanation: string
  technicalComplete: boolean
  evidenceSelected: boolean
  confirmed: boolean
  onPredictionChange: (value: string) => void
  onExplanationChange: (value: string) => void
  onConfirm: () => void
}

export default function AttackLabLearningCheck({
  predictionDraft,
  predictionBeforeAction,
  explanation,
  technicalComplete,
  evidenceSelected,
  confirmed,
  onPredictionChange,
  onExplanationChange,
  onConfirm,
}: AttackLabLearningCheckProps) {
  const canConfirm = Boolean(
    technicalComplete
      && predictionBeforeAction.trim()
      && evidenceSelected
      && explanation.trim().length >= 20,
  )

  return (
    <section className="attack-lab-learning-check" aria-labelledby="attack-lab-learning-check-title">
      <header>
        <h2 id="attack-lab-learning-check-title">Learning Check</h2>
        <span>자동 채점 아님</span>
      </header>
      <label>
        실행 전 예상
        <textarea
          value={predictionDraft}
          onChange={(event) => onPredictionChange(event.target.value)}
        />
      </label>
      <p>
        <strong>실행 시 기록된 예상</strong>
        <span>{predictionBeforeAction || "아직 기록되지 않음"}</span>
      </p>
      <label>
        선택한 근거와 결과 비교
        <textarea
          value={explanation}
          onChange={(event) => onExplanationChange(event.target.value)}
        />
      </label>
      <dl>
        <div>
          <dt>공격 조건 충족</dt>
          <dd>{technicalComplete ? "달성" : "미달성"}</dd>
        </div>
        <div>
          <dt>학습 확인 완료</dt>
          <dd>{confirmed ? "완료" : "미완료"}</dd>
        </div>
      </dl>
      <button type="button" disabled={!canConfirm} onClick={onConfirm}>
        학습 확인
      </button>
    </section>
  )
}
