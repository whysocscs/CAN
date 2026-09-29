import { Suspense, useEffect, useState } from "react"
import { Badge, Button } from "@fluentui/react-components"
import { Html } from "@react-three/drei"
import { Play } from "@phosphor-icons/react"
import CanCommandTerminal from "@/features/can/practice/CanCommandTerminal"
import { CAN_COMMAND_CATALOG } from "@/features/can/events/catalog"
import { vehicle, useVehicleRig } from "@/features/vehicle"
import { SharedVehicleCanvas, SharedVehicleOverviewController, SharedVehicleOrbitControls, SharedVehicleScene, useSharedVehicleClone } from "@/features/vehicle/SharedVehicleScene"
import VehicleOwner, { type OwnerReaction } from "./VehicleOwner"
import IdsBottomTabs from "./IdsBottomTabs"

const WHITELIST = ["0x101", "0x200", "0x201"] as const
const REAR_ID = CAN_COMMAND_CATALOG.TRUNK_OPEN.frame.canId
const TRUNK_CLOSE_DATA = "01"
const START_CAMERA_VIEW = { position: [-6.74, 5.5, -6.74] as const, target: [0, 0, 0] as const }
type Verdict = "IDLE" | "ALERT" | "PASS" | "EXECUTED"
type Attempt = { id: number; time: string; canId: string; data: string; verdict: Verdict; reason: string }

function VehicleRig() { const scene = useSharedVehicleClone(); useVehicleRig(scene, { immediate: false }); return null }

// Same cansend grammar used by the existing CAN terminal pages.
function parseCansend(command: string) {
  const match = command.trim().match(/^cansend\s+vcan0\s+([0-9a-f]{1,3})#([0-9a-f]{2,16})$/i)
  if (!match) return null
  return { canId: `0x${match[1].padStart(3, "0").toLowerCase()}`, data: match[2].toUpperCase() }
}

export default function RuleBasedIDSPage() {
  const [practiceStarted, setPracticeStarted] = useState(false)
  const [trunkState, setTrunkState] = useState<"open" | "closed">("open")
  const [successfulCloses, setSuccessfulCloses] = useState(0)
  const [ownerReaction, setOwnerReaction] = useState<OwnerReaction>("idle")
  const [idsVerdict, setIdsVerdict] = useState<Verdict>("IDLE")
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [clearSignal, setClearSignal] = useState(0)
  const [viewRevision, setViewRevision] = useState(0)
  const [monitorClearedAt, setMonitorClearedAt] = useState(0)
  const [idsLogClearedAt, setIdsLogClearedAt] = useState(0)
  const complete = successfulCloses === 3

  useEffect(() => () => vehicle.set("tailgate", 0), [])
  const start = () => { vehicle.set("tailgate", 1); setPracticeStarted(true); setTrunkState("open"); setSuccessfulCloses(0); setOwnerReaction("idle"); setIdsVerdict("IDLE"); setAttempts([]); setClearSignal((n) => n + 1); setViewRevision((n) => n + 1); setMonitorClearedAt(0); setIdsLogClearedAt(0) }
  const record = (canId: string, data: string, verdict: Verdict, reason: string) => setAttempts((old) => [...old, { id: Date.now(), time: new Date().toLocaleTimeString(), canId, data, verdict, reason }])
  const command = async (input: string) => {
    if (!practiceStarted) return ["[error] 먼저 [시작] 버튼을 누르세요."]
    if (input.trim() === "cat whitelist.yaml") return ["Allowed CAN IDs", "", "0x101 : DOOR", "0x200 : TRUNK", "0x201 : DASHBOARD"]
    const frame = parseCansend(input)
    if (!frame) return ["[error] cansend vcan0 <CAN_ID>#<DATA> 또는 cat whitelist.yaml을 입력하세요."]
    if (!WHITELIST.includes(frame.canId as typeof WHITELIST[number])) { setIdsVerdict("ALERT"); record(frame.canId, frame.data, "ALERT", `CAN ID ${frame.canId} is not in whitelist.`); return [`\x1b[31m[ALERT] CAN ID ${frame.canId} is not in whitelist.\x1b[0m`] }
    if (frame.canId !== REAR_ID || frame.data !== TRUNK_CLOSE_DATA) { setIdsVerdict("PASS"); record(frame.canId, frame.data, "PASS", `CAN ID ${frame.canId} is allowed.`); return [`[PASS] CAN ID ${frame.canId} is allowed.`] }
    if (trunkState === "closed") { record(frame.canId, frame.data, "PASS", "처리 중: 차주가 트렁크를 다시 열고 있습니다."); return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[info] 처리 중: 차주가 트렁크를 다시 열고 있습니다."] }
    const next = successfulCloses + 1
    setIdsVerdict("EXECUTED"); setTrunkState("closed"); vehicle.set("tailgate", 0); setSuccessfulCloses(next); setOwnerReaction(next === 3 ? "angry" : next === 2 ? "confused-2" : "confused-1")
    record(frame.canId, frame.data, "EXECUTED", "TRUNK_CLOSE")
    if (next < 3) window.setTimeout(() => { setTrunkState("open"); vehicle.set("tailgate", 1) }, 1500)
    return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[EXECUTED] TRUNK_CLOSE"]
  }
  return <main className="canlab canlab--embedded" aria-label="Rule-based IDS practice"><section className="canlab__shell" style={{ padding: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h1 style={{ margin: 0 }}>IDS / IPS 실습</h1><Badge appearance="filled" color="brand">STEP 1 : ID White List</Badge></div></div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 310px", gap: 18, marginTop: 18 }}><section>
      <div style={{ height: 430, position: "relative", overflow: "hidden", borderRadius: 12, border: "1px solid var(--border-default)" }}><SharedVehicleCanvas background="#d1d5db" fog={false}><Suspense fallback={null}><SharedVehicleScene xray={false} fixedCamera={practiceStarted}><SharedVehicleOverviewController resetRevision={viewRevision} cameraView={practiceStarted ? START_CAMERA_VIEW : undefined} /><VehicleRig />{practiceStarted && <VehicleOwner position={[-1, -0.4109, -3.59]} rotation={[0, 0, 0]} scale={1.1} ownerReaction={ownerReaction} />}{idsVerdict === "ALERT" && <Html center><div style={{ width: 310, padding: 18, textAlign: "center", border: "3px solid #dc2626", borderRadius: 12, background: "#fff", color: "#991b1b" }}><h2>⚠ IDS ALERT</h2><b>Unknown CAN ID</b><p>{attempts.at(-1)?.reason}</p><Button onClick={() => setIdsVerdict("IDLE")}>다시 시도</Button></div></Html>}</SharedVehicleScene></Suspense><SharedVehicleOrbitControls makeDefault enableDamping /></SharedVehicleCanvas><div className="door-attack-lab__editor-actions" style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}><button type="button" className="is-primary" onClick={start} style={{ background: "#c92a22", borderColor: "#c92a22" }}><Play size={15} weight="fill" aria-hidden="true" />{practiceStarted ? "다시 시작" : "시작"}</button></div><span style={{ position: "absolute", left: 12, bottom: 12, padding: "7px 10px", background: "#0f172acc", color: "white", borderRadius: 7 }}>TRUNK: {trunkState.toUpperCase()} · OWNER: {ownerReaction.toUpperCase()}</span></div>
      {complete && <div className="canlab__status-box" style={{ marginTop: 12 }}><b>차주를 화나게 하는 데 성공했습니다.</b><p>허용된 CAN ID를 사용했기 때문에 공격 Frame도 ID 화이트리스트 검사를 통과했습니다.</p><p>화이트리스트는 허용되지 않은 ID를 막는 데 효과적이지만, 정상 ID를 악용하는 공격까지 구분할 수는 없습니다.</p></div>}
      <div style={{ marginTop: 12 }}><IdsBottomTabs onClear={(tab) => { if (tab === "terminal") setClearSignal((value) => value + 1); if (tab === "monitor") setMonitorClearedAt(Date.now()); if (tab === "idsLog") setIdsLogClearedAt(Date.now()) }} terminal={<CanCommandTerminal clearSignal={clearSignal} onCommand={command} />} monitor={<div className="canlab__data-pane"><table><thead><tr><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th></tr></thead><tbody>{attempts.filter((a) => a.id > monitorClearedAt).map((a) => <tr key={a.id}><td>{a.time}</td><td>{a.canId}</td><td>{a.data}</td><td>{a.verdict === "ALERT" ? "ALERT" : "PASS"}</td></tr>)}</tbody></table></div>} idsLog={<div className="canlab__data-pane">{[...attempts].filter((a) => a.id > idsLogClearedAt).reverse().map((a) => <p key={a.id}><b>[{a.verdict}]</b> {a.reason}</p>)}</div>} /></div>
    </section><aside className="canlab__guide" aria-label="IDS 실습 안내"><div className="canlab__guide-body" style={{ display: "block" }}><div className="canlab__guide-progress"><span>STEP 1 : ID White List</span><b>{Math.round((successfulCloses / 3) * 100)}%</b><i><em style={{ width: `${(successfulCloses / 3) * 100}%` }} /></i></div><section className="canlab__steps"><h2>현재 미션</h2><article className="is-current"><div><p>트렁크를 3번 닫아 차주를 화나게 하세요.</p></div></article></section><section className="canlab__status-box"><h2>성공</h2><strong style={{ fontSize: 28 }}>{successfulCloses} / 3</strong><p>{[0, 1, 2].map((n) => n < successfulCloses ? "●" : "○").join("")}</p></section><section className="canlab__status-box"><h2>IDS 판정</h2><Badge color={idsVerdict === "ALERT" ? "danger" : idsVerdict === "PASS" || idsVerdict === "EXECUTED" ? "success" : "informative"} appearance="filled">{idsVerdict === "IDLE" ? "대기" : idsVerdict === "ALERT" ? "ALERT" : "PASS"}</Badge><p>CAN ID가 화이트리스트에 없으면 차단합니다.</p></section><section className="canlab__hint"><h2>힌트</h2><p>해당 차량의 Rear ECU ID는 무엇일까요?</p><p><code>cat whitelist.yaml</code></p></section></div></aside></div>
  </section></main>
}
