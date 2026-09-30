import { useState } from "react"
import { Badge } from "@fluentui/react-components"
import { Play } from "@phosphor-icons/react"
import IpsBlockingTabs from "./IpsBlockingTabs"
import IpsBlockingTimeline, { type IpsFrame, type IpsRule } from "./IpsBlockingTimeline"

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

function blocks(frame: IpsFrame, rule: IpsRule) { return rule === "id" || (rule === "counter" && frame.ids === "REPLAY") || (rule === "period" && frame.ids === "PERIOD") }
function shuffle<T>(items: T[]) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }

export default function IpsBlockingPage() {
  const [phase, setPhase] = useState<Phase>("s1")
  const [started, setStarted] = useState(false)
  const [activeRule, setActiveRule] = useState<IpsRule>("none")
  const [selectedRule, setSelectedRule] = useState<Exclude<IpsRule, "none">>("counter")
  const [popoverFrame, setPopoverFrame] = useState<IpsFrame | null>(null)
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null)
  const [quizFeedback, setQuizFeedback] = useState("")
  const [answers, setAnswers] = useState(QUIZ_ANSWERS)
  const [monitorCleared, setMonitorCleared] = useState(false)
  const [logCleared, setLogCleared] = useState(false)
  const scenarioFrames = phase === "s2" ? PERIOD_FRAMES : REPLAY_FRAMES
  const frames = started ? scenarioFrames : []
  const attack = scenarioFrames.find((frame) => frame.kind === "attack")!
  const normalDelivered = frames.filter((frame) => frame.kind === "normal" && !blocks(frame, activeRule)).length
  const attackDelivered = blocks(attack, activeRule) ? 0 : 1
  const success = normalDelivered === 4 && attackDelivered === 0
  const phaseIndex = phase === "s1" ? 0 : phase === "s2" ? 1 : 2
  const message = normalDelivered < 4 ? "정상 통신까지 과도하게 차단되었습니다." : success ? "공격 차단 성공" : "공격이 ECU에 전달되었습니다"
  const messageColor = normalDelivered < 4 ? "#b45309" : success ? "#166534" : "#991b1b"
  const resetRule = () => { setActiveRule("none"); setPopoverFrame(null); setMonitorCleared(false); setLogCleared(false) }
  const start = () => { setStarted(true); setPhase("s1"); resetRule(); setQuizAnswer(null); setQuizFeedback(""); setAnswers(shuffle(QUIZ_ANSWERS)) }
  const applyRule = () => { setActiveRule(selectedRule); setPopoverFrame(null); setMonitorCleared(false); setLogCleared(false) }
  const goS2 = () => { setPhase("s2"); resetRule() }
  const entries = frames.map((frame, index) => ({ frame, no: index + 1, action: blocks(frame, activeRule) ? "BLOCKED" : "ALLOWED" }))
  const idsLog = attack.ids === "REPLAY" ? "Replay detected: expected counter 14, received 11." : "Period anomaly: expected 100 ms, observed 50 ms."
  const mission = phase === "s1" ? "탐지된 공격 Frame에 IPS 규칙을 적용해 공격만 차단하세요. 정상 통신은 유지되어야 합니다." : phase === "s2" ? "이번 탐지 이유에 맞는 IPS 규칙으로 공격 Frame만 차단하세요." : "CAN ID 전체 차단 규칙의 문제점으로 옳은 것을 고르세요."

  return <main className="canlab canlab--embedded" aria-label="IPS blocking practice"><section className="canlab__shell" style={{ padding: 24 }}><div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 310px", gap: 18 }}><section>
    <IpsBlockingTimeline frames={frames} activeRule={activeRule} popoverFrame={popoverFrame} selectedRule={selectedRule} onOpenFrame={setPopoverFrame} onSelectRule={setSelectedRule} onApply={applyRule} />
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}><button type="button" onClick={resetRule}>규칙 초기화</button></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}><section className="canlab__status-box"><strong>정상 Frame ECU 전달 {normalDelivered} / 4</strong><p style={{ color: normalDelivered < 4 ? "#b45309" : "var(--text-secondary)" }}>{normalDelivered < 4 ? "정상 통신까지 과도하게 차단되었습니다." : "정상 통신이 유지됩니다."}</p></section><section className="canlab__status-box"><strong>공격 Frame ECU 전달 {attackDelivered} / 1</strong><p style={{ color: messageColor }}>{message}</p></section></div>
    {phase === "quiz" && <section className="canlab__status-box" style={{ marginBottom: 12 }}><strong>{mission}</strong><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{answers.map((answer) => <label key={answer.id} style={{ display: "flex", gap: 8, cursor: "pointer" }}><input type="radio" name="ips-quiz" checked={quizAnswer === answer.id} onChange={() => setQuizAnswer(answer.id)} />{answer.text}</label>)}</div><button type="button" className="is-primary" style={{ marginTop: 12, background: "#c92a22", borderColor: "#c92a22" }} disabled={!quizAnswer} onClick={() => setQuizFeedback(quizAnswer === "scope" ? "정답입니다. 차단 범위가 넓을수록 정상 통신까지 막을 수 있어 과잉 차단입니다." : "다시 생각해 보세요. ID 전체 차단 시 정상 Frame도 몇 개가 전달되는지 확인하세요.")}>제출</button>{quizFeedback && <p>{quizFeedback}</p>}{quizAnswer === "scope" && <button type="button" onClick={() => setPhase("complete")}>완료</button>}</section>}
    {phase === "complete" && <section className="canlab__status-box" style={{ marginBottom: 12 }}><strong>실습 완료</strong><p>IDS는 이상을 탐지하고 알려주는 역할을 하고, IPS는 탐지된 프레임을 실제로 차단하는 역할입니다.</p><p>IPS는 탐지 이유에 맞는 규칙을 써야 하며, 차단 범위가 넓으면 정상 통신까지 막힐 수 있습니다.</p></section>}
    <IpsBlockingTabs onClear={(tab) => tab === "monitor" ? setMonitorCleared(true) : setLogCleared(true)} monitor={<div className="canlab__data-pane"><table><thead><tr><th>NO</th><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th><th>처리</th></tr></thead><tbody>{!monitorCleared && entries.map(({ frame, no, action }) => <tr key={frame.id}><td>{no}</td><td>{(frame.time / 1000).toFixed(2)}</td><td>{frame.canId}</td><td>{frame.data}</td><td>{frame.ids}</td><td style={{ color: action === "BLOCKED" ? "#991b1b" : "#166534" }}>{action}</td></tr>)}</tbody></table></div>} idsLog={<div className="canlab__data-pane">{started && !logCleared && <><p><b>[ALERT]</b> {idsLog}</p><p><b>[{attackDelivered ? "ALLOWED" : "BLOCKED"}]</b> {attackDelivered ? "Frame delivered to ECU." : activeRule === "id" ? `CAN ID ${attack.canId} is blocked by rule.` : "Frame dropped before reaching ECU."}</p></>}</div>} />
  </section><aside className="canlab__guide" aria-label="IPS 차단 안내"><div className="canlab__guide-body" style={{ display: "block" }}><div className="canlab__guide-progress"><span>STEP 4 : IPS 차단</span><b>{phase === "complete" ? "100%" : `${phaseIndex * 50}%`}</b><i><em style={{ width: `${phase === "complete" ? 100 : phaseIndex * 50}%` }} /></i></div><section className="canlab__steps"><h2>진행 단계</h2>{["시나리오 1", "시나리오 2", "문제"].map((label, index) => <article key={label} className={phaseIndex === index ? "is-current" : ""}><div><p>{index + 1}. {label}</p></div></article>)}</section><section className="canlab__status-box"><h2>현재 미션</h2><p>{mission}</p>{phase === "s1" && success && <button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={goS2}>시나리오 2로</button>}{phase === "s2" && success && <button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={() => setPhase("quiz")}>문제 풀기</button>}</section><section className="canlab__hint"><h2>안내</h2><p>타임라인에서 탐지된 공격 Frame(빨간 ×)을 클릭해 IPS 규칙을 적용하세요.</p><p>실제 차량에서는 IDS/IPS 파이프라인이 탐지·판정 로직을 선행합니다. 이 화면은 교육용 시뮬레이션입니다.</p></section><div className="door-attack-lab__editor-actions" style={{ marginTop: 16 }}><button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={start}><Play size={15} weight="fill" aria-hidden="true" />{started ? "다시 시작" : "시작"}</button></div></div></aside></div></section></main>
}
