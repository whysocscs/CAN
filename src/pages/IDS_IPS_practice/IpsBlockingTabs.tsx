import { useState, type ReactNode } from "react"
import { ClipboardText, Monitor } from "@phosphor-icons/react"

type TabId = "monitor" | "idsLog"
type Props = { monitor: ReactNode; idsLog: ReactNode; onClear: (tab: TabId) => void }

export default function IpsBlockingTabs({ monitor, idsLog, onClear }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("monitor")
  const tabs = [{ id: "monitor" as const, label: "CAN Monitor", icon: Monitor }, { id: "idsLog" as const, label: "IDS Log", icon: ClipboardText }]
  return <section className="canlab__console" aria-label="IPS monitoring console" style={{ minHeight: 310 }}><div className="canlab__tabs" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}><Icon size={15} /> {label}</button>)}</div><div className="canlab__terminal-pane" role="tabpanel" style={{ minHeight: 258, maxHeight: 258, overflow: "auto" }}><div className="canlab__console-toolbar"><strong>{activeTab === "monitor" ? "CAN Monitor" : "IDS Log"}</strong><span className="canlab__terminal-status is-connected"><i /> 고정 시나리오 결과</span><button type="button" onClick={() => onClear(activeTab)}>화면 비우기</button></div>{activeTab === "monitor" ? monitor : idsLog}</div></section>
}
