import { useState } from "react"
import { useApp } from "@/context/AppContext"
import { designVersion } from "@/design/version"
import CanBasicsStory from "@/components/learning/CanBasicsStory"

const sections = [
  { id: "what", title: "CAN이란?" },
  { id: "ecu", title: "ECU와 CAN Bus" },
  { id: "message", title: "Message-Based 통신" },
  { id: "id", title: "CAN ID와 우선순위" },
  { id: "signal", title: "Dominant / Recessive" },
  { id: "physical", title: "CAN_H / CAN_L" },
  { id: "error", title: "오류 검출" },
]

const quiz = {
  question: "CAN 버스에서 CAN ID 값이 작을수록 어떻게 됩니까?",
  options: [
    "우선순위가 낮아진다",
    "우선순위가 높아진다",
    "DLC가 커진다",
    "Baud rate가 빨라진다",
  ],
  answer: 1,
}

export default function ProtocolPage() {
  const {
    navigate,
    completeItem,
    addScore,
    earnBadge,
    addNotification,
    progress,
  } = useApp()
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [quizSelected, setQuizSelected] = useState<number | null>(null)
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const handleQuizSubmit = () => {
    if (quizSelected === null) return
    setQuizSubmitted(true)
    if (quizSelected === quiz.answer) {
      const isNewCompletion = !progress.completedItems.includes(
        "can-basics/protocol",
      )
      completeItem("can-basics/protocol")
      if (isNewCompletion) addScore(100)
      earnBadge({
        id: "protocol-done",
        name: "CAN 프로토콜 마스터",
        emoji: "📡",
        description: "CAN 프로토콜 개요를 완료했습니다.",
        earnedAt: new Date().toLocaleDateString(),
      })
      addNotification({
        type: "success",
        title: isNewCompletion ? "정답! +100점" : "정답입니다",
        message: "다음 학습으로 이동하세요.",
      })
    } else {
      addNotification({
        type: "danger",
        title: "오답",
        message: "다시 시도해보세요.",
      })
    }
  }

  const handleStoryComplete = () => {
    const isNewCompletion = !progress.completedItems.includes(
      "can-basics/protocol",
    )
    completeItem("can-basics/protocol")
    if (isNewCompletion) addScore(100)
    earnBadge({
      id: "protocol-done",
      name: "CAN 프로토콜 마스터",
      emoji: "CAN",
      description: "CAN 프로토콜 개요를 완료했습니다.",
      earnedAt: new Date().toLocaleDateString(),
    })
    addNotification({
      type: "success",
      title: isNewCompletion ? "정답! +100점" : "정답입니다",
      message: "CAN 중재 원리를 정확히 이해했습니다.",
    })
  }

  if (designVersion === "ver4") {
    return (
      <CanBasicsStory
        onComplete={handleStoryComplete}
        onContinue={() => navigate("can-basics/frame")}
      />
    )
  }

  const Card = ({
    title,
    icon,
    children,
  }: {
    title: string
    icon: string
    children: React.ReactNode
  }) => (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 10,
        backgroundColor: "var(--surface-default)",
        border: "1px solid var(--border-default)",
        marginBottom: 16,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
      </div>
      {children}
    </div>
  )

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Table of Contents */}
      <div
        style={{
          width: 180,
          flexShrink: 0,
          padding: "20px 12px",
          borderRight: "1px solid var(--border-default)",
          backgroundColor: "var(--surface-default)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-secondary)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          목차
        </p>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              display: "block",
              padding: "5px 8px",
              fontSize: 12,
              color: "var(--text-secondary)",
              textDecoration: "none",
              borderRadius: 4,
              marginBottom: 2,
            }}
            onClick={() => setActiveSection(s.id)}
          >
            {s.title}
          </a>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 40px",
          maxWidth: 760,
        }}
      >
        {/* Learning objectives */}
        <div
          style={{
            marginBottom: 24,
            padding: "14px 16px",
            borderRadius: 10,
            backgroundColor: "var(--brand-accent-muted)",
            border: "1px solid var(--brand-accent-light)",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--brand-accent)",
            }}
          >
            학습 목표
          </p>
          {[
            "CAN 프로토콜의 목적과 자동차 내 역할을 설명할 수 있다",
            "CAN ID와 우선순위의 관계를 이해한다",
            "Dominant/Recessive 신호 개념을 설명할 수 있다",
            "CAN 오류 검출 메커니즘을 이해한다",
          ].map((obj, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 13 }}
            >
              <span
                style={{
                  color: "var(--brand-accent)",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}.
              </span>
              <span>{obj}</span>
            </div>
          ))}
        </div>

        <div id="what">
          <Card title="CAN이란?" icon="📡">
            <p
              style={{
                fontSize: 13,
                color: "var(--text-primary)",
                lineHeight: 1.7,
                margin: "0 0 10px",
              }}
            >
              <strong>CAN(Controller Area Network)</strong>은 1986년 Bosch가
              개발한 차량 내부 통신 프로토콜입니다. 자동차의 수십 개
              ECU(Electronic Control Unit)가 단일 버스를 통해 메시지를 주고받을
              수 있도록 설계되었습니다.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {[
                { k: "표준", v: "ISO 11898" },
                { k: "속도", v: "최대 1 Mbps" },
                { k: "노드 수", v: "최대 127개" },
                { k: "버스 길이", v: "최대 40m (1Mbps)" },
              ].map((row) => (
                <div
                  key={row.k}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    backgroundColor: "var(--background-secondary)",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    {row.k}
                  </span>
                  <span style={{ fontWeight: 600 }}>{row.v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div id="ecu">
          <Card title="ECU와 CAN Bus 구조" icon="🔗">
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 12px" }}>
              자동차 내부의 모든 ECU는 CAN Bus에 병렬로 연결됩니다. 각 ECU는{" "}
              <strong>CAN Controller</strong>와 <strong>CAN Transceiver</strong>
              를 통해 버스에 접근합니다.
            </p>
            {/* Simple network diagram */}
            <div
              style={{
                backgroundColor: "var(--background-secondary)",
                borderRadius: 8,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-around",
                  marginBottom: 8,
                }}
              >
                {["Body ECU", "Dashboard ECU", "TCU", "Gateway ECU"].map(
                  (name) => (
                    <div
                      key={name}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        backgroundColor: "var(--brand-accent-light)",
                        border: "1px solid var(--brand-accent)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--brand-accent)",
                      }}
                    >
                      {name}
                    </div>
                  ),
                )}
              </div>
              <div
                style={{
                  height: 3,
                  backgroundColor: "var(--brand-accent)",
                  borderRadius: 2,
                  opacity: 0.4,
                  marginBottom: 4,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                }}
              >
                CAN Bus (CAN_H / CAN_L)
              </span>
            </div>
          </Card>
        </div>

        <div id="message">
          <Card title="Message-Based 통신" icon="📨">
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              CAN은 <strong>주소 기반이 아닌 메시지 기반</strong> 통신입니다. 각
              메시지는 고유한 CAN ID를 가지며, 모든 노드가 버스의 메시지를
              수신합니다. 각 ECU는 자신이 관심 있는 CAN ID의 메시지만
              처리합니다.
            </p>
          </Card>
        </div>

        <div id="id">
          <Card title="CAN ID와 우선순위" icon="🔢">
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 10px" }}>
              Standard Frame은 <strong>11-bit CAN ID</strong>를 사용합니다. ID
              값이 낮을수록 우선순위가 높으며, 버스 충돌 시 낮은 ID의 메시지가
              버스를 점유합니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { id: "0x001", priority: "최고", color: "var(--state-danger)" },
                {
                  id: "0x100",
                  priority: "높음",
                  color: "var(--state-warning)",
                },
                { id: "0x400", priority: "보통", color: "var(--state-info)" },
                {
                  id: "0x7FF",
                  priority: "낮음",
                  color: "var(--state-success)",
                },
              ].map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily:
                        "'JetBrains Mono Variable', 'Noto Sans KR Variable', monospace",
                      fontWeight: 600,
                      width: 60,
                    }}
                  >
                    {row.id}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: row.color,
                      opacity: 0.7,
                    }}
                  />
                  <span
                    style={{ color: row.color, fontWeight: 600, width: 40 }}
                  >
                    {row.priority}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div id="signal">
          <Card title="Dominant / Recessive" icon="⚡">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  backgroundColor: "var(--state-danger-bg)",
                  border: "1px solid var(--state-danger-border)",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--state-danger)",
                    margin: "0 0 4px",
                  }}
                >
                  Dominant (0)
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  CAN_H: 3.5V, CAN_L: 1.5V, 차동전압: 2V
                </p>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  backgroundColor: "var(--background-secondary)",
                  border: "1px solid var(--border-default)",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>
                  Recessive (1)
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  CAN_H: 2.5V, CAN_L: 2.5V, 차동전압: 0V
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div id="physical">
          <Card title="CAN_H / CAN_L" icon="🔌">
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>
              CAN은 <strong>차동 신호(Differential Signal)</strong>를 사용하여
              노이즈에 강한 통신을 제공합니다. CAN_H와 CAN_L 두 선의 전압 차이로
              비트를 표현합니다. 양 끝에 <strong>120Ω 종단 저항</strong>을
              설치하여 신호 반사를 방지합니다.
            </p>
          </Card>
        </div>

        <div id="error">
          <Card title="오류 검출" icon="🔍">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  name: "CRC Error",
                  desc: "15-bit CRC로 전송 데이터 무결성을 검증합니다.",
                },
                {
                  name: "Bit Error",
                  desc: "송신한 비트와 버스 상의 비트를 비교하여 감지합니다.",
                },
                {
                  name: "Form Error",
                  desc: "프레임 형식의 비트 필드를 검사합니다.",
                },
                {
                  name: "Stuff Error",
                  desc: "5개 연속 동일 비트 후 반전 비트가 없으면 오류입니다.",
                },
                {
                  name: "ACK Error",
                  desc: "ACK 슬롯에서 응답이 없으면 오류입니다.",
                },
              ].map((e) => (
                <div
                  key={e.name}
                  style={{ display: "flex", gap: 10, fontSize: 13 }}
                >
                  <span
                    style={{
                      color: "var(--brand-accent)",
                      fontWeight: 700,
                      width: 100,
                      flexShrink: 0,
                    }}
                  >
                    {e.name}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {e.desc}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quiz */}
        <div
          style={{
            marginTop: 24,
            padding: "20px 20px",
            borderRadius: 12,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px" }}>
            📝 미니 퀴즈
          </p>
          <p style={{ fontSize: 13, margin: "0 0 12px" }}>{quiz.question}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {quiz.options.map((opt, i) => {
              const isSelected = quizSelected === i
              const isCorrect = quizSubmitted && i === quiz.answer
              const isWrong = quizSubmitted && isSelected && i !== quiz.answer
              return (
                <button
                  key={i}
                  onClick={() => !quizSubmitted && setQuizSelected(i)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `1px solid ${
                      isCorrect
                        ? "var(--state-success)"
                        : isWrong
                          ? "var(--state-danger)"
                          : isSelected
                            ? "var(--brand-accent)"
                            : "var(--border-default)"
                    }`,
                    backgroundColor: isCorrect
                      ? "var(--state-success-bg)"
                      : isWrong
                        ? "var(--state-danger-bg)"
                        : isSelected
                          ? "var(--brand-accent-muted)"
                          : "var(--background-primary)",
                    cursor: quizSubmitted ? "default" : "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {isCorrect ? "✓ " : isWrong ? "✗ " : ""}
                  {opt}
                </button>
              )
            })}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {!quizSubmitted && (
              <button
                onClick={handleQuizSubmit}
                disabled={quizSelected === null}
                style={{
                  padding: "9px 20px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: "var(--brand-accent)",
                  color: "white",
                  opacity: quizSelected === null ? 0.5 : 1,
                }}
              >
                제출
              </button>
            )}
            {quizSubmitted && quizSelected === quiz.answer && (
              <button
                onClick={() => navigate("can-basics/frame")}
                style={{
                  padding: "9px 20px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: "var(--state-success)",
                  color: "white",
                }}
              >
                다음 학습 →
              </button>
            )}
            {quizSubmitted && quizSelected !== quiz.answer && (
              <button
                onClick={() => {
                  setQuizSubmitted(false)
                  setQuizSelected(null)
                }}
                style={{
                  padding: "9px 20px",
                  borderRadius: 7,
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  fontSize: 13,
                  backgroundColor: "transparent",
                  color: "var(--text-secondary)",
                }}
              >
                다시 시도
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 24,
          }}
        >
          <button
            onClick={() => navigate("courses")}
            style={{
              padding: "9px 16px",
              borderRadius: 7,
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              fontSize: 13,
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            ← 과정 선택
          </button>
          <button
            onClick={() => navigate("can-basics/frame")}
            style={{
              padding: "9px 16px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              backgroundColor: "var(--brand-accent)",
              color: "white",
            }}
          >
            다음: CAN 프레임 구조 →
          </button>
        </div>
      </div>
    </div>
  )
}
