import { useApp, type Route } from "@/context/AppContext"
import type { HTMLAttributes } from "react"
import { Button, Card } from "@fluentui/react-components"
import {
  ArrowRight,
  BookOpenText,
  CheckCircle,
  LockSimple,
  Medal,
  Wrench,
} from "@phosphor-icons/react"
import { ArrowRight16Regular } from "@fluentui/react-icons/svg/arrow-right"
import { BookOpen20Regular } from "@fluentui/react-icons/svg/book-open"
import { CheckmarkCircle20Regular } from "@fluentui/react-icons/svg/checkmark-circle"
import { LockClosed16Regular } from "@fluentui/react-icons/svg/lock-closed"
import { Reward20Regular } from "@fluentui/react-icons/svg/reward"
import { Wrench20Regular } from "@fluentui/react-icons/svg/wrench"
import { designVersion, previewAccessOpen } from "@/design/version"

const recentActivity = [
  {
    time: "10분 전",
    action: "CAN 프레임 학습 완료",
    score: "+100점",
    icon: "book",
    legacy: "📖",
  },
  {
    time: "1시간 전",
    action: "CAN 프로토콜 퀴즈 정답",
    score: "+100점",
    icon: "check",
    legacy: "✅",
  },
  {
    time: "어제",
    action: "정상 CAN 송수신 실습 완료",
    score: "+150점",
    icon: "tool",
    legacy: "🔧",
  },
  {
    time: "2일 전",
    action: '"CAN 입문자" 배지 획득',
    score: "",
    icon: "badge",
    legacy: "🏅",
  },
]

const visibleCourses = [
  {
    key: "can-basics",
    label: "CAN 기초",
    accent: "var(--course-basics-accent)",
    bg: "var(--course-basics-bg)",
  },
  {
    key: "practice",
    label: "CAN 실습",
    accent: "var(--course-practice-accent)",
    bg: "var(--course-practice-bg)",
  },
  {
    key: "attacks",
    label: "공격 실습",
    accent: "var(--course-attacks-accent)",
    bg: "var(--course-attacks-bg)",
  },
] as const

interface ActivityIconProps {
  kind: string
  legacy: string
}

function ActivityIcon({ kind, legacy }: ActivityIconProps) {
  if (designVersion === "ver1") return legacy
  if (designVersion === "ver3") {
    if (kind === "book") return <BookOpen20Regular />
    if (kind === "check") return <CheckmarkCircle20Regular />
    if (kind === "tool") return <Wrench20Regular />
    return <Reward20Regular />
  }
  if (kind === "book") return <BookOpenText size={19} aria-hidden="true" />
  if (kind === "check") return <CheckCircle size={19} aria-hidden="true" />
  if (kind === "tool") return <Wrench size={19} aria-hidden="true" />
  return <Medal size={19} aria-hidden="true" />
}

function DashboardLockIcon() {
  if (designVersion === "ver1") {
    return (
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  }
  return designVersion === "ver3" ? (
    <LockClosed16Regular />
  ) : (
    <LockSimple size={14} aria-hidden="true" />
  )
}

function DashboardPanel({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return designVersion === "ver3" ? (
    <Card appearance="filled-alternative" {...props}>
      {children}
    </Card>
  ) : (
    <div {...props}>{children}</div>
  )
}

function DashboardArrow() {
  if (designVersion === "ver1") return <>→</>
  return designVersion === "ver3" ? (
    <ArrowRight16Regular aria-hidden="true" />
  ) : (
    <ArrowRight size={15} aria-hidden="true" />
  )
}

export default function DashboardPage() {
  const { progress, navigate, devMode } = useApp()
  const overallProgress = Math.round(
    visibleCourses.reduce(
      (total, course) => total + (progress.courseProgress[course.key] || 0),
      0,
    ) / visibleCourses.length,
  )
  const allContentOpen = previewAccessOpen || devMode

  return (
    <div
      className="dashboard-page"
      style={{ padding: "28px 40px", maxWidth: 980, margin: "0 auto" }}
    >
      <div className="dashboard-page__hero" style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 4px",
            letterSpacing: "-0.02em",
          }}
        >
          전체 대시보드
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          현재 무엇을 배우고 있으며 다음에 무엇을 해야 하는지 확인하세요.
        </p>
      </div>

      {/* Top metrics */}
      <div
        className="dashboard-metrics"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <DashboardPanel
          className="dashboard-panel dashboard-metric"
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-secondary)",
              margin: "0 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            전체 학습 진행률
          </p>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--brand-accent)",
              marginBottom: 8,
            }}
          >
            {overallProgress}%
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: "var(--border-default)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 3,
                backgroundColor: "var(--brand-accent)",
                transform: `scaleX(${overallProgress / 100})`,
                transformOrigin: "left",
                transition: "transform 0.4s",
              }}
            />
          </div>
        </DashboardPanel>
        <DashboardPanel
          className="dashboard-panel dashboard-metric"
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-secondary)",
              margin: "0 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            획득 점수
          </p>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              marginBottom: 4,
            }}
          >
            {progress.totalScore.toLocaleString()}
          </div>
          <p
            style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}
          >
            배지 {progress.badges.length}개 보유
          </p>
        </DashboardPanel>
        <DashboardPanel
          className="dashboard-panel dashboard-metric"
          style={{
            padding: "16px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-secondary)",
              margin: "0 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            이어서 학습하기
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: "0 0 10px",
              color: "var(--text-primary)",
            }}
          >
            CAN 프레임 구조
          </p>
          {designVersion === "ver3" ? (
            <Button
              appearance="primary"
              icon={<DashboardArrow />}
              iconPosition="after"
              onClick={() => navigate("can-basics/frame")}
            >
              이어하기
            </Button>
          ) : (
            <button
              className="dashboard-continue"
              type="button"
              onClick={() => navigate("can-basics/frame")}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: "var(--brand-accent)",
                color: "white",
              }}
            >
              이어하기 <DashboardArrow />
            </button>
          )}
        </DashboardPanel>
      </div>

      <div
        className="dashboard-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 28,
        }}
      >
        {/* Course progress */}
        <DashboardPanel
          className="dashboard-panel"
          style={{
            padding: "18px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 14px" }}>
            과정별 진행률
          </p>
          {visibleCourses.map((c) => {
            const pct = progress.courseProgress[c.key] || 0
            return (
              <div key={c.key} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
                    {c.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {pct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "var(--border-default)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 3,
                      backgroundColor: c.accent,
                      width: `${pct}%`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </DashboardPanel>

        {/* Recent activity */}
        <DashboardPanel
          className="dashboard-panel"
          style={{
            padding: "18px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 14px" }}>
            최근 학습 활동
          </p>
          {recentActivity.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom:
                  i < recentActivity.length - 1
                    ? "1px solid var(--border-default)"
                    : "none",
              }}
            >
              <span
                className="dashboard-activity__icon"
                style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.2 }}
              >
                <ActivityIcon kind={a.icon} legacy={a.legacy} />
              </span>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    margin: "0 0 2px",
                    color: "var(--text-primary)",
                  }}
                >
                  {a.action}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  {a.time}
                </p>
              </div>
              {a.score && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--state-success)",
                    flexShrink: 0,
                  }}
                >
                  {a.score}
                </span>
              )}
            </div>
          ))}
        </DashboardPanel>
      </div>

      {/* Quick navigation */}
      <DashboardPanel
        className="dashboard-panel dashboard-quick-nav"
        style={{
          padding: "16px 20px",
          borderRadius: 12,
          backgroundColor: "var(--surface-default)",
          border: "1px solid var(--border-default)",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 14px" }}>
          {allContentOpen
            ? "바로 시작할 수 있는 수업"
            : "잠금 해제된 다음 수업"}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            {
              label: "ECU와 Gateway",
              route: "can-basics/ecu" as Route,
              locked: false,
            },
            {
              label: "정상 CAN 송수신",
              route: "practice/normal" as Route,
              locked:
                !allContentOpen &&
                (progress.courseProgress["can-basics"] || 0) < 80,
            },
            {
              label: "CAN Frame 송신기",
              route: "practice/sender" as Route,
              locked:
                !allContentOpen &&
                (progress.courseProgress["can-basics"] || 0) < 80,
            },
          ].map((item, i) =>
            designVersion === "ver3" ? (
              <Button
                key={i}
                appearance="secondary"
                icon={item.locked ? <DashboardLockIcon /> : undefined}
                onClick={() => !item.locked && navigate(item.route)}
                disabled={item.locked}
              >
                {item.label}
              </Button>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => !item.locked && navigate(item.route)}
                disabled={item.locked}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  cursor: item.locked ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: item.locked
                    ? "var(--background-secondary)"
                    : "var(--background-primary)",
                  color: item.locked
                    ? "var(--text-disabled)"
                    : "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {item.locked && <DashboardLockIcon />}
                {item.label}
              </button>
            ),
          )}
        </div>
      </DashboardPanel>
    </div>
  )
}
