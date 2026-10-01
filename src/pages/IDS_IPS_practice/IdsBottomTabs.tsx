import type { ReactNode } from "react"
import type { LabTab } from "@/features/lab-layout/LabTabs"
import { IDS_TAB_ICONS, IdsConsolePane } from "./IdsLabFrame"

export type IdsConsoleTabId = "terminal" | "monitor" | "idsLog"

interface IdsConsoleTabsOptions {
  terminal?: ReactNode
  monitor: ReactNode
  idsLog: ReactNode
  onClear: (tab: IdsConsoleTabId) => void
  status?: string
}

/**
 * IDS 실습 오른쪽 콘솔 탭(Terminal / CAN Monitor / IDS Log).
 *
 * LabTabs가 모든 패널을 마운트한 채로 두므로 Terminal → IDS Log → Terminal로
 * 돌아와도 터미널 기록이 그대로 남는다. 실습을 바꾸면 페이지가 언마운트되며 초기화된다.
 */
export function idsConsoleTabs({
  terminal,
  monitor,
  idsLog,
  onClear,
  status = "CAN 이벤트 스트림 연결됨",
}: IdsConsoleTabsOptions): LabTab<IdsConsoleTabId>[] {
  const tabs: LabTab<IdsConsoleTabId>[] = []
  if (terminal) {
    tabs.push({
      id: "terminal",
      label: "Terminal",
      icon: IDS_TAB_ICONS.terminal,
      content: (
        <IdsConsolePane title="Terminal" status={`${status} · Tab 자동완성`} onClear={() => onClear("terminal")}>
          {terminal}
        </IdsConsolePane>
      ),
    })
  }
  tabs.push(
    {
      id: "monitor",
      label: "CAN Monitor",
      icon: IDS_TAB_ICONS.monitor,
      content: (
        <IdsConsolePane title="CAN Monitor" status={status} onClear={() => onClear("monitor")}>
          {monitor}
        </IdsConsolePane>
      ),
    },
    {
      id: "idsLog",
      label: "IDS Log",
      icon: IDS_TAB_ICONS.idsLog,
      content: (
        <IdsConsolePane title="IDS Log" status={status} onClear={() => onClear("idsLog")}>
          {idsLog}
        </IdsConsolePane>
      ),
    },
  )
  return tabs
}
