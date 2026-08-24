import { useState } from "react"
import { useApp } from "@/context/AppContext"
import { designVersion } from "@/design/version"
import RouteLesson from "@/components/learning/RouteLesson"
import LessonQuiz, { RouteAction } from "@/components/learning/LessonQuiz"
import {
  classicalCanFields,
  FrameApplicationVisual,
  FrameAnatomyVisual,
  FrameIntroductionVisual,
  type FrameField,
} from "@/components/learning/FrameAnatomyVisual"

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
    desc: "Remote Transmission Request. Data Frame에서는 Dominant(0).",
    color: "#34D399",
    dominant: true,
  },
  {
    name: "IDE",
    bits: 1,
    desc: "Identifier Extension. Standard Frame에서는 Dominant(0).",
    color: "#FBBF24",
    dominant: true,
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
  "SOF → Arbitration → Control → Data → CRC → ACK → EOF",
  "SOF → Data → Identifier → ACK → CRC → EOF",
  "Identifier → SOF → Data → ACK → Control",
  "SOF → CRC → Data → Arbitration → EOF",
]

const fieldGroupLabels: Record<FrameField["group"], string> = {
  sof: "START",
  arbitration: "ARBITRATION FIELD",
  control: "CONTROL FIELD",
  data: "DATA FIELD",
  crc: "CRC FIELD",
  ack: "ACK FIELD",
  eof: "END",
}

function FrameFieldExplanation({ field }: { field: FrameField }) {
  return (
    <section className="frame-field-explanation" aria-live="polite">
      <small>{fieldGroupLabels[field.group]}</small>
      <header>
        <strong>{field.name}</strong>
        <code>{field.bitLabel}</code>
      </header>
      <p>{field.overviewDescription}</p>
      {field.overviewValue && <strong className="frame-field-explanation__value">{field.overviewValue}</strong>}
      <p className="frame-field-explanation__hint">
        오른쪽 Frame에서 다른 Field를 선택해 계속 탐색하세요.
      </p>
    </section>
  )
}

export default function FramePage() {
  const { navigate, completeItem, addScore, addNotification } = useApp()
  const [selectedField, setSelectedField] =
    useState<typeof standardFields[0] | null>(null)
  const [selectedAnatomyField, setSelectedAnatomyField] =
    useState<FrameField | null>(classicalCanFields[0])
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
        title="한 CAN Frame을 Bit 단위로 해부하기"
        introduction="CAN Frame은 Identifier와 Data뿐 아니라 중재, 길이 정보, 오류 검출, 수신 확인을 위한 여러 필드로 구성됩니다. Standard Data Frame을 왼쪽에서 오른쪽으로 따라가며 실제 Bus에 전송되는 구조를 해석합니다."
        objective="Standard CAN Data Frame의 전체 필드 순서를 설명하고, Identifier·RTR·IDE·DLC·CRC·ACK·EOF의 역할과 bit 수를 구분하며, Bit Stuffing과 Intermission까지 설명할 수 있습니다."
        chapters={[
          {
            id: "frame-notation",
            title: "CAN은 정보를 Frame 단위로 전송합니다",
            summary:
              "CAN Bus에서 하나의 메시지는 여러 Field가 정해진 순서로 이어진 Frame 형태로 전송됩니다. 각 Field는 시작, 식별, 데이터 전달, 오류 검증, 수신 확인 등의 역할을 담당합니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>전송 단위</dt>
                  <dd>CAN Frame</dd>
                </div>
                <div>
                  <dt>구성</dt>
                  <dd>여러 Field</dd>
                </div>
                <div>
                  <dt>순서</dt>
                  <dd>정해진 구조</dd>
                </div>
                <div>
                  <dt>역할</dt>
                  <dd>시작 · 전달 · 검증 · 종료</dd>
                </div>
              </dl>
            ),
            visual: <FrameIntroductionVisual />,
          },
          {
            id: "frame-map",
            title: "한 Frame은 여러 필드가 정해진 순서로 이어집니다",
            summary:
              "Standard CAN Data Frame은 SOF에서 시작해 Arbitration, Control, Data, CRC, ACK, EOF 순서로 구성됩니다. 오른쪽 Frame의 각 Field를 선택해 위치와 기본 역할을 먼저 확인하세요. 세부 동작은 다음 단계에서 영역별로 살펴봅니다.",
            content: selectedAnatomyField ? (
              <FrameFieldExplanation field={selectedAnatomyField} />
            ) : (
              <p className="lesson-note">
                오른쪽 Frame strip의 필드를 선택해 bit 수와 역할을 확인하세요.
              </p>
            ),
            visual: (
              <FrameAnatomyVisual
                focus="all"
                selectedField={selectedAnatomyField}
                onSelect={setSelectedAnatomyField}
              />
            ),
          },
          {
            id: "frame-arbitration-field",
            title: "Frame은 시작과 동시에 우선순위 정보를 보냅니다",
            summary:
              "SOF가 Frame의 시작을 알리고, Arbitration Field의 Identifier와 RTR이 메시지 종류와 Bus 중재에 필요한 정보를 전달합니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div><dt>SOF</dt><dd>1 bit · Dominant</dd></div>
                <div><dt>Identifier</dt><dd>11 bits · 0x101</dd></div>
                <div><dt>RTR</dt><dd>Data Frame = 0</dd></div>
              </dl>
            ),
            visual: (
              <FrameAnatomyVisual
                focus="arbitration"
                selectedField={selectedAnatomyField}
                onSelect={setSelectedAnatomyField}
              />
            ),
          },
          {
            id: "frame-control-data",
            title: "Control Field가 길이를 알리고 Data가 실제 값을 전달합니다",
            summary:
              "Standard Frame의 Control Field에는 IDE, r0, DLC가 있으며, DLC가 뒤따르는 Data Field의 길이를 나타냅니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div><dt>IDE</dt><dd>Standard = 0</dd></div>
                <div><dt>DLC</dt><dd>0001 = 1 byte</dd></div>
                <div><dt>Data</dt><dd>01 = 00000001 · 8 bits</dd></div>
              </dl>
            ),
            visual: (
              <FrameAnatomyVisual
                focus="control-data"
                selectedField={selectedAnatomyField}
                onSelect={setSelectedAnatomyField}
              />
            ),
          },
          {
            id: "frame-integrity",
            title: "Frame 후반부에서 오류 검증과 수신 확인이 이루어집니다",
            summary:
              "CRC는 전송 오류를 검출하고, ACK는 다른 노드의 정상 수신 여부를 확인하며, EOF가 Frame의 끝을 표시합니다.",
            content: (
              <p className="lesson-note">
                ACK는 특정 ECU가 메시지 내용을 사용했다는 의미가 아닙니다. 하나 이상의 다른 CAN 노드가 Frame을 오류 없이 수신했음을 의미합니다.
              </p>
            ),
            visual: (
              <FrameAnatomyVisual
                focus="integrity"
                selectedField={selectedAnatomyField}
                onSelect={setSelectedAnatomyField}
              />
            ),
          },
          {
            id: "frame-stuffing",
            title: "실제 Bus에는 Stuff Bit도 추가됩니다",
            summary:
              "CAN은 SOF부터 CRC Sequence까지 같은 값의 비트가 5개 연속되면 반대 값의 Stuff Bit를 자동으로 삽입합니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div><dt>적용 범위</dt><dd>SOF → CRC Sequence</dd></div>
                <div><dt>Frame 길이</dt><dd>44 + 8N nominal bits</dd></div>
                <div><dt>Intermission</dt><dd>3 Recessive · Frame 밖</dd></div>
              </dl>
            ),
            visual: (
              <FrameAnatomyVisual
                focus="stuffing"
                selectedField={selectedAnatomyField}
                onSelect={setSelectedAnatomyField}
              />
            ),
          },
          {
            id: "frame-comparison-quiz",
            title: "이제 실제 CAN 표기를 Frame 구조와 연결합니다",
            summary:
              "CAN 분석 도구에서는 긴 Frame 전체를 Identifier와 Data 중심으로 간단하게 표시하기도 합니다. 0x101#01 예제를 실제 Frame 구조와 연결하고 Standard와 Extended 형식을 정리합니다.",
            content: (
              <LessonQuiz
                question="다음 중 Standard CAN Data Frame의 순서로 가장 올바른 것은?"
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
            visual: (
              <FrameApplicationVisual
                frameType={frameType}
                onChange={setFrameType}
              />
            ),
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
