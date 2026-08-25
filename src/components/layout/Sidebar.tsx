import { useState } from "react"
import { useApp, type Route } from "@/context/AppContext"

interface NavItem {
  id: string
  label: string
  icon: string
  route?: Route
  children?: NavItem[]
  locked?: boolean
  lockedBy?: string
}

const BookIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
)

const ChevronDown = ({ open }: { open: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: open ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.2s",
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const LockIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const MenuIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const GridIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

const TerminalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

const ShieldIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const AlertIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const AwardIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
  </svg>
)

const navItems: NavItem[] = [
  { id: "courses", label: "학습 과정", icon: "grid", route: "courses" },
  { id: "dashboard", label: "전체 대시보드", icon: "grid", route: "dashboard" },
  {
    id: "can-basics",
    label: "CAN 기초",
    icon: "book",
    children: [
      {
        id: "can-basics/protocol",
        label: "CAN 프로토콜",
        icon: "book",
        route: "can-basics/protocol",
      },
      {
        id: "can-basics/frame",
        label: "CAN 프레임",
        icon: "book",
        route: "can-basics/frame",
      },
      {
        id: "can-basics/ecu",
        label: "ECU와 Gateway",
        icon: "book",
        route: "can-basics/ecu",
      },
    ],
  },
  {
    id: "practice",
    label: "CAN 실습",
    icon: "terminal",
    children: [
      {
        id: "practice/normal",
        label: "정상 CAN 송수신",
        icon: "terminal",
        route: "practice/normal",
      },
      {
        id: "practice/sender",
        label: "CAN Frame 송신기",
        icon: "terminal",
        route: "practice/sender",
      },
      {
        id: "practice/monitor",
        label: "CAN Monitor",
        icon: "terminal",
        route: "practice/monitor",
      },
    ],
  },
  {
    id: "attacks",
    label: "공격 실습",
    icon: "shield",
    children: [
      {
        id: "attacks/chain",
        label: "전체 공격 체인",
        icon: "shield",
        route: "attacks/chain",
      },
      {
        id: "attacks/spoofing",
        label: "Spoofing",
        icon: "shield",
        route: "attacks/spoofing",
      },
      {
        id: "attacks/replay",
        label: "Replay",
        icon: "shield",
        route: "attacks/replay",
      },
      { id: "attacks/dos", label: "DoS", icon: "shield", route: "attacks/dos" },
    ],
  },
  {
    id: "ids",
    label: "IDS 실습",
    icon: "alert",
    children: [
      {
        id: "ids/unknown-id",
        label: "Unknown ID",
        icon: "alert",
        route: "ids/unknown-id",
      },
      {
        id: "ids/frequency",
        label: "Frequency Anomaly",
        icon: "alert",
        route: "ids/frequency",
      },
      {
        id: "ids/payload-jump",
        label: "Payload Jump",
        icon: "alert",
        route: "ids/payload-jump",
      },
      {
        id: "ids/dos-detection",
        label: "DoS Detection",
        icon: "alert",
        route: "ids/dos-detection",
      },
      {
        id: "ids/gateway",
        label: "Gateway Policy",
        icon: "alert",
        route: "ids/gateway",
      },
    ],
  },
  { id: "results", label: "학습 결과", icon: "award", route: "results" },
  { id: "badges", label: "배지", icon: "award", route: "badges" },
  { id: "profile", label: "프로필", icon: "award", route: "profile" },
  { id: "models", label: "3D 모델 관리", icon: "grid", route: "models" },
  { id: "settings", label: "설정", icon: "grid", route: "settings" },
  { id: "about", label: "프로젝트 소개", icon: "book", route: "about" },
]

const hiddenNavItemIds = new Set([
  "practice/monitor",
  "ids",
  "results",
  "models",
  "about",
])

function getIcon(icon: string, size = 16) {
  const props = { width: size, height: size }
  switch (icon) {
    case "grid":
      return <GridIcon />
    case "book":
      return <BookIcon />
    case "terminal":
      return <TerminalIcon />
    case "shield":
      return <ShieldIcon />
    case "alert":
      return <AlertIcon />
    case "award":
      return <AwardIcon />
    default:
      return <BookIcon />
  }
}

function isLocked(
  itemId: string,
  devMode: boolean,
  completedItems: string[],
  progress: Record<string, number>,
): boolean {
  if (devMode) return false
  if (itemId.startsWith("practice")) return (progress["can-basics"] || 0) < 80
  if (itemId.startsWith("attacks")) return (progress["practice"] || 0) < 80
  if (itemId.startsWith("ids")) return (progress["attacks"] || 0) < 80
  return false
}

export default function Sidebar() {
  const {
    currentRoute,
    navigate,
    sidebarCollapsed,
    setSidebarCollapsed,
    progress,
    devMode,
  } = useApp()
  const [openGroups, setOpenGroups] = useState<string[]>([
    "can-basics",
    "practice",
  ])
  const [tooltip, setTooltip] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    )
  }

  const handleNavClick = (item: NavItem, e: React.MouseEvent) => {
    const locked = isLocked(
      item.id,
      devMode,
      progress.completedItems,
      progress.courseProgress,
    )
    if (locked) {
      setTooltip({ id: item.id, x: e.clientX, y: e.clientY })
      setTimeout(() => setTooltip(null), 2500)
      return
    }
    if (item.route) navigate(item.route)
  }

  const bg = {
    backgroundColor: "var(--surface-default)",
    borderRight: "1px solid var(--border-default)",
  }
  const collapsed = sidebarCollapsed

  return (
    <aside
      style={{
        width: collapsed
          ? "var(--sidebar-collapsed-width)"
          : "var(--sidebar-width)",
        minWidth: collapsed
          ? "var(--sidebar-collapsed-width)"
          : "var(--sidebar-width)",
        transition: "width 0.2s ease, min-width 0.2s ease",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        ...bg,
      }}
    >
      {/* Logo + collapse button */}
      <div
        style={{
          padding: collapsed ? "14px 0" : "14px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          borderBottom: "1px solid var(--border-default)",
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "var(--brand-accent)",
                letterSpacing: "-0.02em",
              }}
            >
              CANLite
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 2,
              }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: 80,
                  backgroundColor: "var(--border-default)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: "var(--brand-accent)",
                    width: `${Math.round(Object.values(progress.courseProgress).reduce((a, b) => a + b, 0) / 4)}%`,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {Math.round(
                  Object.values(progress.courseProgress).reduce(
                    (a, b) => a + b,
                    0,
                  ) / 4,
                )}
                %
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <span
            style={{
              fontWeight: 800,
              fontSize: 14,
              color: "var(--brand-accent)",
            }}
          >
            CL
          </span>
        )}
        <button
          onClick={() => setSidebarCollapsed(!collapsed)}
          style={{
            padding: 6,
            borderRadius: 6,
            border: "none",
            background: "none",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: collapsed ? 0 : 4,
          }}
        >
          <MenuIcon />
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
        }}
      >
        {navItems.filter((item) => !hiddenNavItemIds.has(item.id)).map((item) => {
          const locked = isLocked(
            item.id,
            devMode,
            progress.completedItems,
            progress.courseProgress,
          )
          const isActive = currentRoute === item.route
          const visibleChildren = item.children?.filter(
            (child) => !hiddenNavItemIds.has(child.id),
          )
          const hasChildren = visibleChildren && visibleChildren.length > 0
          const isOpen = openGroups.includes(item.id)

          return (
            <div key={item.id}>
              {/* Parent item */}
              <button
                onClick={(e) => {
                  if (hasChildren) toggleGroup(item.id)
                  else handleNavClick(item, e)
                }}
                title={collapsed ? item.label : undefined}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  padding: collapsed ? "9px 0" : "8px 12px",
                  gap: 8,
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderLeft: isActive
                    ? "3px solid var(--brand-accent)"
                    : "3px solid transparent",
                  backgroundColor: isActive
                    ? "var(--brand-accent-muted)"
                    : "transparent",
                  color: isActive
                    ? "var(--brand-accent)"
                    : locked
                      ? "var(--text-disabled)"
                      : "var(--text-primary)",
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                  borderRadius: collapsed ? 0 : "0 6px 6px 0",
                  marginRight: collapsed ? 0 : 8,
                  transition: "background-color 0.1s",
                }}
              >
                <span style={{ flexShrink: 0 }}>{getIcon(item.icon)}</span>
                {!collapsed && (
                  <>
                    <span
                      style={{
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.label}
                    </span>
                    {locked && <LockIcon />}
                    {hasChildren && !locked && <ChevronDown open={isOpen} />}
                  </>
                )}
              </button>

              {/* Children */}
              {hasChildren && isOpen && !collapsed && (
                <div style={{ paddingLeft: 12 }}>
                  {visibleChildren!.map((child) => {
                    const childLocked = isLocked(
                      child.id,
                      devMode,
                      progress.completedItems,
                      progress.courseProgress,
                    )
                    const childActive = currentRoute === child.route
                    const done = progress.completedItems.includes(child.id)
                    return (
                      <button
                        key={child.id}
                        onClick={(e) => handleNavClick(child, e)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 10px",
                          border: "none",
                          cursor: childLocked ? "not-allowed" : "pointer",
                          textAlign: "left",
                          fontSize: 12.5,
                          borderLeft: childActive
                            ? "2px solid var(--brand-accent)"
                            : "2px solid transparent",
                          backgroundColor: childActive
                            ? "var(--brand-accent-muted)"
                            : "transparent",
                          color: childActive
                            ? "var(--brand-accent)"
                            : childLocked
                              ? "var(--text-disabled)"
                              : "var(--text-secondary)",
                          fontWeight: childActive ? 600 : 400,
                          borderRadius: "0 4px 4px 0",
                          marginRight: 8,
                        }}
                      >
                        {done && !childLocked && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--state-success)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0 }}
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {childLocked && <LockIcon />}
                        {!done && !childLocked && (
                          <span style={{ width: 10 }} />
                        )}
                        <span style={{ flex: 1 }}>{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Lock tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 8,
            top: tooltip.y - 8,
            zIndex: 9999,
            backgroundColor: "var(--text-primary)",
            color: "var(--surface-default)",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            maxWidth: 200,
            pointerEvents: "none",
          }}
        >
          선행 과정을 먼저 완료해야 합니다.
        </div>
      )}
    </aside>
  )
}
