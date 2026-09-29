import { useState, type ReactNode } from "react"
import { ClipboardText, Monitor, TerminalWindow } from "@phosphor-icons/react"

type TabId = "terminal" | "monitor" | "idsLog"

interface IdsBottomTabsProps {
  terminal: ReactNode
  monitor: ReactNode
  idsLog: ReactNode
  onClear: (tab: TabId) => void
}

const tabs: Array<{ id: TabId; label: string; icon: typeof TerminalWindow }> = [
  { id: "terminal", label: "Terminal", icon: TerminalWindow },
  { id: "monitor", label: "CAN Monitor", icon: Monitor },
  { id: "idsLog", label: "IDS Log", icon: ClipboardText },
]

/** IDS variant of the normal CAN practice console panel. */
export default function IdsBottomTabs({ terminal, monitor, idsLog, onClear }: IdsBottomTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("terminal")
  const content = activeTab === "terminal" ? terminal : activeTab === "monitor" ? monitor : idsLog
  return <section className="canlab__console" aria-label="IDS 실습 콘솔" style={{ minHeight: 310 }}>
    <div className="canlab__tabs" role="tablist" aria-label="IDS 실습 결과 보기">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? "is-active" : ""} onClick={() => setActiveTab(id)}><Icon size={15} /> {label}</button>)}
    </div>
    <div className="canlab__terminal-pane" role="tabpanel" style={{ minHeight: 258, maxHeight: 258, overflow: "auto" }}>
      <div className="canlab__console-toolbar"><strong>{tabs.find((tab) => tab.id === activeTab)?.label}</strong><span className="canlab__terminal-status is-connected"><i /> CAN 이벤트 스트림 연결됨</span><button type="button" onClick={() => onClear(activeTab)}>화면 비우기</button></div>
      {content}
    </div>
  </section>
}
