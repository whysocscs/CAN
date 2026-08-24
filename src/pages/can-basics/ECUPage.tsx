import { useState } from "react"
import { useApp } from "@/context/AppContext"
import { designVersion } from "@/design/version"
import RouteLesson from "@/components/learning/RouteLesson"
import { RouteAction } from "@/components/learning/LessonQuiz"
import {
  AcceptanceFilterVisual,
  ECUActionVisual,
  ECUOverviewVisual,
  ECUPipelineVisual,
  EndToEndFlowVisual,
  GatewayRoutingVisual,
  VehicleNetworkVisual,
  type ECUOverviewNode,
  type GatewayRoutingMode,
} from "@/components/learning/ECUGatewayVisuals"
import {
  CourseCompleteVisual,
  ECUProcessingVisual,
  ECUNetworkVisual,
  GatewayPolicyVisual,
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

const overviewNodes: readonly ECUOverviewNode[] = [
  { id: "body", label: "Body ECU", fullName: "Body Control Module", category: "ecu", domain: "Body", role: "차체 편의 기능 제어", functions: ["Door", "Window", "Lamp"] },
  { id: "engine", label: "Engine ECU", fullName: "Engine Control Unit", category: "ecu", domain: "Powertrain", role: "엔진 상태 및 토크 제어", functions: ["RPM", "Torque", "Engine Control"] },
  { id: "brake", label: "Brake ECU", fullName: "Brake Control Unit", category: "ecu", domain: "Chassis", role: "제동 및 차체 안정 기능", functions: ["Brake", "ABS"] },
  { id: "cluster", label: "Instrument Cluster", fullName: "Instrument Cluster", category: "ecu", domain: "Display", role: "운전자 정보 표시", functions: ["Speed", "RPM", "Warning"] },
  { id: "gateway", label: "Gateway ECU", fullName: "Vehicle Network Gateway", category: "gateway", domain: "Gateway", role: "차량 네트워크 연결 및 Routing", functions: ["Network 연결", "Routing"] },
]

function ECULessonV4({
  selectedOverviewId,
  onSelectOverview,
  gatewayMode,
  onGatewayModeChange,
  onReview,
  onComplete,
}: {
  selectedOverviewId: string
  onSelectOverview: (id: string) => void
  gatewayMode: GatewayRoutingMode
  onGatewayModeChange: (mode: GatewayRoutingMode) => void
  onReview: () => void
  onComplete: () => void
}) {
  const activeNode = overviewNodes.find((node) => node.id === selectedOverviewId) ?? overviewNodes[0]
  return (
    <RouteLesson
      snapScope="can-basics"
      title="Frame이 실제 차량 기능이 되기까지"
      introduction="CAN Bus를 지나온 Frame은 ECU 내부에서 단계적으로 처리되어 실제 차량 기능이 됩니다. 서로 다른 차량 네트워크로 전달해야 할 때는 Gateway가 Routing을 담당합니다."
      objective="Transceiver·CAN Controller·Acceptance Filter·ECU Software의 역할을 구분하고, Gateway가 차량 네트워크를 연결하며 정책에 따라 Frame을 전달하는 과정을 설명할 수 있습니다."
      chapters={[
        {
          id: "ecu-overview",
          title: "ECU는 차량 기능을 담당하는 제어 컴퓨터입니다",
          summary: "차량의 도어, 엔진, 제동, 계기판 같은 기능은 각 ECU가 담당합니다. ECU는 CAN Bus에서 필요한 정보를 받아 자신의 기능을 처리합니다.",
          content: <div className="lesson-selected-detail"><div><strong>{activeNode.label}</strong><span>{activeNode.domain}</span></div><small>{activeNode.fullName}</small><p>{activeNode.role}</p><em>담당 기능 · {activeNode.functions.join(" · ")}</em></div>,
          visual: <ECUOverviewVisual nodes={overviewNodes} selectedId={selectedOverviewId} onSelect={onSelectOverview} />,
        },
        {
          id: "ecu-processing-pipeline",
          title: "Frame은 ECU 안에서 단계적으로 처리됩니다",
          summary: "CAN Bus의 신호는 Transceiver를 거쳐 CAN Controller가 처리하고, 필요한 메시지만 ECU Software로 전달됩니다.",
          content: <div className="lesson-ecu-stage-list"><span><small>01</small><strong>Transceiver</strong><em>Physical Signal ↔ Logic</em></span><span><small>02</small><strong>CAN Controller</strong><em>Frame 처리 · Filtering</em></span><span><small>03</small><strong>ECU Software</strong><em>Data 의미 해석</em></span><span><small>04</small><strong>Vehicle Function</strong><em>실제 기능 실행</em></span></div>,
          visual: <ECUPipelineVisual />,
        },
        {
          id: "acceptance-filtering",
          title: "CAN Controller가 필요한 메시지를 먼저 선택합니다",
          summary: "같은 Bus의 Frame을 CAN Controller가 수신한 뒤, 설정된 Acceptance Filter를 이용해 ECU가 관심 있는 Identifier만 Software로 전달할 수 있습니다.",
          content: <dl className="lesson-comparison-list"><div><dt>입력</dt><dd>여러 CAN Frame</dd></div><div><dt>판단</dt><dd>Identifier Filter</dd></div><div><dt>출력</dt><dd>필요한 Frame만 Software 전달</dd></div><div><dt>중요</dt><dd>CAN ID는 ECU 주소가 아님</dd></div></dl>,
          visual: <AcceptanceFilterVisual />,
        },
        {
          id: "ecu-action",
          title: "Software가 Data의 의미를 차량 기능으로 바꿉니다",
          summary: "CAN Controller를 통과한 Frame은 ECU Software에서 애플리케이션 의미로 해석되고, 그 결과 실제 차량 기능이 실행됩니다.",
          content: <dl className="lesson-comparison-list"><div><dt>Frame</dt><dd>0x101#01</dd></div><div><dt>Identifier</dt><dd>교육용 Door Command</dd></div><div><dt>Data</dt><dd>01 = Lock</dd></div><div><dt>결과</dt><dd>Door: Locked</dd></div></dl>,
          visual: <ECUActionVisual />,
        },
        {
          id: "vehicle-networks",
          title: "차량은 하나의 Bus가 아니라 여러 네트워크로 나뉠 수 있습니다",
          summary: "차량에는 Body, Powertrain, Diagnostic 등 여러 네트워크 영역이 존재할 수 있으며, Gateway는 이 영역 사이를 연결합니다.",
          content: <dl className="lesson-comparison-list"><div><dt>영역</dt><dd>여러 차량 네트워크</dd></div><div><dt>연결</dt><dd>Gateway ECU</dd></div><div><dt>기본 역할</dt><dd>Routing · Forwarding</dd></div><div><dt>진단 접근</dt><dd>OBD-II Diagnostic Port</dd></div></dl>,
          visual: <VehicleNetworkVisual />,
        },
        {
          id: "gateway-routing-policy",
          title: "Gateway는 Routing 규칙에 따라 메시지를 전달합니다",
          summary: "Gateway는 Source Network, Destination Network, Identifier 등의 정보를 Routing 또는 정책 규칙과 비교해 Frame을 전달할지 결정할 수 있습니다.",
          content: <dl className="lesson-comparison-list"><div><dt>현재 입력</dt><dd>{gatewayMode === "allowed" ? "0x101#01" : "0x700#01"}</dd></div><div><dt>규칙</dt><dd>{gatewayMode === "allowed" ? "Match" : "No Match"}</dd></div><div><dt>결과</dt><dd>{gatewayMode === "allowed" ? "Forward" : "Drop"}</dd></div><div><dt>주의</dt><dd>교육용 Gateway 정책 예시</dd></div></dl>,
          visual: <GatewayRoutingVisual mode={gatewayMode} onChange={onGatewayModeChange} />,
        },
        {
          id: "ecu-end-to-end",
          title: "하나의 Frame이 차량 동작이 되기까지",
          summary: "CAN Bus에서 전달된 Frame은 ECU 내부에서 필터링·해석되어 차량 기능이 되고, 필요하면 Gateway를 통해 다른 네트워크로 전달됩니다.",
          content: <div className="lesson-complete-actions"><ol className="lesson-end-to-end-summary"><li>Frame 수신</li><li>Controller 처리</li><li>Identifier Filtering</li><li>Data 해석</li><li>차량 기능 실행</li><li>필요 시 Gateway 전달</li></ol><div><RouteAction onClick={onReview}>CAN 프레임 복습</RouteAction><RouteAction primary onClick={onComplete}>CAN 실습 시작</RouteAction></div></div>,
          visual: <EndToEndFlowVisual />,
        },
      ]}
    />
  )
}

export default function ECUPage() {
  const { navigate, completeItem, addScore, addNotification } = useApp()
  const [selectedNode, setSelectedNode] = useState<typeof ecuNodes[0] | null>(
    designVersion === "ver4"
      ? (ecuNodes.find((node) => node.id === "body") ?? null)
      : null,
  )
  const [selectedOverviewId, setSelectedOverviewId] = useState("body")
  const [gatewayMode, setGatewayMode] =
    useState<GatewayRoutingMode>("allowed")

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
    return (
      <ECULessonV4
        selectedOverviewId={selectedOverviewId}
        onSelectOverview={setSelectedOverviewId}
        gatewayMode={gatewayMode}
        onGatewayModeChange={setGatewayMode}
        onReview={() => navigate("can-basics/frame")}
        onComplete={() => {
          handleComplete()
          navigate("practice/normal")
        }}
      />
    )
  }

  if (false) {
    const activeNode =
      selectedNode ?? ecuNodes.find((node) => node.id === "body") ?? ecuNodes[0]

    return (
      <RouteLesson
        snapScope="can-basics"
        title="메시지가 ECU를 거쳐 차량 기능이 되기까지"
        introduction="Frame은 버스에서 끝나지 않습니다. ECU가 신호를 읽고 기능으로 바꾸며, Gateway가 다른 CAN 영역으로 넘어갈 수 있는지를 결정합니다."
        objective="ECU의 Transceiver·Controller·Software 역할과 Gateway의 허용·차단 정책을 교육용 메시지 흐름으로 설명할 수 있습니다."
        chapters={[
          {
            id: "ecu-network",
            title: "ECU는 기능별로 나뉜 제어 컴퓨터입니다",
            summary:
              "도어, 계기판, 진단, 통신처럼 차량 기능은 각자의 ECU가 맡습니다. 오른쪽 노드를 선택하면 담당 기능과 연결 위치를 확인할 수 있습니다.",
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
            id: "ecu-processing",
            title: "ECU는 신호를 읽고 필요한 Frame만 고릅니다",
            summary:
              "Transceiver가 전기 신호를 bit로 바꾸고, CAN Controller가 Identifier 필터를 적용한 뒤, ECU Software가 Data를 해석합니다.",
            content: (
              <div className="lesson-process" aria-label="ECU 처리 순서">
                <span>
                  <small>01</small>
                  <strong>Transceiver</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <small>02</small>
                  <strong>Controller</strong>
                </span>
                <i aria-hidden="true" />
                <span>
                  <small>03</small>
                  <strong>Software</strong>
                </span>
              </div>
            ),
            visual: <ECUProcessingVisual stage="filter" />,
          },
          {
            id: "ecu-action",
            title: "Data가 해석되면 차량 상태가 바뀝니다",
            summary:
              "교육용 Body ECU는 Identifier 0x101을 수신하고 Data 01을 문 잠금 요청으로 해석합니다. 같은 원리로 각 ECU가 자신의 기능을 처리합니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>수신 Frame</dt>
                  <dd>0x101#01</dd>
                </div>
                <div>
                  <dt>Identifier</dt>
                  <dd>Body ECU 필터 일치</dd>
                </div>
                <div>
                  <dt>Data</dt>
                  <dd>01 = 교육용 잠금 요청</dd>
                </div>
                <div>
                  <dt>결과</dt>
                  <dd>Door: Locked</dd>
                </div>
              </dl>
            ),
            visual: <ECUProcessingVisual stage="act" />,
          },
          {
            id: "gateway-boundary",
            title: "Gateway는 CAN 영역 사이의 경계입니다",
            summary:
              "차량은 하나의 거대한 CAN Bus가 아니라 Body, 진단처럼 여러 영역으로 나뉠 수 있습니다. Gateway가 영역 사이의 출입 지점이 됩니다.",
            content: (
              <div className="lesson-gateway-rules">
                <span>
                  <strong>영역</strong>
                  <small>진단 CAN과 Body CAN을 분리</small>
                </span>
                <span>
                  <strong>방향</strong>
                  <small>어느 쪽으로 갈지 확인</small>
                </span>
                <span>
                  <strong>정책</strong>
                  <small>전달 가능 여부를 결정</small>
                </span>
              </div>
            ),
            visual: <GatewayPolicyVisual state="boundary" />,
          },
          {
            id: "gateway-allowed",
            title: "허용된 Frame만 다음 영역으로 전달합니다",
            summary:
              "Gateway는 Identifier와 방향을 정책과 비교합니다. 교육용 정책 예시에서 0x101#01은 Body CAN 전달이 허용됩니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>입력</dt>
                  <dd>0x101#01</dd>
                </div>
                <div>
                  <dt>정책</dt>
                  <dd>Body CAN 전달 허용</dd>
                </div>
                <div>
                  <dt>결과</dt>
                  <dd>Body ECU가 수신</dd>
                </div>
              </dl>
            ),
            visual: <GatewayPolicyVisual state="allowed" />,
          },
          {
            id: "gateway-blocked",
            title: "정책 밖의 메시지는 Gateway에서 멈춥니다",
            summary:
              "허용되지 않은 ID나 방향이면 Gateway는 Frame을 전달하지 않습니다. 이 경계가 도메인 간 불필요한 통신을 줄이고 실습의 탐지 지점이 됩니다.",
            content: (
              <dl className="lesson-comparison-list">
                <div>
                  <dt>입력</dt>
                  <dd>0x700#01</dd>
                </div>
                <div>
                  <dt>정책</dt>
                  <dd>교육용 정책 불일치</dd>
                </div>
                <div>
                  <dt>결과</dt>
                  <dd>Body CAN 미전달</dd>
                </div>
              </dl>
            ),
            visual: <GatewayPolicyVisual state="blocked" />,
          },
          {
            id: "ecu-complete",
            title: "CAN 기초 완료",
            summary:
              "프로토콜, Frame, ECU 처리, Gateway 경계까지 확인했습니다. 이제 vcan0에서 Frame이 실제로 오가는 실습으로 이동합니다.",
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
