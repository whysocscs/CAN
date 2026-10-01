import type {
  AttackLabExplanationRow,
  AttackLabFeedbackPresentation,
} from "./attackLabFeedback"

export interface AttackLabFeedbackPanelProps {
  feedback: AttackLabFeedbackPresentation | null
}

function ExplanationRow({ row }: { row: AttackLabExplanationRow }) {
  return (
    <div>
      <dt>{row.label}</dt>
      <dd>
        <span>{row.value}</span>
        <small>{row.source}</small>
      </dd>
    </div>
  )
}

export default function AttackLabFeedbackPanel({
  feedback,
}: AttackLabFeedbackPanelProps) {
  if (!feedback) return null

  const hasEffectRow = feedback.explanationRows.some(
    (row) => row.label === "차량 영향",
  )
  const showNoEffectRow = !hasEffectRow && feedback.flow.outcome !== null

  return (
    <section
      className="attack-lab-feedback"
      aria-labelledby="attack-lab-feedback-title"
    >
      <h2 id="attack-lab-feedback-title">왜 이런 결과가 발생했나요?</h2>
      <dl>
        {feedback.explanationRows.map((row) => (
          <ExplanationRow key={row.key} row={row} />
        ))}
        {showNoEffectRow ? (
          <ExplanationRow
            row={{
              key: "effect-none",
              label: "차량 영향",
              value: "없음",
              source: "교육용 분석",
            }}
          />
        ) : null}
      </dl>
      <p>{feedback.explanation}</p>
    </section>
  )
}
