type LabScriptGuideMode = "door" | "spoofing" | "replay"

const FINAL_ACTION_LABEL: Record<Exclude<LabScriptGuideMode, "door">, string> =
  {
    spoofing: "cansend",
    replay: "canplayer",
  }

export default function LabScriptGuide({ mode }: { mode: LabScriptGuideMode }) {
  if (mode === "door") {
    return (
      <details className="door-attack-lab__script-guide">
        <summary>Script 사용법</summary>
        <ol>
          <li>Terminal에서 로그와 프레임을 먼저 관찰합니다.</li>
          <li>
            실행할 줄 앞의 #을 제거하고 placeholder를 관찰한 값으로 바꿉니다.
          </li>
          <li>
            Door script는 interval_ms=&lt;10..2000&gt;과 순서가 있는 cansend
            줄을 처리합니다.
          </li>
          <li>
            실행 후 Network monitor, Binary inspector, Toy IDS, Proof를
            확인합니다.
          </li>
        </ol>
      </details>
    )
  }

  const finalAction = FINAL_ACTION_LABEL[mode]

  return (
    <details className="door-attack-lab__script-guide">
      <summary>Script 사용법</summary>
      <ol>
        <li>관찰·캡처 명령은 Virtual terminal에서 실행합니다.</li>
        <li>Lab script에는 주석과 최종 {finalAction} action 한 줄만 둡니다.</li>
        <li>
          실행할 action 줄 앞의 #을 제거하고 placeholder를 관찰한 값으로
          바꿉니다.
        </li>
        <li>
          실행 후 Network monitor, Binary inspector, IDS verdict와 Evidence를
          확인합니다.
        </li>
      </ol>
    </details>
  )
}
