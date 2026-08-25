import type { AttackLabTerminalTranscript as TranscriptEntry } from "./attackLabFeedback"

export interface AttackLabTerminalTranscriptProps {
  entries: readonly TranscriptEntry[]
  emptyMessage?: string
}

export default function AttackLabTerminalTranscript({
  entries,
  emptyMessage = "아직 실행한 가상 터미널 명령이 없습니다.",
}: AttackLabTerminalTranscriptProps) {
  return (
    <div
      className="door-attack-lab__terminal-output attack-lab-terminal__scroll"
      role="region"
      aria-label="Virtual terminal transcript"
      tabIndex={0}
    >
      {entries.length === 0 ? <p>{emptyMessage}</p> : null}
      {entries.map((entry, index) => (
        <div
          key={`${index}:${entry.command}`}
          className={`attack-lab-terminal__entry attack-lab-terminal__entry--${entry.stream}`}
          data-stream={entry.stream}
          data-testid="attack-terminal-entry"
        >
          <strong>$ {entry.command}</strong>
          {entry.text ? <pre>{entry.text}</pre> : null}
        </div>
      ))}
    </div>
  )
}
