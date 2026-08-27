import { useApp, type Route } from "@/context/AppContext"

export const breadcrumbMap: Record<Route, string[]> = {
  courses: ["홈", "학습 과정"],
  dashboard: ["홈", "전체 대시보드"],
  "can-basics/protocol": ["홈", "CAN 기초", "CAN 프로토콜"],
  "can-basics/frame": ["홈", "CAN 기초", "CAN 프레임"],
  "can-basics/ecu": ["홈", "CAN 기초", "ECU와 Gateway"],
  "practice/normal": ["홈", "CAN 실습", "정상 CAN 송수신"],
  "practice/sender": ["홈", "CAN 실습", "CAN Frame 송신기"],
  "practice/monitor": ["홈", "CAN 실습", "CAN Monitor"],
  "attacks/chain": ["홈", "공격 실습", "전체 공격 체인"],
  "attacks/spoofing": ["홈", "공격 실습", "Spoofing"],
  "attacks/replay": ["홈", "공격 실습", "Replay"],
  "ids/unknown-id": ["홈", "IDS 실습", "Unknown ID 탐지"],
  "ids/frequency": ["홈", "IDS 실습", "Frequency Anomaly 탐지"],
  "ids/payload-jump": ["홈", "IDS 실습", "Payload Jump 탐지"],
  "ids/gateway": ["홈", "IDS 실습", "Gateway Policy"],
  results: ["홈", "학습 결과"],
  badges: ["홈", "배지"],
  profile: ["홈", "프로필"],
  models: ["홈", "3D 모델 관리"],
  about: ["홈", "프로젝트 소개"],
}

export const pageTitles: Record<Route, string> = {
  courses: "학습 과정",
  dashboard: "전체 대시보드",
  "can-basics/protocol": "CAN 프로토콜",
  "can-basics/frame": "CAN 프레임",
  "can-basics/ecu": "ECU와 Gateway",
  "practice/normal": "정상 CAN 메시지 송수신",
  "practice/sender": "CAN Frame 송신기",
  "practice/monitor": "CAN Monitor",
  "attacks/chain": "전체 공격 체인",
  "attacks/spoofing": "CAN Spoofing",
  "attacks/replay": "Replay Attack",
  "ids/unknown-id": "Unknown ID 탐지",
  "ids/frequency": "Frequency Anomaly 탐지",
  "ids/payload-jump": "Payload Jump 탐지",
  "ids/gateway": "Gateway Policy",
  results: "학습 결과",
  badges: "배지",
  profile: "프로필",
  models: "3D 모델 관리",
  about: "프로젝트 소개",
}

const SunIcon = () => (
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
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const MoonIcon = () => (
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
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const BellIcon = () => (
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
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

const iconBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "none",
  color: "var(--text-secondary)",
  cursor: "pointer",
}

export default function Header() {
  const { currentRoute, theme, toggleTheme, notifications, progress } = useApp()
  const crumbs = breadcrumbMap[currentRoute] || []
  const title = pageTitles[currentRoute] || ""

  return (
    <header
      style={{
        height: "var(--header-height)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        gap: 8,
        backgroundColor: "var(--surface-default)",
        borderBottom: "1px solid var(--border-default)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Breadcrumb */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}
      >
        {crumbs.length > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {crumbs.map((crumb, i) => (
              <span
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
                <span
                  style={
                    i === crumbs.length - 1
                      ? { color: "var(--text-primary)", fontWeight: 500 }
                      : {}
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
        {crumbs.length <= 1 && title && (
          <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        )}
      </div>

      {/* Preview status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 20,
          border: "1px solid var(--border-default)",
          backgroundColor: "var(--background-primary)",
          fontSize: 11,
        }}
      >
        <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
          프론트엔드 프리뷰
        </span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        style={iconBtn}
        title={theme === "dark" ? "라이트 모드" : "다크 모드"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Notifications */}
      <button style={{ ...iconBtn, position: "relative" }} title="알림">
        <BellIcon />
        {notifications.length > 0 && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "var(--state-danger)",
            }}
          />
        )}
      </button>

      {/* User info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
          borderRadius: 20,
          border: "1px solid var(--border-default)",
          cursor: "pointer",
          backgroundColor: "var(--background-primary)",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: "var(--brand-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "white",
          }}
        >
          김
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>김민준</span>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
            {progress.totalScore.toLocaleString()}점
          </span>
        </div>
      </div>
    </header>
  )
}
