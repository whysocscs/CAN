import { useState, type ReactNode } from "react"
import { Button } from "@fluentui/react-components"
import {
  BookOpen,
  Books,
  CaretDown,
  ChartLineUp,
  Circuitry,
  Cube,
  Gauge,
  Gear,
  Info,
  List,
  LockSimple,
  Medal,
  Path,
  ShieldCheck,
  Student,
  TerminalWindow,
  UserCircle,
  WarningOctagon,
} from "@phosphor-icons/react"
import { Home20Regular } from "@fluentui/react-icons/svg/home"
import { DataUsage20Regular } from "@fluentui/react-icons/svg/data-usage"
import { BookOpen20Regular } from "@fluentui/react-icons/svg/book-open"
import { Shield20Regular } from "@fluentui/react-icons/svg/shield"
import { Warning20Regular } from "@fluentui/react-icons/svg/warning"
import { Trophy20Regular } from "@fluentui/react-icons/svg/trophy"
import { Person20Regular } from "@fluentui/react-icons/svg/person"
import { Cube20Regular } from "@fluentui/react-icons/svg/cube"
import { Settings20Regular } from "@fluentui/react-icons/svg/settings"
import { Info20Regular } from "@fluentui/react-icons/svg/info"
import { Navigation20Regular } from "@fluentui/react-icons/svg/navigation"
import { LearningApp20Regular } from "@fluentui/react-icons/svg/learning-app"
import { useApp, type Route } from "@/context/AppContext"
import { designMeta, designVersion, previewAccessOpen } from "@/design/version"

type IconKey = "courses" | "dashboard" | "theory" | "practice" | "attack" | "ids" | "results" | "profile" | "models" | "settings" | "about"

interface NavItem {
  id: string
  label: string
  icon: IconKey
  route?: Route
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { id: "courses", label: "학습 과정", icon: "courses", route: "courses" },
  {
    id: "dashboard",
    label: "전체 대시보드",
    icon: "dashboard",
    route: "dashboard",
  },
  {
    id: "can-basics",
    label: "CAN 기초",
    icon: "theory",
    children: [
      {
        id: "can-basics/protocol",
        label: "CAN 프로토콜",
        icon: "theory",
        route: "can-basics/protocol",
      },
      {
        id: "can-basics/frame",
        label: "CAN 프레임",
        icon: "theory",
        route: "can-basics/frame",
      },
      {
        id: "can-basics/ecu",
        label: "ECU와 Gateway",
        icon: "theory",
        route: "can-basics/ecu",
      },
    ],
  },
  {
    id: "practice",
    label: "CAN 실습",
    icon: "practice",
    children: [
      {
        id: "practice/normal",
        label: "정상 CAN 송수신",
        icon: "practice",
        route: "practice/normal",
      },
      {
        id: "practice/sender",
        label: "CAN Frame 송신기",
        icon: "practice",
        route: "practice/sender",
      },
      {
        id: "practice/monitor",
        label: "CAN Monitor",
        icon: "practice",
        route: "practice/monitor",
      },
    ],
  },
  {
    id: "attacks",
    label: "공격 실습",
    icon: "attack",
    children: [
      {
        id: "attacks/chain",
        label: "전체 공격 체인",
        icon: "attack",
        route: "attacks/chain",
      },
      {
        id: "attacks/spoofing",
        label: "Spoofing",
        icon: "attack",
        route: "attacks/spoofing",
      },
      {
        id: "attacks/replay",
        label: "Replay",
        icon: "attack",
        route: "attacks/replay",
      },
      { id: "attacks/dos", label: "DoS", icon: "attack", route: "attacks/dos" },
    ],
  },
  {
    id: "ids",
    label: "IDS 실습",
    icon: "ids",
    children: [
      {
        id: "ids/unknown-id",
        label: "Unknown ID",
        icon: "ids",
        route: "ids/unknown-id",
      },
      {
        id: "ids/frequency",
        label: "Frequency Anomaly",
        icon: "ids",
        route: "ids/frequency",
      },
      {
        id: "ids/payload-jump",
        label: "Payload Jump",
        icon: "ids",
        route: "ids/payload-jump",
      },
      {
        id: "ids/dos-detection",
        label: "DoS Detection",
        icon: "ids",
        route: "ids/dos-detection",
      },
      {
        id: "ids/gateway",
        label: "Gateway Policy",
        icon: "ids",
        route: "ids/gateway",
      },
    ],
  },
  { id: "results", label: "학습 결과", icon: "results", route: "results" },
  { id: "badges", label: "배지", icon: "results", route: "badges" },
  { id: "profile", label: "프로필", icon: "profile", route: "profile" },
  { id: "models", label: "3D 모델 관리", icon: "models", route: "models" },
  { id: "settings", label: "설정", icon: "settings", route: "settings" },
  { id: "about", label: "프로젝트 소개", icon: "about", route: "about" },
]

const hiddenNavItemIds = new Set([
  "practice/monitor",
  "ids",
  "results",
  "models",
  "about",
])

const mobileItems = [
  navItems[0],
  navItems[1],
  navItems[3].children![0],
  navItems[8],
  { ...navItems[4], route: "attacks/chain" as const, children: undefined },
]

function isLocked(
  itemId: string,
  devMode: boolean,
  progress: Record<string, number>,
): boolean {
  if (previewAccessOpen || devMode) return false
  if (itemId.startsWith("practice")) return (progress["can-basics"] || 0) < 80
  if (itemId.startsWith("attacks")) return (progress["practice"] || 0) < 80
  if (itemId.startsWith("ids")) return (progress["attacks"] || 0) < 80
  return false
}

function craftIcon(key: IconKey, size = 18): ReactNode {
  const props = { size, weight: "regular" as const, "aria-hidden": true }
  switch (key) {
    case "courses":
      return <Books {...props} />
    case "dashboard":
      return <Gauge {...props} />
    case "theory":
      return <BookOpen {...props} />
    case "practice":
      return <TerminalWindow {...props} />
    case "attack":
      return <ShieldCheck {...props} />
    case "ids":
      return <WarningOctagon {...props} />
    case "results":
      return <Medal {...props} />
    case "profile":
      return <UserCircle {...props} />
    case "models":
      return <Cube {...props} />
    case "settings":
      return <Gear {...props} />
    case "about":
      return <Info {...props} />
  }
}

function fluentIcon(key: IconKey): ReactNode {
  switch (key) {
    case "courses":
      return <LearningApp20Regular />
    case "dashboard":
      return <Home20Regular />
    case "theory":
      return <BookOpen20Regular />
    case "practice":
      return <DataUsage20Regular />
    case "attack":
      return <Shield20Regular />
    case "ids":
      return <Warning20Regular />
    case "results":
      return <Trophy20Regular />
    case "profile":
      return <Person20Regular />
    case "models":
      return <Cube20Regular />
    case "settings":
      return <Settings20Regular />
    case "about":
      return <Info20Regular />
  }
}

interface NavButtonProps {
  item: NavItem
  active: boolean
  locked: boolean
  child?: boolean
  expanded?: boolean
  onClick: () => void
}

function NavButton({
  item,
  active,
  locked,
  child,
  expanded,
  onClick,
}: NavButtonProps) {
  const content = (
    <>
      {!child && (
        <span className="designed-nav__icon">
          {designVersion === "ver3"
            ? fluentIcon(item.icon)
            : craftIcon(item.icon)}
        </span>
      )}
      {designVersion === "ver4" && (
        <span className="designed-nav__station" aria-hidden="true" />
      )}
      <span className="designed-nav__copy">{item.label}</span>
      {locked && designVersion !== "ver3" && (
        <LockSimple size={14} aria-label="잠김" />
      )}
      {item.children && (
        <CaretDown
          className="designed-nav__caret"
          size={14}
          weight="bold"
          aria-hidden="true"
        />
      )}
    </>
  )

  const className = `designed-nav__button${active ? " is-active" : ""}${
    child ? " is-child" : ""
  }${expanded ? " is-expanded" : ""}`

  if (designVersion === "ver3") {
    return (
      <Button
        appearance={active ? "primary" : "subtle"}
        className={className}
        disabled={locked}
        aria-current={active ? "page" : undefined}
        aria-expanded={item.children ? expanded : undefined}
        onClick={onClick}
      >
        {content}
      </Button>
    )
  }

  return (
    <button
      type="button"
      className={className}
      disabled={locked}
      aria-current={active ? "page" : undefined}
      aria-expanded={item.children ? expanded : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  )
}

export default function DesignedSidebar() {
  const {
    currentRoute,
    navigate,
    progress,
    devMode,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useApp()
  const [openGroups, setOpenGroups] = useState<string[]>([
    "can-basics",
    "practice",
  ])
  const overallProgress = Math.round(
    Object.values(progress.courseProgress).reduce(
      (sum, value) => sum + value,
      0,
    ) / 4,
  )

  const activate = (item: NavItem) => {
    if (item.children) {
      setOpenGroups((current) =>
        current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id],
      )
      return
    }
    if (item.route) navigate(item.route)
  }

  const renderItem = (item: NavItem) => {
    const expanded = openGroups.includes(item.id)
    const active =
      item.route === currentRoute ||
      Boolean(item.children?.some((child) => child.route === currentRoute))
    const locked = isLocked(item.id, devMode, progress.courseProgress)

    return (
      <div className="designed-nav__item" key={item.id}>
        <NavButton
          item={item}
          active={active}
          locked={locked}
          expanded={expanded}
          onClick={() => activate(item)}
        />
        {item.children && expanded && (
          <div className="designed-nav__children">
            {item.children.filter((child) => !hiddenNavItemIds.has(child.id)).map((child) => (
              <NavButton
                key={child.id}
                item={child}
                active={child.route === currentRoute}
                locked={isLocked(child.id, devMode, progress.courseProgress)}
                child
                onClick={() => activate(child)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={`designed-sidebar designed-sidebar--${designVersion}`}
      data-collapsed={sidebarCollapsed}
    >
      <div className="designed-sidebar__desktop">
        <div className="designed-sidebar__brand">
          <div className="designed-sidebar__brand-copy">
            <strong>{designMeta[designVersion].shortName}</strong>
            <span>{designMeta[designVersion].name}</span>
          </div>
          {designVersion === "ver3" ? (
            <Button
              appearance="subtle"
              icon={<Navigation20Regular />}
              aria-label={
                sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"
              }
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          ) : (
            <button
              type="button"
              className="designed-sidebar__collapse"
              aria-label={
                sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"
              }
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <List size={19} aria-hidden="true" />
            </button>
          )}
        </div>

        {designVersion === "ver4" && (
          <div className="designed-sidebar__route-title">
            <Path size={18} aria-hidden="true" />
            <span>학습 경로</span>
          </div>
        )}

        <nav className="designed-nav" aria-label="주요 메뉴">
          {navItems.filter((item) => !hiddenNavItemIds.has(item.id)).map(renderItem)}
        </nav>

        <div className="designed-sidebar__footer">
          <div className="designed-sidebar__connection">
            <Circuitry size={18} aria-hidden="true" />
            <span className="designed-nav__copy">프론트엔드 프리뷰</span>
          </div>
          <div
            className="designed-sidebar__progress"
            role="progressbar"
            aria-label={`전체 학습 진행률 ${overallProgress}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallProgress}
          >
            <span style={{ width: `${overallProgress}%` }} />
          </div>
        </div>
      </div>

      <nav className="designed-sidebar__mobile" aria-label="모바일 주요 메뉴">
        {mobileItems.filter((item) => !hiddenNavItemIds.has(item.id)).map((item) => {
          const locked = isLocked(item.id, devMode, progress.courseProgress)
          const active = item.route === currentRoute
          return (
            <button
              key={item.id}
              type="button"
              disabled={locked}
              aria-current={active ? "page" : undefined}
              onClick={() => activate(item)}
            >
              {designVersion === "ver3"
                ? fluentIcon(item.icon)
                : craftIcon(item.icon, 20)}
              <span>{item.label.replace("전체 ", "").replace("3D ", "")}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
