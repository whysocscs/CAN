import type { AttackLabActivityEntry } from "./attackLabFeedback"

export interface AttackLabActivityLogProps {
  entries: readonly AttackLabActivityEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function AttackLabActivityLog({
  entries,
  selectedId,
  onSelect,
}: AttackLabActivityLogProps) {
  return (
    <section className="attack-lab-activity" aria-labelledby="attack-lab-activity-title">
      <h2 id="attack-lab-activity-title">Activity</h2>
      <div
        className="attack-lab-activity__scroll"
        role="region"
        aria-label="Activity log"
        tabIndex={0}
      >
        {entries.length === 0 ? <p>아직 구조화된 실행 결과가 없습니다.</p> : null}
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={entry.id === selectedId ? true : undefined}
                onClick={() => onSelect(entry.id)}
              >
                <strong>{entry.resultCode}</strong>
                <span>{entry.commandLabel}</span>
                <small>
                  {entry.frameEmitted ? "가상 CAN 경로 입력 기록됨" : "차량 경로 없음"}
                  {entry.stoppedAt ? ` · ${entry.stoppedAt}` : ""}
                  {entry.effectApplied ? " · 차량 영향 적용" : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
