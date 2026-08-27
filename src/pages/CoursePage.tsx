import { useApp } from "@/context/AppContext"
import type { Route } from "@/context/AppContext"
import type { HTMLAttributes, ReactNode } from "react"
import { Button, Card } from "@fluentui/react-components"
import {
  BookOpenText,
  Check,
  Clock,
  LockSimple,
  Medal,
  ShieldWarning,
  TerminalWindow,
} from "@phosphor-icons/react"
import { BookOpen20Regular } from "@fluentui/react-icons/svg/book-open"
import { Clock16Regular } from "@fluentui/react-icons/svg/clock"
import { DataUsage20Regular } from "@fluentui/react-icons/svg/data-usage"
import { LockClosed16Regular } from "@fluentui/react-icons/svg/lock-closed"
import { Reward16Regular } from "@fluentui/react-icons/svg/reward"
import { Shield20Regular } from "@fluentui/react-icons/svg/shield"
import { Checkmark12Regular } from "@fluentui/react-icons/svg/checkmark"
import { designVersion, previewAccessOpen } from "@/design/version"
import { badgeCatalog } from "@/features/badges/catalog"

type CourseIconKey = "theory" | "practice" | "attack"

function CourseIcon({ kind }: { kind: CourseIconKey }) {
  if (designVersion === "ver1") {
    const legacy: Record<CourseIconKey, string> = {
      theory: "◈",
      practice: "▷",
      attack: "⬡",
    }
    return legacy[kind]
  }
  if (designVersion === "ver3") {
    if (kind === "theory") return <BookOpen20Regular />
    if (kind === "practice") return <DataUsage20Regular />
    if (kind === "attack") return <Shield20Regular />
    return <Shield20Regular />
  }

  const props = { size: 19, weight: "regular" as const, "aria-hidden": true }
  if (kind === "theory") return <BookOpenText {...props} />
  if (kind === "practice") return <TerminalWindow {...props} />
  if (kind === "attack") return <ShieldWarning {...props} />
  return <ShieldWarning {...props} />
}

function LockIcon() {
  if (designVersion === "ver1") {
    return (
      <svg
        width="14"
        height="14"
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
    <LockSimple size={16} aria-hidden="true" />
  )
}

function MetaIcon({ kind }: { kind: "time" | "badge" }): ReactNode {
  if (designVersion === "ver1") return kind === "time" ? "⏱" : "🏅"
  if (designVersion === "ver3")
    return kind === "time" ? <Clock16Regular /> : <Reward16Regular />
  return kind === "time" ? (
    <Clock size={15} aria-hidden="true" />
  ) : (
    <Medal size={15} aria-hidden="true" />
  )
}

function CourseSurface({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return designVersion === "ver3" ? (
    <Card appearance="filled-alternative" {...props}>
      {children}
    </Card>
  ) : (
    <div {...props}>{children}</div>
  )
}

function LessonDoneIcon() {
  if (designVersion === "ver1") return <>✓ </>
  return designVersion === "ver3" ? (
    <Checkmark12Regular aria-hidden="true" />
  ) : (
    <Check size={12} weight="bold" aria-hidden="true" />
  )
}

const courses = [
  {
    id: "can-basics",
    icon: "theory" as CourseIconKey,
    title: "CAN 기초",
    desc: "CAN 통신의 구조, 프레임 필드, ECU와 Gateway의 역할을 학습합니다.",
    time: "약 60분",
    difficulty: "입문",
    totalItems: 3,
    maxScore: 300,
    badge: "CAN 기초 완료",
    items: ["CAN 프로토콜", "CAN 프레임", "ECU와 Gateway"],
    resumeLabel: "CAN 프레임",
    startRoute: "can-basics/protocol" as Route,
    prerequisite: null,
    unlockKey: null,
    accent: "var(--course-basics-accent)",
    bg: "var(--course-basics-bg)",
    border: "var(--course-basics-border)",
  },
  {
    id: "practice",
    icon: "practice" as CourseIconKey,
    title: "CAN 실습",
    desc: "vcan 환경에서 CAN 메시지를 직접 송수신하고 프레임 동작을 확인합니다.",
    time: "약 60분",
    difficulty: "초급",
    totalItems: 2,
    maxScore: 300,
    badge: "CAN 실습 완료",
    items: ["정상 CAN 송수신", "CAN Frame 송신기"],
    resumeLabel: "정상 CAN 송수신",
    startRoute: "practice/normal" as Route,
    prerequisite: "CAN 기초 완료",
    unlockKey: "can-basics",
    accent: "var(--course-practice-accent)",
    bg: "var(--course-practice-bg)",
    border: "var(--course-practice-border)",
  },
  {
    id: "attacks",
    icon: "attack" as CourseIconKey,
    title: "공격 실습",
    desc: "전체 공격 체인, Spoofing, Replay 공격을 격리된 Toy 환경에서 단계별로 실습합니다.",
    time: "약 90분",
    difficulty: "중급",
    totalItems: 3,
    maxScore: 450,
    badge: "공격 실습 완료",
    items: ["전체 공격 체인", "Spoofing", "Replay"],
    resumeLabel: "전체 공격 체인",
    startRoute: "attacks/chain" as Route,
    prerequisite: "CAN 실습 완료",
    unlockKey: "practice",
    accent: "var(--course-attacks-accent)",
    bg: "var(--course-attacks-bg)",
    border: "var(--course-attacks-border)",
  },
]

const difficultyColor: Record<string, string> = {
  입문: "var(--state-success)",
  초급: "var(--state-info)",
  중급: "var(--state-warning)",
  고급: "var(--state-danger)",
}

export default function CoursePage() {
  const { navigate, progress, devMode } = useApp()
  const earnedBadgeCount = badgeCatalog.filter((badge) =>
    badge.isEarned(progress),
  ).length

  const isLocked = (unlockKey: string | null) => {
    if (previewAccessOpen || devMode || !unlockKey) return false
    return (progress.courseProgress[unlockKey] || 0) < 80
  }

  const totalPct = Math.round(
    courses.reduce(
      (total, course) => total + (progress.courseProgress[course.id] || 0),
      0,
    ) / courses.length,
  )
  const completedCount = progress.completedItems.filter(
    (itemId) =>
      itemId !== "practice/monitor" &&
      courses.some((course) => itemId.startsWith(course.id)),
  ).length

  return (
    <div
      className="course-page"
      style={{ padding: "28px 40px", maxWidth: 940, margin: "0 auto" }}
    >
      {/* Header */}
      <div className="course-page__hero" style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 4px",
                letterSpacing: "-0.02em",
              }}
            >
              학습 과정
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {previewAccessOpen
                ? "프리뷰 기간에는 CAN 기초부터 공격 실습까지 원하는 과정부터 바로 살펴볼 수 있습니다."
                : "CAN 기초부터 공격 실습까지 3개 과정을 순서대로 완료하세요."}
            </p>
          </div>
          {devMode && !previewAccessOpen && (
            <span
              style={{
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 5,
                backgroundColor: "var(--state-warning-bg)",
                color: "var(--state-warning)",
                fontWeight: 700,
                border: "1px solid var(--state-warning-border)",
                flexShrink: 0,
              }}
            >
              DEV 모드
            </span>
          )}
        </div>

        {/* Summary row */}
        <div className="course-summary" style={{ display: "flex", gap: 12 }}>
          {[
            { label: "전체 진행률", value: `${totalPct}%`, bar: true },
            {
              label: "획득 점수",
              value: `${progress.totalScore.toLocaleString()}점`,
            },
            { label: "완료 수업", value: `${completedCount}개` },
            { label: "획득 배지", value: `${earnedBadgeCount}개` },
          ].map((stat) => (
            <CourseSurface
              className="course-summary__stat"
              key={stat.label}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                backgroundColor: "var(--surface-default)",
                border: "1px solid var(--border-default)",
                flex: stat.bar ? 2 : 1,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  margin: "0 0 4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {stat.label}
              </p>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  margin: 0,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.value}
              </p>
              {stat.bar && (
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "var(--border-default)",
                    overflow: "hidden",
                    marginTop: 6,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 2,
                      backgroundColor: "var(--brand-accent)",
                      transform: `scaleX(${totalPct / 100})`,
                      transformOrigin: "left",
                      transition: "transform 0.5s",
                    }}
                  />
                </div>
              )}
            </CourseSurface>
          ))}
        </div>
      </div>

      {/* Dual CAN Rail + course modules */}
      <div className="course-path" style={{ position: "relative" }}>
        {/* CAN_H / CAN_L rail lines */}
        <div
          style={{
            position: "absolute",
            left: 19,
            top: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 2,
              flex: 1,
              backgroundColor: "var(--border-strong)",
              opacity: 0.6,
            }}
          />
          <div
            style={{
              width: 2,
              flex: 1,
              backgroundColor: "var(--border-default)",
              opacity: 0.4,
              marginLeft: 4,
            }}
          />
        </div>

        <div
          className="course-path__list"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {courses.map((course, idx) => {
            const locked = isLocked(course.unlockKey)
            const pct = progress.courseProgress[course.id] || 0
            const completedItems = progress.completedItems.filter((id) =>
              id.startsWith(course.id),
            ).length

            return (
              <div
                className={`course-path__module${locked ? " is-locked" : ""}${
                  pct > 0 ? " is-started" : ""
                }`}
                key={course.id}
                style={{ display: "flex", gap: 0, alignItems: "flex-start" }}
              >
                {/* Node on rail */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                    zIndex: 1,
                    marginRight: 20,
                  }}
                >
                  <div
                    className="course-path__node"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      backgroundColor: locked
                        ? "var(--background-secondary)"
                        : pct >= 100
                          ? course.bg
                          : "var(--surface-default)",
                      border: `2px solid ${
                        locked
                          ? "var(--border-default)"
                          : pct >= 100
                            ? course.accent
                            : course.accent + "80"
                      }`,
                      color: locked ? "var(--text-disabled)" : course.accent,
                      fontWeight: 800,
                    }}
                  >
                    {locked ? <LockIcon /> : <CourseIcon kind={course.icon} />}
                  </div>
                </div>

                {/* Module card */}
                <CourseSurface
                  className="course-card"
                  style={{
                    flex: 1,
                    padding: "16px 20px",
                    borderRadius: 12,
                    backgroundColor: "var(--surface-default)",
                    border: `1px solid ${
                      locked
                        ? "var(--border-default)"
                        : pct > 0
                          ? course.border
                          : "var(--border-default)"
                    }`,
                    opacity: locked ? 0.55 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <h2
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            margin: 0,
                            color: "var(--text-primary)",
                          }}
                        >
                          {course.title}
                        </h2>
                        <span
                          className="course-card__difficulty"
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 4,
                            backgroundColor:
                              difficultyColor[course.difficulty] + "22",
                            color: difficultyColor[course.difficulty],
                            fontWeight: 700,
                          }}
                        >
                          {course.difficulty}
                        </span>
                        {pct >= 100 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              backgroundColor: "var(--state-success-bg)",
                              color: "var(--state-success)",
                              fontWeight: 700,
                              border: "1px solid var(--state-success-border)",
                            }}
                          >
                            완료
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {course.desc}
                      </p>
                    </div>
                    <div
                      className="course-card__meta"
                      style={{
                        textAlign: "right",
                        flexShrink: 0,
                        marginLeft: 16,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span
                        style={{ fontSize: 11, color: "var(--text-secondary)" }}
                      >
                        <MetaIcon kind="time" />
                        {course.time}
                      </span>
                      <span
                        style={{ fontSize: 11, color: "var(--text-secondary)" }}
                      >
                        <MetaIcon kind="badge" />
                        {course.badge}
                      </span>
                      {course.prerequisite && locked && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--state-warning)",
                            fontWeight: 600,
                          }}
                        >
                          선행 조건: {course.prerequisite}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lesson chips */}
                  <div
                    className="course-card__lessons"
                    style={{
                      display: "flex",
                      gap: 4,
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {course.items.map((item) => {
                      const done = progress.completedItems.includes(
                        `${course.id}/${item.toLowerCase().replace(/\s/g, "-")}`,
                      )
                      return (
                        <span
                          key={item}
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 4,
                            backgroundColor: done
                              ? course.bg
                              : "var(--background-secondary)",
                            color: done
                              ? course.accent
                              : "var(--text-secondary)",
                            border: `1px solid ${
                              done ? course.border : "transparent"
                            }`,
                            fontWeight: done ? 600 : 400,
                          }}
                        >
                          {done && <LessonDoneIcon />}
                          {item}
                        </span>
                      )
                    })}
                  </div>

                  {/* Progress + action */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {pct > 0 && pct < 100
                            ? `최근 학습: ${course.resumeLabel}`
                            : pct >= 100
                              ? "과정 완료"
                              : "학습 전"}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--text-primary)",
                          }}
                        >
                          {completedItems} / {course.totalItems}
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
                            width: "100%",
                            height: "100%",
                            borderRadius: 3,
                            backgroundColor:
                              pct >= 100
                                ? "var(--state-success)"
                                : course.accent,
                            transform: `scaleX(${pct / 100})`,
                            transformOrigin: "left",
                            transition: "transform 0.4s",
                          }}
                        />
                      </div>
                    </div>
                    {designVersion === "ver3" ? (
                      <Button
                        className="course-card__action"
                        appearance="primary"
                        onClick={() => !locked && navigate(course.startRoute)}
                        disabled={locked}
                      >
                        {locked
                          ? "잠김"
                          : pct === 0
                            ? "시작하기"
                            : pct >= 100
                              ? "복습하기"
                              : "이어하기"}
                      </Button>
                    ) : (
                      <button
                        className="course-card__action"
                        type="button"
                        onClick={() => !locked && navigate(course.startRoute)}
                        disabled={locked}
                        style={{
                          padding: "9px 18px",
                          borderRadius: 8,
                          border: "none",
                          cursor: locked ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                          backgroundColor: locked
                            ? "var(--background-secondary)"
                            : pct >= 100
                              ? "var(--state-success)"
                              : course.accent,
                          color: locked ? "var(--text-disabled)" : "white",
                        }}
                      >
                        {locked
                          ? "잠김"
                          : pct === 0
                            ? "시작하기"
                            : pct >= 100
                              ? "복습하기"
                              : "이어하기"}
                      </button>
                    )}
                  </div>
                </CourseSurface>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
