import { useId, useState, type ComponentType, type ReactNode } from "react"
import "./labV2.css"

export interface LabTab<T extends string> {
  id: T
  label: string
  icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>
  /** 탭 이름 옆에 붙는 짧은 상태값(예: 프레임 수). */
  badge?: ReactNode
  content: ReactNode
}

interface LabTabsProps<T extends string> {
  label: string
  tabs: readonly LabTab<T>[]
  active?: T
  defaultActive?: T
  onChange?: (id: T) => void
  className?: string
}

/**
 * 실습 화면 오른쪽 패널의 탭.
 *
 * 모든 패널을 항상 마운트하고 보이지 않는 패널만 CSS로 숨긴다. 탭을 오가도
 * 터미널(xterm 인스턴스, 입력 중인 명령, 출력 기록)이 사라지지 않게 하기 위해서다.
 */
export default function LabTabs<T extends string>({
  label,
  tabs,
  active: controlledActive,
  defaultActive,
  onChange,
  className,
}: LabTabsProps<T>) {
  const baseId = useId()
  const [localActive, setLocalActive] = useState<T>(defaultActive ?? tabs[0].id)
  const active = controlledActive ?? localActive

  const select = (id: T) => {
    if (controlledActive === undefined) setLocalActive(id)
    onChange?.(id)
  }

  return (
    <section className={["lab-tabs", className].filter(Boolean).join(" ")} aria-label={label}>
      <div className="lab-tabs__list" role="tablist" aria-label={label}>
        {tabs.map(({ id, label: tabLabel, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-controls={`${baseId}-panel-${id}`}
            aria-selected={active === id}
            className={active === id ? "is-active" : undefined}
            onClick={() => select(id)}
          >
            {Icon ? <Icon size={15} aria-hidden="true" /> : null}
            {tabLabel}
            {badge !== undefined ? <small>{badge}</small> : null}
          </button>
        ))}
      </div>
      {tabs.map(({ id, content }) => (
        <div
          key={id}
          role="tabpanel"
          id={`${baseId}-panel-${id}`}
          aria-labelledby={`${baseId}-tab-${id}`}
          className="lab-tabs__panel"
          data-active={active === id ? "true" : "false"}
        >
          {content}
        </div>
      ))}
    </section>
  )
}
