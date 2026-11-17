import { useState } from "react"
import RealLabTerminal from "@/features/terminal/RealLabTerminal"
import { idsConsoleTabs } from "./IdsBottomTabs"
import IdsLabFrame from "./IdsLabFrame"
import IpsBlockingTimeline, { shouldBlock, type IpsFrame, type IpsRule } from "./IpsBlockingTimeline"
import IpsPacketAnalysis from "./IpsPacketAnalysis"

const REPLAY_FRAMES: IpsFrame[] = [
  { id: "r1", time: 0, canId: "0x456", data: "010A", counter: 10, kind: "normal", ids: "PASS" },
  { id: "r2", time: 100, canId: "0x456", data: "010B", counter: 11, kind: "normal", ids: "PASS" },
  { id: "r3", time: 200, canId: "0x456", data: "010C", counter: 12, kind: "normal", ids: "PASS" },
  { id: "r4", time: 300, canId: "0x456", data: "010D", counter: 13, kind: "normal", ids: "PASS" },
  { id: "replay", time: 400, canId: "0x456", data: "010B", counter: 11, kind: "attack", ids: "REPLAY" },
]
const PERIOD_FRAMES: IpsFrame[] = [
  { id: "p1", time: 0, canId: "0x101", data: "01", kind: "normal", ids: "PASS" },
  { id: "p2", time: 100, canId: "0x101", data: "01", kind: "normal", ids: "PASS" },
  { id: "period", time: 150, canId: "0x101", data: "00", kind: "attack", ids: "PERIOD" },
  { id: "p3", time: 200, canId: "0x101", data: "01", kind: "normal", ids: "PASS" },
  { id: "p4", time: 300, canId: "0x101", data: "01", kind: "normal", ids: "PASS" },
]
const QUIZ_ANSWERS = [
  { id: "scope", text: "공격 Frame뿐 아니라 정상 Frame까지 차단되어 정상 기능도 중단된다" },
  { id: "attack", text: "공격 Frame을 아예 차단하지 못한다" },
  { id: "ids", text: "IDS 탐지 기능이 꺼진다" },
  { id: "period", text: "정상 Frame의 전송 주기가 느려진다" },
]
type Phase = "s1" | "s2" | "quiz" | "complete"

function shuffle<T>(items: T[]) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }

export default function IpsBlockingPage() {
  const [phase, setPhase] = useState<Phase>("s1")
  const [started, setStarted] = useState(false)
  const [activeRule, setActiveRule] = useState<IpsRule>("none")
  const [selectedRule, setSelectedRule] = useState<Exclude<IpsRule, "none">>("counter")
  const [popoverFrame, setPopoverFrame] = useState<IpsFrame | null>(null)
  const [ruleResult, setRuleResult] = useState<"correct" | "incorrect" | null>(null)
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null)
  const [quizFeedback, setQuizFeedback] = useState("")
  const [answers, setAnswers] = useState(QUIZ_ANSWERS)
  const [monitorCleared, setMonitorCleared] = useState(false)
  const [logCleared, setLogCleared] = useState(false)
  const [terminalClearSignal, setTerminalClearSignal] = useState(0)
  const [analysisCleared, setAnalysisCleared] = useState(false)
  const [dashboardRevision, setDashboardRevision] = useState(0)
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const scenarioFrames = phase === "s1" ? REPLAY_FRAMES : PERIOD_FRAMES
  const frames = started ? scenarioFrames : []
  const attack = scenarioFrames.find((frame) => frame.kind === "attack")!
  const normalDelivered = frames.filter((frame) => frame.kind === "normal" && !shouldBlock(frame, activeRule)).length
  const attackDelivered = started && !shouldBlock(attack, activeRule) ? 1 : 0
  const success = normalDelivered === 4 && attackDelivered === 0
  const phaseIndex = phase === "s1" ? 0 : phase === "s2" ? 1 : 2
  const message = normalDelivered < 4 ? "정상 통신까지 과도하게 차단되었습니다." : success ? "공격 차단 성공" : "공격이 ECU에 전달되었습니다"
  const messageColor = normalDelivered < 4 ? "#b45309" : success ? "#166534" : "#991b1b"
  const resetRule = () => { setActiveRule("none"); setPopoverFrame(null); setRuleResult(null); setMonitorCleared(false); setLogCleared(false); setAnalysisCleared(false); setSelectedFrameId(null); setDashboardRevision((value) => value + 1) }
  const selectFrame = (frame: IpsFrame) => { setSelectedFrameId(frame.id); setSelectionRevision((value) => value + 1); setAnalysisCleared(false) }
  const start = () => { setStarted(true); setPhase("s1"); resetRule(); setQuizAnswer(null); setQuizFeedback(""); setAnswers(shuffle(QUIZ_ANSWERS)) }
  const applyRule = () => { setActiveRule(selectedRule); setRuleResult(selectedRule === (attack.ids === "REPLAY" ? "counter" : "period") ? "correct" : "incorrect"); setMonitorCleared(false); setLogCleared(false) }
  const goS2 = () => { setPhase("s2"); resetRule() }
  const entries = frames.map((frame, index) => ({ frame, no: index + 1, action: shouldBlock(frame, activeRule) ? "BLOCKED" : "ALLOWED" }))
  const idsLog = attack.ids === "REPLAY" ? "Replay detected: expected counter 14, received 11." : "Period anomaly: expected 100 ms, observed 50 ms."
  const mission = phase === "s1" ? "탐지된 공격 Frame에 IPS 규칙을 적용해 공격만 차단하세요. 정상 통신은 유지되어야 합니다." : phase === "s2" ? "이번 탐지 이유에 맞는 IPS 규칙으로 공격 Frame만 차단하세요." : "CAN ID 전체 차단 규칙의 문제점으로 옳은 것을 고르세요."

  const normalTone = normalDelivered < 4 ? "danger" : "ok"
  return <IdsLabFrame
    ariaLabel="IPS blocking practice"
    kicker="IDS / IPS 실습 · STEP 4"
    title="IPS 차단"
    status={[
      { label: "정상 전달", value: `${normalDelivered} / 4`, tone: started ? normalTone : undefined },
      { label: "공격 전달", value: `${attackDelivered} / 1`, tone: started ? (attackDelivered ? "danger" : "ok") : undefined },
    ]}
    started={started}
    onStart={start}
    main={<>
      <section className="lab-v2__panel">
        <IpsBlockingTimeline frames={frames} activeRule={activeRule} selectedFrameId={selectedFrameId} onSelectFrame={selectFrame} onOpenFrame={(frame) => { if (frame) setPopoverFrame(frame) }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><button type="button" className="lab-v2__button" onClick={resetRule}>규칙 초기화</button></div>
      </section>
      <section className="lab-v2__panel" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><strong>정상 Frame ECU 전달 {normalDelivered} / 4</strong>{started && <p style={{ color: normalDelivered < 4 ? "#b45309" : "var(--text-secondary)" }}>{normalDelivered < 4 ? "정상 통신까지 과도하게 차단되었습니다." : "정상 통신이 유지됩니다."}</p>}</div>
        <div><strong>공격 Frame ECU 전달 {attackDelivered} / 1</strong>{started && <p style={{ color: messageColor }}>{message}</p>}</div>
      </section>
      {popoverFrame && <section className="lab-v2__panel" aria-label="IPS 규칙 선택 문제">
        <header><h2>문제</h2></header>
        <p><strong>{popoverFrame.ids === "REPLAY" ? "Replay detected: expected counter 14, received 11" : "Period anomaly: expected 100 ms, observed 50 ms"}</strong></p>
        <p>이 공격에 적용할 IPS 규칙을 선택하세요.</p>
        <div role="radiogroup" aria-label="IPS 규칙" style={{ display: "grid", gap: 8, margin: "12px 0" }}>
          {([
            ["id", `CAN ID ${popoverFrame.canId} 전체 차단`],
            ["counter", "Counter 검증 위반 프레임 차단"],
            ["period", "주기 검증 위반 프레임 차단"],
          ] as const).map(([rule, label]) => {
            const result = selectedRule === rule ? ruleResult : null
            return <label key={rule} style={{ display: "flex", gap: 8, cursor: ruleResult === "correct" ? "default" : "pointer", fontSize: 13, padding: "10px 14px", borderRadius: 8, border: `1px solid ${result === "correct" ? "var(--state-success)" : result === "incorrect" ? "var(--state-danger)" : "var(--border-default)"}`, backgroundColor: result === "correct" ? "var(--state-success-bg)" : result === "incorrect" ? "var(--state-danger-bg)" : "var(--background-primary)" }}><input type="radio" name="ips-rule" checked={selectedRule === rule} disabled={ruleResult === "correct"} onChange={() => { setSelectedRule(rule); setRuleResult(null) }} />{label}</label>
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" className="lab-v2__button is-primary" disabled={ruleResult === "correct"} onClick={applyRule}>적용</button>
          {ruleResult === "correct" && <button type="button" className="lab-v2__button is-primary" onClick={() => phase === "s1" ? goS2() : (setPopoverFrame(null), setRuleResult(null), setPhase("quiz"))}>다음 단계로 넘어가기</button>}
        </div>
        {ruleResult === "incorrect" && <p role="status" style={{ color: "var(--state-danger)" }}>오답입니다. 정상 통신은 유지하면서 탐지된 공격을 차단할 수 있는 규칙을 다시 선택하세요.</p>}
        {ruleResult === "correct" && <p role="status" style={{ color: "var(--state-success)" }}>정답입니다. 정상 통신은 유지하고 공격 프레임을 차단했습니다.</p>}
      </section>}
      {phase === "quiz" && <section className="lab-v2__panel">
        <header><h2>문제</h2></header><p>{mission}</p>
        <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
          {answers.map((answer) => {
            const result = quizFeedback && quizAnswer === answer.id ? (answer.id === "scope" ? "correct" : "incorrect") : null
            return <label key={answer.id} style={{ display: "flex", gap: 8, cursor: "pointer", fontSize: 13, padding: "10px 14px", borderRadius: 8, border: `1px solid ${result === "correct" ? "var(--state-success)" : result === "incorrect" ? "var(--state-danger)" : "var(--border-default)"}`, backgroundColor: result === "correct" ? "var(--state-success-bg)" : result === "incorrect" ? "var(--state-danger-bg)" : "var(--background-primary)" }}><input type="radio" name="ips-quiz" checked={quizAnswer === answer.id} onChange={() => { setQuizAnswer(answer.id); setQuizFeedback("") }} />{answer.text}</label>
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" className="lab-v2__button is-primary" disabled={!quizAnswer} onClick={() => setQuizFeedback(quizAnswer === "scope" ? "정답입니다. 차단 범위가 넓을수록 정상 통신까지 막을 수 있어 과잉 차단입니다." : "다시 생각해 보세요. ID 전체 차단 시 정상 Frame도 몇 개가 전달되는지 확인하세요.")}>제출</button>
          {quizFeedback && quizAnswer === "scope" && <button type="button" className="lab-v2__button" onClick={() => setPhase("complete")}>완료</button>}
        </div>
        {quizFeedback && <p role="status" style={{ color: quizAnswer === "scope" ? "var(--state-success)" : "var(--state-danger)" }}>{quizFeedback}</p>}
      </section>}
      {phase === "complete" && <section className="lab-v2__panel"><div className="lab-v2__result"><b>실습 완료</b><p>IDS는 이상을 탐지하고 알려주는 역할을 하고, IPS는 탐지된 프레임을 실제로 차단하는 역할입니다.</p><p>IPS는 탐지 이유에 맞는 규칙을 써야 하며, 차단 범위가 넓으면 정상 통신까지 막힐 수 있습니다.</p></div></section>}
    </>}
    analysis={<IpsPacketAnalysis key={dashboardRevision} frames={analysisCleared ? [] : frames} rule={activeRule} selectedFrameId={selectedFrameId} selectionRevision={selectionRevision} onShowAll={() => setSelectedFrameId(null)} onClear={() => { setAnalysisCleared(true); setSelectedFrameId(null) }} />}
    guide={{
      progressLabel: "STEP 4 : IPS 차단",
      progress: phase === "complete" ? 100 : phaseIndex * 50,
      steps: ["시나리오 1", "시나리오 2", "문제"],
      currentStep: phaseIndex,
      mission,
      hint: "타임라인에서 탐지된 공격 Frame(빨간 ×)을 클릭해 IPS 규칙을 적용하세요. 실제 차량에서는 IDS/IPS 파이프라인이 탐지·판정 로직을 선행합니다. 이 화면은 교육용 시뮬레이션입니다.",
    }}
    tabs={idsConsoleTabs({
      status: "고정 시나리오 결과",
      onClear: (tab) => {
        if (tab === "terminal") setTerminalClearSignal((value) => value + 1)
        else if (tab === "monitor") setMonitorCleared(true)
        else setLogCleared(true)
      },
      terminal: <RealLabTerminal labId="ids-ips-blocking" clearSignal={terminalClearSignal} reconnectSignal={0} />,
      monitor: <table className="lab-v2__table"><thead><tr><th>NO</th><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th><th>처리</th></tr></thead><tbody>{!monitorCleared && entries.map(({ frame, no, action }) => <tr key={frame.id}><td>{no}</td><td>{(frame.time / 1000).toFixed(2)}</td><td>{frame.canId}</td><td>{frame.data}</td><td>{frame.ids}</td><td style={{ color: action === "BLOCKED" ? "#991b1b" : "#166534" }}>{action}</td></tr>)}</tbody></table>,
      idsLog: <div className="lab-v2__log">{started && !logCleared && <><p><b>[ALERT]</b> {idsLog}</p><p><b>[{attackDelivered ? "ALLOWED" : "BLOCKED"}]</b> {attackDelivered ? "Frame delivered to ECU." : activeRule === "id" ? `CAN ID ${attack.canId} is blocked by rule.` : "Frame dropped before reaching ECU."}</p></>}</div>,
    })}
  />
}
