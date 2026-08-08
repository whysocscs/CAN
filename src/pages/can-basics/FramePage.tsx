import { useState } from "react"
import { useApp } from "@/context/AppContext"
import { designVersion } from "@/design/version"
import RouteLesson from "@/components/learning/RouteLesson"
import LessonQuiz, { RouteAction } from "@/components/learning/LessonQuiz"
import {
  FrameIntegrityVisual,
  FrameMessageVisual,
  FrameQuizVisual,
  FrameStructureVisual,
} from "@/components/learning/LessonVisuals"

const standardFields = [
  {
    name: "SOF",
    bits: 1,
    desc: "Start of Frame. 도미넌트 비트로 프레임 시작.",
    color: "#A78BFA",
    dominant: true,
  },
  {
    name: "ID\n[10:0]",
    bits: 11,
    desc: "Identifier (11-bit). 메시지 ID 및 우선순위.",
    color: "#60A5FA",
    dominant: null,
  },
  {
    name: "RTR",
    bits: 1,
    desc: "Remote Transmission Request. 0=데이터, 1=원격.",
    color: "#34D399",
    dominant: false,
  },
  {
    name: "IDE",
    bits: 1,
    desc: "Identifier Extension. Standard=0.",
    color: "#FBBF24",
    dominant: false,
  },
  {
    name: "R0",
    bits: 1,
    desc: "Reserved. 항상 Dominant(0).",
    color: "#9CA3AF",
    dominant: true,
  },
  {
    name: "DLC",
    bits: 4,
    desc: "Data Length Code. 데이터 바이트 수 (0~8).",
    color: "#F87171",
    dominant: null,
  },
  {
    name: "Data",
    bits: 64,
    desc: "데이터 필드. 0~8 bytes의 실제 페이로드.",
    color: "#FB923C",
    dominant: null,
  },
  {
    name: "CRC",
    bits: 15,
    desc: "Cyclic Redundancy Check (15-bit). 오류 검출.",
    color: "#E879F9",
    dominant: null,
  },
  {
    name: "CRC\nDel",
    bits: 1,
    desc: "CRC 구분자. 항상 Recessive(1).",
    color: "#C084FC",
    dominant: false,
  },
  {
    name: "ACK",
    bits: 1,
    desc: "Acknowledgement. 수신 노드가 Dominant로 응답.",
    color: "#22D3EE",
    dominant: null,
  },
  {
    name: "ACK\nDel",
    bits: 1,
    desc: "ACK 구분자. 항상 Recessive(1).",
    color: "#67E8F9",
    dominant: false,
  },
  {
    name: "EOF",
    bits: 7,
    desc: "End of Frame. 7개 연속 Recessive 비트.",
    color: "#A3E635",
    dominant: false,
  },
]

const frameQuizOptions = [
  "데이터 필드의 바이트 수(0~8)를 나타낸다",
  "CAN ID를 나타낸다",
  "오류 검출 코드를 저장한다",
  "수신 노드의 주소를 나타낸다",
]

export default function FramePage() {
  const { navigate, completeItem, addScore, addNotification } = useApp()
  const [selectedField, setSelectedField] =
    useState<typeof standardFields[0] | null>(null)
  const [frameType, setFrameType] = useState<"standard" | "extended">(
    "standard",
  )
  const [quizSelected, setQuizSelected] = useState<number | null>(null)
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  const totalBits = standardFields.reduce(
    (a, f) => a + (f.bits === 64 ? 64 : f.bits),
    0,
  )

  const handleQuiz = () => {
    setQuizSubmitted(true)
    if (quizSelected === 0) {
      completeItem("can-basics/frame")
      addScore(100)
      addNotification({
        type: "success",
        title: "정답! +100점",
        message: "CAN 프레임 구조를 완료했습니다.",
      })
    }
  }

  if (designVersion === "ver4") {
    return (
      <RouteLesson
        snapScope="can-basics"
        title="한 Frame을 메시지로 읽기"
        introduction="CAN Frame은 주소가 아니라 Identifier와 Data를 함께 싣는 메시지 단위입니다. 교육용 예시를 따라 한 줄의 CAN 표기를 실제 의미로 풀어봅니다."
        objective="0x101#01 같은 Frame을 Identifier, DLC, Data로 나누어 읽고 CRC와 ACK가 왜 필요한지 설명할 수 있습니다."
        chapters={[
          {
            id: "frame-message",
            title: "Frame은 ID와 값을 함께 싣습니다",
            summary:
              "교육용 표기 0x101#01에서 0x101은 메시지의 의미와 우선순위이고, 01은 실제로 전달할 값입니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>0x101</dt>
                  <dd>Identifier</dd>
                </div>
                <div>
                  <dt>#</dt>
                  <dd>Identifier와 Data의 구분</dd>
                </div>
                <div>
                  <dt>01</dt>
                  <dd>1 byte Data</dd>
                </div>
                <div>
                  <dt>중요</dt>
                  <dd>수신 ECU 주소가 아니라 메시지 ID</dd>
                </div>
              </dl>
            ),
            visual: <FrameMessageVisual />,
          },
          {
            id: "frame-fields",
            title: "Identifier, DLC, Data를 순서대로 해석합니다",
            summary:
              "Identifier는 메시지의 의미와 중재 우선순위를 알려주고, DLC는 Data의 바이트 수를, Data는 실제 상태나 제어 값을 전달합니다.",
            content: selectedField ? (
              <div className="lesson-selected-detail">
                <div>
                  <strong>{selectedField.name.replace("\n", " ")}</strong>
                  <code>
                    {selectedField.bits} bit{selectedField.bits > 1 ? "s" : ""}
                  </code>
                </div>
                <p>{selectedField.desc}</p>
                {selectedField.dominant !== null && (
                  <span>
                    {selectedField.dominant ? "Dominant (0)" : "Recessive (1)"}
                  </span>
                )}
              </div>
            ) : (
              <p className="lesson-note">
                오른쪽 Frame에서 ID, DLC, Data를 선택해 각 필드가 0x101#01을
                어떻게 구성하는지 확인하세요.
              </p>
            ),
            visual: (
              <FrameStructureVisual
                fields={standardFields}
                selectedField={selectedField}
                frameType="standard"
                onSelect={(field) =>
                  setSelectedField(
                    field
                      ? (standardFields.find(
                          (item) => item.name === field.name,
                        ) ?? null)
                      : null,
                  )
                }
              />
            ),
          },
          {
            id: "frame-delivery",
            title: "CRC, ACK, EOF가 전달을 마무리합니다",
            summary:
              "수신 노드는 CRC로 Frame의 손상을 확인하고, 정상이라면 ACK 슬롯에 응답합니다. EOF는 해당 Frame의 끝을 알립니다.",
            content: (
              <div className="lesson-process" aria-label="프레임 검증 순서">
                <span>
                  <small>01</small>
                  <strong>CRC 검사</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <small>02</small>
                  <strong>ACK 응답</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <small>03</small>
                  <strong>EOF 종료</strong>
                </span>
              </div>
            ),
            visual: <FrameIntegrityVisual />,
          },
          {
            id: "frame-quiz",
            title: "이해 확인",
            summary:
              "0x101#01에서 Data 01을 정확하게 읽으려면 DLC가 알려주는 길이가 필요합니다.",
            content: (
              <LessonQuiz
                question="CAN Standard Frame에서 DLC 필드의 역할은 무엇입니까?"
                options={frameQuizOptions}
                correctIndex={0}
                selectedIndex={quizSelected}
                submitted={quizSubmitted}
                onSelect={setQuizSelected}
                onSubmit={handleQuiz}
                onRetry={() => {
                  setQuizSubmitted(false)
                  setQuizSelected(null)
                }}
                successAction={
                  <RouteAction
                    primary
                    onClick={() => navigate("can-basics/ecu")}
                  >
                    ECU와 Gateway로 이동
                  </RouteAction>
                }
              />
            ),
            visual: <FrameQuizVisual />,
          },
        ]}
      />
    )
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 40px",
          maxWidth: 800,
        }}
      >
        <div
          style={{
            marginBottom: 20,
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
              margin: "0 0 6px",
              color: "var(--brand-accent)",
            }}
          >
            학습 목표
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            CAN Standard Frame과 Extended Frame의 각 필드를 식별하고 역할을
            설명할 수 있다.
          </p>
        </div>

        {/* Frame type toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([
            ["standard", "Standard Frame (11-bit ID)"],
            ["extended", "Extended Frame (29-bit ID)"],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setFrameType(t)}
              style={{
                padding: "7px 16px",
                borderRadius: 7,
                border: `1px solid ${
                  frameType === t
                    ? "var(--brand-accent)"
                    : "var(--border-default)"
                }`,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: frameType === t ? 700 : 400,
                backgroundColor:
                  frameType === t ? "var(--brand-accent)" : "transparent",
                color: frameType === t ? "white" : "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Interactive frame diagram */}
        <div style={{ marginBottom: 20 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            필드를 클릭하면 상세 정보를 확인할 수 있습니다
          </p>
          <div
            style={{
              display: "flex",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--border-default)",
              overflowX: "auto",
            }}
          >
            {standardFields.map((f) => {
              const flexBasis =
                f.bits === 64 ? 8 : f.bits === 15 ? 3 : f.bits === 11 ? 2 : 1
              const isSelected = selectedField?.name === f.name
              return (
                <div
                  key={f.name}
                  onClick={() => setSelectedField(isSelected ? null : f)}
                  style={{
                    flex: flexBasis,
                    minWidth:
                      f.bits === 1
                        ? 28
                        : f.bits === 11
                          ? 56
                          : f.bits === 64
                            ? 120
                            : f.bits === 15
                              ? 60
                              : 40,
                    padding: "8px 4px",
                    backgroundColor: isSelected
                      ? f.color + "44"
                      : f.color + "18",
                    borderRight: "1px solid var(--border-default)",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "background-color 0.1s",
                    borderBottom: isSelected
                      ? `3px solid ${f.color}`
                      : "3px solid transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: f.color,
                      whiteSpace: "pre-line",
                      lineHeight: 1.2,
                    }}
                  >
                    {f.name}
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      color: "var(--text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    {f.bits}b
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected field info */}
        {selectedField && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 16px",
              borderRadius: 10,
              backgroundColor: "var(--surface-default)",
              border: `1px solid ${selectedField.color}`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: selectedField.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {selectedField.name.replace("\n", " ")}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  fontFamily:
                    "'JetBrains Mono Variable', 'Noto Sans KR Variable', monospace",
                }}
              >
                {selectedField.bits} bit{selectedField.bits > 1 ? "s" : ""}
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-primary)",
                lineHeight: 1.6,
                margin: "0 0 8px",
              }}
            >
              {selectedField.desc}
            </p>
            {selectedField.dominant !== null && (
              <div style={{ display: "flex", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 4,
                    backgroundColor: selectedField.dominant
                      ? "var(--state-danger-bg)"
                      : "var(--background-secondary)",
                    border: `1px solid ${
                      selectedField.dominant
                        ? "var(--state-danger-border)"
                        : "var(--border-default)"
                    }`,
                    color: selectedField.dominant
                      ? "var(--state-danger)"
                      : "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {selectedField.dominant ? "Dominant (0)" : "Recessive (1)"}
                </span>
              </div>
            )}
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                margin: "8px 0 0",
              }}
            >
              Extended Frame:{" "}
              {frameType === "extended"
                ? selectedField.name === "ID\n[10:0]"
                  ? "ID[28:18] (11-bit Base ID)로 사용됨"
                  : selectedField.name === "IDE"
                    ? "1로 설정됨"
                    : selectedField.name === "SRR"
                      ? "Substitute Remote Request 추가됨"
                      : "동일"
                : "없음"}
            </p>
          </div>
        )}

        {/* Comparison table */}
        <div
          style={{
            marginBottom: 24,
            padding: "16px",
            borderRadius: 10,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>
            Standard vs Extended 비교
          </p>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                {["항목", "Standard Frame", "Extended Frame"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 12px",
                      textAlign: "left",
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      fontSize: 11,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["ID 길이", "11-bit", "29-bit"],
                ["최대 ID", "0x7FF (2047)", "0x1FFFFFFF (536M+)"],
                ["IDE 비트", "0 (Dominant)", "1 (Recessive)"],
                ["총 프레임 크기", "약 108 bit", "약 128 bit"],
                ["주 용도", "일반 차량 네트워크", "대용량 ID가 필요한 시스템"],
              ].map(([k, v1, v2]) => (
                <tr
                  key={k}
                  style={{ borderBottom: "1px solid var(--border-default)" }}
                >
                  <td
                    style={{
                      padding: "7px 12px",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ padding: "7px 12px" }}>{v1}</td>
                  <td style={{ padding: "7px 12px" }}>{v2}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quiz */}
        <div
          style={{
            padding: "18px",
            borderRadius: 10,
            backgroundColor: "var(--surface-default)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>
            📝 미니 퀴즈
          </p>
          <p style={{ fontSize: 13, margin: "0 0 10px" }}>
            CAN Standard Frame에서 DLC 필드의 역할은 무엇입니까?
          </p>
          {frameQuizOptions.map((opt, i) => {
            const isSelected = quizSelected === i
            const isCorrect = quizSubmitted && i === 0
            const isWrong = quizSubmitted && isSelected && i !== 0
            return (
              <button
                key={i}
                onClick={() => !quizSubmitted && setQuizSelected(i)}
                style={{
                  display: "block",
                  width: "100%",
                  marginBottom: 6,
                  padding: "9px 14px",
                  borderRadius: 7,
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
                }}
              >
                {opt}
              </button>
            )
          })}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {!quizSubmitted ? (
              <button
                onClick={handleQuiz}
                disabled={quizSelected === null}
                style={{
                  padding: "8px 20px",
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
            ) : quizSelected === 0 ? (
              <button
                onClick={() => navigate("can-basics/ecu")}
                style={{
                  padding: "8px 20px",
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
            ) : (
              <button
                onClick={() => {
                  setQuizSubmitted(false)
                  setQuizSelected(null)
                }}
                style={{
                  padding: "8px 20px",
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
            marginTop: 20,
          }}
        >
          <button
            onClick={() => navigate("can-basics/protocol")}
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
            ← CAN 프로토콜
          </button>
          <button
            onClick={() => navigate("can-basics/ecu")}
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
            다음: ECU와 Gateway →
          </button>
        </div>
      </div>
    </div>
  )
}
