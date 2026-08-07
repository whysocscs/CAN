import { useState } from "react"
import { useApp } from "@/context/AppContext"
import { designVersion } from "@/design/version"
import RouteLesson from "@/components/learning/RouteLesson"
import { RouteAction } from "@/components/learning/LessonQuiz"
import {
  CourseCompleteVisual,
  ECUNetworkVisual,
  ECUPriorityVisual,
  GatewayFlowVisual,
} from "@/components/learning/LessonVisuals"

const ecuNodes = [
  {
    id: "ivi",
    label: "IVI",
    fullName: "In-Vehicle Infotainment",
    desc: "내비게이션, 오디오, 디스플레이 시스템을 제어합니다.",
    domain: "Infotainment",
    x: 15,
    y: 15,
    color: "#60A5FA",
  },
  {
    id: "tcu",
    label: "TCU",
    fullName: "Telematics Control Unit",
    desc: "차량의 무선 통신(LTE/5G/V2X)을 담당합니다.",
    domain: "Telematics",
    x: 50,
    y: 10,
    color: "#A78BFA",
  },
  {
    id: "obd",
    label: "OBD-II",
    fullName: "On-Board Diagnostics II",
    desc: "차량 자가 진단 포트. CAN 버스에 물리적으로 접근 가능합니다.",
    domain: "Diagnostics",
    x: 85,
    y: 15,
    color: "#F87171",
  },
  {
    id: "gateway",
    label: "Gateway ECU",
    fullName: "Gateway ECU",
    desc: "서로 다른 CAN 도메인 간의 메시지를 필터링하고 전달합니다. 보안의 핵심 역할.",
    domain: "Gateway",
    x: 50,
    y: 45,
    color: "#34D399",
  },
  {
    id: "body",
    label: "Body ECU",
    fullName: "Body Control Module",
    desc: "도어 잠금, 창문, 조명, 에어컨 등 차체 장치를 제어합니다.",
    domain: "Body",
    x: 15,
    y: 75,
    color: "#FBBF24",
  },
  {
    id: "dashboard",
    label: "Dashboard ECU",
    fullName: "Instrument Cluster",
    desc: "속도계, RPM, 경고등 등 대시보드 계기판을 제어합니다.",
    domain: "Chassis",
    x: 50,
    y: 80,
    color: "#FB923C",
  },
  {
    id: "ids",
    label: "IDS ECU",
    fullName: "Intrusion Detection System ECU",
    desc: "CAN 버스의 이상 행동을 실시간으로 탐지하고 알림을 생성합니다.",
    domain: "Security",
    x: 85,
    y: 75,
    color: "#E879F9",
  },
]

export default function ECUPage() {
  const { navigate, completeItem, addScore, addNotification } = useApp()
  const [selectedNode, setSelectedNode] = useState<typeof ecuNodes[0] | null>(
    designVersion === "ver4"
      ? (ecuNodes.find((node) => node.id === "gateway") ?? null)
      : null,
  )

  const handleComplete = () => {
    completeItem("can-basics/ecu")
    addScore(100)
    addNotification({
      type: "success",
      title: "CAN 기초 완료! +100점",
      message: "CAN 실습 과정이 해제되었습니다.",
    })
  }

  if (designVersion === "ver4") {
    const activeNode =
      selectedNode ?? ecuNodes.find((node) => node.id === "gateway") ?? null

    return (
      <RouteLesson
        snapScope="can-basics"
        title="차량의 ECU 경계를 읽기"
        introduction="외부 통신부터 차체 제어까지 ECU가 어떤 도메인에 속하고, Gateway가 메시지 경계를 어떻게 지키는지 살펴봅니다."
        objective="주요 ECU의 역할과 연결 구조를 이해하고 Gateway ECU의 필터링 역할을 설명할 수 있습니다."
        chapters={[
          {
            id: "ecu-network",
            title: "차량 ECU 네트워크",
            summary:
              "차량 기능은 여러 ECU에 나뉘어 있고, 각 도메인의 메시지는 Gateway ECU를 중심으로 연결됩니다.",
            content: activeNode ? (
              <div className="lesson-selected-detail">
                <div>
                  <strong>{activeNode.label}</strong>
                  <span>{activeNode.domain}</span>
                </div>
                <small>{activeNode.fullName}</small>
                <p>{activeNode.desc}</p>
                {activeNode.id === "obd" && (
                  <em>
                    OBD-II는 물리적 CAN Bus 접근 지점이므로 별도 통제가
                    필요합니다.
                  </em>
                )}
                {activeNode.id === "gateway" && (
                  <em>
                    Gateway ECU는 도메인 사이에서 허용된 메시지만 전달합니다.
                  </em>
                )}
              </div>
            ) : null,
            visual: (
              <ECUNetworkVisual
                nodes={ecuNodes}
                selectedNode={selectedNode}
                onSelect={(node) =>
                  setSelectedNode(
                    node
                      ? (ecuNodes.find((item) => item.id === node.id) ?? null)
                      : null,
                  )
                }
              />
            ),
          },
          {
            id: "ecu-gateway",
            title: "Gateway가 지키는 경계",
            summary:
              "Gateway ECU는 서로 다른 CAN 도메인을 연결하면서 메시지 ID, 방향, 허용 정책을 검사합니다.",
            content: (
              <div className="lesson-gateway-rules">
                <span>
                  <strong>검사</strong>
                  <small>ID와 송신 도메인을 확인</small>
                </span>
                <span>
                  <strong>필터</strong>
                  <small>허용되지 않은 메시지를 차단</small>
                </span>
                <span>
                  <strong>라우팅</strong>
                  <small>필요한 도메인으로만 전달</small>
                </span>
              </div>
            ),
            visual: <GatewayFlowVisual />,
          },
          {
            id: "ecu-security",
            title: "보안 중요도",
            summary:
              "외부 연결, 물리 접근, 도메인 경계를 가진 ECU는 공격 경로가 되기 쉬워 우선 보호해야 합니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>경계 제어</dt>
                  <dd>Gateway ECU</dd>
                </div>
                <div>
                  <dt>이상 탐지</dt>
                  <dd>IDS ECU</dd>
                </div>
                <div>
                  <dt>외부 연결</dt>
                  <dd>TCU, IVI</dd>
                </div>
                <div>
                  <dt>물리 접근</dt>
                  <dd>OBD-II</dd>
                </div>
              </dl>
            ),
            visual: <ECUPriorityVisual />,
          },
          {
            id: "ecu-complete",
            title: "CAN 기초 완료",
            summary:
              "프로토콜, 프레임, ECU 경계를 모두 확인했습니다. 이제 실제 프레임이 오가는 실습으로 이동합니다.",
            content: (
              <div className="lesson-complete-actions">
                <p>
                  정상 통신 실습에서 vcan0의 프레임과 차량 ECU 상태를 함께
                  확인할 수 있습니다.
                </p>
                <div>
                  <RouteAction onClick={() => navigate("can-basics/frame")}>
                    CAN 프레임 복습
                  </RouteAction>
                  <RouteAction
                    primary
                    onClick={() => {
                      handleComplete()
                      navigate("practice/normal")
                    }}
                  >
                    CAN 실습 시작
                  </RouteAction>
                </div>
              </div>
            ),
            visual: <CourseCompleteVisual />,
          },
        ]}
      />
    )
  }

  return (
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
          차량 내 주요 ECU의 역할과 도메인 구조를 이해하고, Gateway ECU의 보안
          역할을 설명할 수 있다.
        </p>
      </div>

      {/* Interactive network diagram */}
      <div
        style={{
          marginBottom: 20,
          padding: "16px",
          borderRadius: 12,
          backgroundColor: "var(--surface-default)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>
          차량 ECU 네트워크: 노드를 클릭하면 상세 정보가 표시됩니다
        </p>
        <div
          style={{
            position: "relative",
            height: 280,
            backgroundColor: "var(--background-secondary)",
            borderRadius: 8,
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Connection lines to gateway */}
            {ecuNodes
              .filter((n) => n.id !== "gateway")
              .map((n) => (
                <line
                  key={n.id}
                  x1={n.x}
                  y1={n.y}
                  x2={50}
                  y2={45}
                  stroke={
                    selectedNode?.id === n.id
                      ? n.color
                      : "var(--border-default)"
                  }
                  strokeWidth="0.8"
                  strokeOpacity={selectedNode?.id === n.id ? 0.8 : 0.4}
                  strokeDasharray={n.id === "obd" ? "2 1" : undefined}
                />
              ))}
            {/* Nodes */}
            {ecuNodes.map((n) => (
              <g
                key={n.id}
                style={{ cursor: "pointer" }}
                onClick={() =>
                  setSelectedNode(selectedNode?.id === n.id ? null : n)
                }
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.id === "gateway" ? 7 : 5}
                  fill={n.color}
                  fillOpacity={selectedNode?.id === n.id ? 0.4 : 0.15}
                  stroke={n.color}
                  strokeWidth={selectedNode?.id === n.id ? 2 : 1.5}
                />
                <circle cx={n.x} cy={n.y} r="2" fill={n.color} />
                <text
                  x={n.x}
                  y={n.y - (n.id === "gateway" ? 9 : 7)}
                  textAnchor="middle"
                  fontSize="4"
                  fill="var(--text-secondary)"
                  fontFamily="Noto Sans KR Variable, sans-serif"
                >
                  {n.label}
                </text>
              </g>
            ))}
            {/* Bus label */}
            <text
              x={50}
              y={60}
              textAnchor="middle"
              fontSize="3.5"
              fill="var(--text-secondary)"
              fontFamily="Noto Sans KR Variable, sans-serif"
            >
              CAN Bus Network
            </text>
          </svg>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            borderRadius: 10,
            backgroundColor: "var(--surface-default)",
            border: `1px solid ${selectedNode.color}55`,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: selectedNode.color,
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {selectedNode.label}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {selectedNode.fullName}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 4,
                backgroundColor: selectedNode.color + "22",
                color: selectedNode.color,
                fontWeight: 600,
              }}
            >
              {selectedNode.domain}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {selectedNode.desc}
          </p>
          {selectedNode.id === "obd" && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 6,
                backgroundColor: "var(--state-warning-bg)",
                border: "1px solid var(--state-warning-border)",
                fontSize: 12,
                color: "var(--state-warning)",
              }}
            >
              ⚠️ OBD-II 포트는 물리적 CAN Bus 접근이 가능하므로 보안상 주의가
              필요합니다.
            </div>
          )}
          {selectedNode.id === "gateway" && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 6,
                backgroundColor: "var(--state-success-bg)",
                border: "1px solid var(--state-success-border)",
                fontSize: 12,
                color: "var(--state-success)",
              }}
            >
              🛡️ Gateway ECU는 도메인 간 메시지 필터링 정책을 적용합니다.
            </div>
          )}
        </div>
      )}

      {/* ECU table */}
      <div
        style={{
          marginBottom: 20,
          padding: "16px",
          borderRadius: 10,
          backgroundColor: "var(--surface-default)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>
          주요 ECU 역할 요약
        </p>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
              {["ECU", "Domain", "주요 역할", "보안 중요도"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "6px 10px",
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
              {
                ecu: "Gateway ECU",
                domain: "Gateway",
                role: "도메인 간 메시지 필터링 및 라우팅",
                importance: "최고",
                icolor: "var(--state-danger)",
              },
              {
                ecu: "IDS ECU",
                domain: "Security",
                role: "이상 행동 실시간 탐지 및 Alert 생성",
                importance: "최고",
                icolor: "var(--state-danger)",
              },
              {
                ecu: "TCU",
                domain: "Telematics",
                role: "무선 통신 및 원격 서비스",
                importance: "높음",
                icolor: "var(--state-warning)",
              },
              {
                ecu: "IVI",
                domain: "Infotainment",
                role: "내비게이션, 오디오, 디스플레이",
                importance: "높음",
                icolor: "var(--state-warning)",
              },
              {
                ecu: "Body ECU",
                domain: "Body",
                role: "도어, 창문, 조명 제어",
                importance: "중간",
                icolor: "var(--state-info)",
              },
              {
                ecu: "OBD-II",
                domain: "Diagnostics",
                role: "차량 자가 진단 및 파라미터 조회",
                importance: "높음",
                icolor: "var(--state-warning)",
              },
            ].map((row) => (
              <tr
                key={row.ecu}
                style={{ borderBottom: "1px solid var(--border-default)" }}
              >
                <td style={{ padding: "7px 10px", fontWeight: 600 }}>
                  {row.ecu}
                </td>
                <td
                  style={{
                    padding: "7px 10px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {row.domain}
                </td>
                <td
                  style={{
                    padding: "7px 10px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {row.role}
                </td>
                <td style={{ padding: "7px 10px" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 7px",
                      borderRadius: 4,
                      backgroundColor: row.icolor + "20",
                      color: row.icolor,
                      fontWeight: 600,
                    }}
                  >
                    {row.importance}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 20,
        }}
      >
        <button
          onClick={() => navigate("can-basics/frame")}
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
          ← CAN 프레임
        </button>
        <button
          onClick={handleComplete}
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
          ✓ CAN 기초 완료 → CAN 실습 시작
        </button>
      </div>
    </div>
  )
}
