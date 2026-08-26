import type { AttackLabExplanationRow } from "./attackLabFeedback"

export interface AttackLabLearningCheckProps {
  predictionDraft: string
  predictionBeforeAction: string
  explanation: string
  technicalComplete: boolean
  reviewReady?: boolean
  evidenceSelected: boolean
  confirmed: boolean
  expectationPrompt?: string
  principleQuestion?: string
  actualRows?: readonly AttackLabExplanationRow[]
  onPredictionChange: (value: string) => void
  onExplanationChange: (value: string) => void
  onConfirm: () => void
}

export default function AttackLabLearningCheck({
  predictionDraft,
  predictionBeforeAction,
  explanation,
  technicalComplete,
  reviewReady = false,
  evidenceSelected,
  confirmed,
  expectationPrompt = "실행 전에 예상 Terminal 형태, 중단 장치, ECU·IDS 판정과 차량 효과를 기록하세요.",
  principleQuestion = "선택한 evidence를 근거로 예상과 실제 결과의 차이를 설명하세요.",
  actualRows = [],
  onPredictionChange,
  onExplanationChange,
  onConfirm,
}: AttackLabLearningCheckProps) {
  const canConfirm = Boolean(
    reviewReady &&
      predictionBeforeAction.trim() &&
      evidenceSelected &&
      explanation.trim().length >= 20,
  )

  return (
    <section
      className="attack-lab-learning-check"
      aria-labelledby="attack-lab-learning-check-title"
    >
      <header>
        <h2 id="attack-lab-learning-check-title">Learning Check</h2>
        <span>자동 채점 아님</span>
      </header>
      <p className="attack-lab-learning-check__prompt">{expectationPrompt}</p>
      <label>
        실행 전 예상
        <textarea
          value={predictionDraft}
          onChange={(event) => onPredictionChange(event.target.value)}
        />
      </label>
      <div className="attack-lab-learning-check__comparison">
        <article>
          <h3>Expected · 실행 전</h3>
          <strong>실행 시 기록된 예상</strong>
          <p>{predictionBeforeAction || "아직 기록되지 않음"}</p>
        </article>
        <article>
          <h3>Actual · 관찰 결과</h3>
          {actualRows.length ? (
            <dl
              className="attack-lab-learning-check__actual-list"
              role="region"
              aria-label="Actual 프레임별 관찰 결과"
              tabIndex={0}
            >
              {actualRows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>
                    <span>{row.value}</span>
                    <small>{row.source}</small>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>아직 구조화된 관찰 결과가 없습니다.</p>
          )}
        </article>
      </div>
      <label className="attack-lab-learning-check__principle">
        <span>원리 확인 질문 · 자동 의미 채점 아님</span>
        <strong>{principleQuestion}</strong>
        <textarea
          aria-label="선택한 근거와 결과 비교"
          value={explanation}
          onChange={(event) => onExplanationChange(event.target.value)}
        />
      </label>
      {!reviewReady ? (
        <p className="attack-lab-learning-check__waiting">
          실행 결과 재생이 완료되면 선택한 evidence와 실제 결과를 비교해 답할 수
          있습니다.
        </p>
      ) : null}
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
