import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { Canvas } from "@react-three/fiber"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as Xterm } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { Bounds, Center, Html, Line, OrbitControls, useGLTF } from "@react-three/drei"
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretDown,
  CaretRight,
  Check,
  CircleNotch,
  Code,
  Cube,
  Eye,
  Keyboard,
  List,
  Monitor,
  Network,
  Play,
  TerminalWindow,
  Warning,
} from "@phosphor-icons/react"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import {
  CAN_COMMAND_CATALOG,
  CAN_MESSAGE_CATALOG,
  CAN_NODE_LABELS,
  NORMAL_CAN_COMMANDS,
} from "@/features/can/events/catalog"
import { mockEventProvider } from "@/features/can/events/mockProvider"
import type { CanCommand, CanEvent, CanNodeId } from "@/features/can/events/types"

const MODEL_PATH = "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"

type GuideStep = "1" | "2" | "3-1" | "3-2" | "4" | "5"
type ConsoleTab = "terminal" | "monitor" | "inspector"
type TerminalConnectionStatus = "connecting" | "connected" | "offline"
type EcuModuleId = CanNodeId

const TERMINAL_WS_URL =
  import.meta.env.VITE_TERMINAL_WS_URL ?? "ws://127.0.0.1:8010/ws/terminal"

const guideSteps: Array<{
  id: GuideStep
  label: string
  title: string
  body: string
}> = [
  {
    id: "1",
    label: "1",
    title: "가상 CAN 상태 확인",
    body: '명령 입력창에서 "ip link show vcan0"를 실행해 네트워크 인터페이스를 확인합니다.',
  },
  {
    id: "2",
    label: "2",
    title: "CAN 메시지 수신 시작",
    body: '명령 입력창에서 "candump vcan0"를 실행해 수신 대기 상태를 준비합니다.',
  },
  {
    id: "3-1",
    label: "3-1",
    title: "도어 잠금 메시지 송신",
    body: '정상 명령 "cansend vcan0 101#01"에 해당하는 이벤트를 발생시켜 Body ECU 경로를 확인합니다.',
  },
  {
    id: "3-2",
    label: "3-2",
    title: "트렁크 열기 메시지 송신",
    body: '정상 명령 "cansend vcan0 200#01"에 해당하는 이벤트를 발생시켜 Rear Module 경로를 확인합니다.',
  },
  {
    id: "4",
    label: "4",
    title: "CAN Monitor에서 확인",
    body: "같은 이벤트가 CAN Monitor, Frame Inspector, 3D 경로 강조에 동시에 반영되는지 확인합니다.",
  },
  {
    id: "5",
    label: "5",
    title: "마무리 퀴즈",
    body: "짧은 퀴즈로 CAN ID와 중앙 집중형 게이트웨이 구조를 이해했는지 확인합니다.",
  },
]

const stepOrder: GuideStep[] = ["1", "2", "3-1", "3-2", "4", "5"]

const quizQuestions = [
  {
    id: "q1",
    prompt: "방금 로그에서 Body ECU로 향한 패킷의 CAN ID는 무엇입니까?",
    options: ["101", "200", "201"],
    answer: "101",
  },
  {
    id: "q2",
    prompt: "현재 구조에서 Gateway ECU의 역할로 가장 적절한 설명은 무엇입니까?",
    options: [
      "내부 제어 트래픽을 적절한 ECU로 라우팅한다.",
      "모든 ECU가 직접 모든 패킷을 서로 주고받게 만든다.",
      "Rear Module만 단독으로 제어한다.",
    ],
    answer: "내부 제어 트래픽을 적절한 ECU로 라우팅한다.",
  },
] as const

const consoleTabs: Array<{
  id: ConsoleTab
  label: string
  icon: typeof TerminalWindow
}> = [
  { id: "terminal", label: "Terminal", icon: TerminalWindow },
  { id: "monitor", label: "CAN Monitor", icon: Monitor },
  { id: "inspector", label: "Frame Inspector", icon: Code },
]

type EcuModule = {
  id: EcuModuleId
  label: string
  detail: string
  anchorPosition: [number, number, number]
  position: [number, number, number]
  labelOffset: [number, number, number]
  labelShift: [number, number]
  rotation: number
  tone: string
  role: "gateway" | "interface" | "display" | "body" | "security" | "rear"
}

type BusConnection = {
  from: EcuModuleId
  to: EcuModuleId
}

type PreviewScenario = {
  title: string
  vehicleStatus: string
  busStatus: string
  effects: string[]
  activeModules: EcuModuleId[]
  route: EcuModuleId[]
}

const ecuModules: EcuModule[] = [
  {
    id: "obd",
    label: "Training OBD-II",
    detail: "Driver footwell",
    anchorPosition: [0.55, 0.69, 1.08],
    position: [0.3, 0.4, 0.9],
    labelOffset: [0, 0.2, 0],
    labelShift: [0, 8],
    rotation: -0.04,
    tone: "#4ee4db",
    role: "interface",
  },
  {
    id: "dashboard",
    label: "Dashboard ECU",
    detail: "Instrument cluster",
    anchorPosition: [0.35, 1.04, 0.74],
    position: [-0.5, 0.72, 0.9],
    labelOffset: [0, 0.18, 0],
    labelShift: [-10, -2],
    rotation: -0.02,
    tone: "#8cc9ff",
    role: "display",
  },
  {
    id: "gateway",
    label: "Gateway ECU",
    detail: "Centre tunnel · policy",
    anchorPosition: [0.2, 0.72, 0.14],
    position: [-0.1, 0.66, -0.4],
    labelOffset: [0, 0.2, 0],
    labelShift: [0, -2],
    rotation: -0.04,
    tone: "#ffba6b",
    role: "gateway",
  },
  {
    id: "body",
    label: "Body ECU",
    detail: "B-pillar · door/signal",
    anchorPosition: [0.67, 0.73, -0.54],
    position: [-0.5, 0.66, -1],
    labelOffset: [0, 0.18, 0],
    labelShift: [-8, 4],
    rotation: -0.04,
    tone: "#a9e67f",
    role: "body",
  },
  {
    id: "ids",
    label: "IDS ECU",
    detail: "Rear floor · rule engine",
    anchorPosition: [0.27, 0.55, -0.84],
    position: [0.1, 0.55, 0.4],
    labelOffset: [0, 0.18, 0],
    labelShift: [0, 4],
    rotation: -0.03,
    tone: "#ee8eb4",
    role: "security",
  },
  {
    id: "rear",
    label: "Rear Module",
    detail: "Rear quarter · light/lock",
    anchorPosition: [0.56, 0.6, -1.58],
    position: [-0.1, 0.56, -1.5],
    labelOffset: [0, 0.18, 0],
    labelShift: [4, 0],
    rotation: 0.04,
    tone: "#8cc9ff",
    role: "rear",
  },
]

const busConnections: BusConnection[] = [
  { from: "gateway", to: "ids" },
  { from: "gateway", to: "dashboard" },
  { from: "gateway", to: "body" },
  { from: "gateway", to: "rear" },
  { from: "ids", to: "obd" },
]

const previewScenarios: Record<EcuModuleId, PreviewScenario> = {
  gateway: {
    title: "Gateway preview",
    vehicleStatus: "Gateway 분기 경로 미리보기",
    busStatus: "Gateway -> Dashboard / Body / Rear / IDS",
    effects: [
      "Gateway ECU는 중앙 라우팅 허브처럼 여러 ECU 방향으로 프레임을 분기합니다.",
      "클릭을 다시 해제하면 전체 토폴로지 보기로 돌아갑니다.",
    ],
    activeModules: ["gateway", "dashboard", "body", "rear", "ids"],
    route: ["ids", "gateway", "dashboard", "gateway", "body", "gateway", "rear"],
  },
  body: {
    title: "Body ECU preview",
    vehicleStatus: "도어/조명 제어 경로 미리보기",
    busStatus: "Gateway -> Body ECU",
    effects: [
      "Body ECU는 도어와 라이트 같은 차체 제어 기능과 연결됩니다.",
      "정상 이벤트가 선택되면 같은 하이라이트 시스템이 재사용됩니다.",
    ],
    activeModules: ["gateway", "body"],
    route: ["gateway", "body"],
  },
  dashboard: {
    title: "Dashboard ECU preview",
    vehicleStatus: "계기판 갱신 경로 미리보기",
    busStatus: "Gateway -> Dashboard ECU",
    effects: [
      "Dashboard ECU는 속도계와 경고등 UI 같은 클러스터 표현과 연결됩니다.",
      "이 프리뷰는 이벤트 선택이 아닌 ECU 직접 클릭으로도 유지됩니다.",
    ],
    activeModules: ["gateway", "dashboard"],
    route: ["gateway", "dashboard"],
  },
  rear: {
    title: "Rear Module preview",
    vehicleStatus: "후방 기능 제어 경로 미리보기",
    busStatus: "Gateway -> Rear Module",
    effects: [
      "Rear Module은 트렁크와 후미등처럼 후방 기능과 연결됩니다.",
      "후방 제어 경로만 남겨 가독성을 높입니다.",
    ],
    activeModules: ["gateway", "rear"],
    route: ["gateway", "rear"],
  },
  ids: {
    title: "IDS preview",
    vehicleStatus: "IDS 감시 경로 미리보기",
    busStatus: "Gateway -> IDS ECU -> Training OBD-II",
    effects: [
      "IDS ECU는 외부 진단 경로와 게이트웨이 사이를 감시하는 노드로 표현됩니다.",
      "진단 프레임은 IDS 감시 메타데이터와 분리해서 표시됩니다.",
    ],
    activeModules: ["gateway", "ids", "obd"],
    route: ["gateway", "ids", "obd"],
  },
  obd: {
    title: "Training OBD-II preview",
    vehicleStatus: "외부 진단/패킷 주입 경로 미리보기",
    busStatus: "Training OBD-II -> IDS ECU -> Gateway ECU",
    effects: [
      "외부 진단/패킷 주입은 Training OBD-II 포트에서 시작되는 경로로 표현합니다.",
      "OBD를 클릭하면 Gateway ECU까지 이어지는 경로를 함께 강조합니다.",
    ],
    activeModules: ["obd", "ids", "gateway"],
    route: ["obd", "ids", "gateway"],
  },
}

const defaultPreviewScenario: PreviewScenario = {
  title: "전체 CAN 토폴로지 미리보기",
  vehicleStatus: "정상 운영 중",
  busStatus: "전체 ECU 및 CAN Bus 프리뷰",
  effects: [
    "ECU를 클릭하면 관련 ECU와 CAN Bus만 남기고 프리뷰합니다.",
    "정상 명령 이벤트를 선택하면 같은 데이터가 Monitor, Inspector, 3D highlight에 동시에 반영됩니다.",
  ],
  activeModules: ecuModules.map((module) => module.id),
  route: [],
}

function offsetPoint(
  [x, y, z]: [number, number, number],
  [dx, dy, dz]: [number, number, number],
): [number, number, number] {
  return [x + dx, y + dy, z + dz]
}

function getModuleStem(module: EcuModule) {
  return [
    offsetPoint(module.anchorPosition, [0, 0.12, 0]),
    offsetPoint(module.anchorPosition, [0, 0.24, 0]),
    offsetPoint(module.position, [0, -0.06, 0]),
  ] satisfies [number, number, number][]
}

function getConnectionKey({ from, to }: BusConnection) {
  return `${from}->${to}`
}

const validConnectionKeys = new Set(busConnections.map(getConnectionKey))

function routeToConnectionKeys(route: EcuModuleId[]) {
  if (route.length < 2) return []

  const keys: string[] = []
  for (let index = 0; index < route.length - 1; index += 1) {
    const direct = `${route[index]}->${route[index + 1]}`
    const reverse = `${route[index + 1]}->${route[index]}`
    if (validConnectionKeys.has(direct)) {
      keys.push(direct)
      continue
    }
    if (validConnectionKeys.has(reverse)) {
      keys.push(reverse)
    }
  }

  return Array.from(new Set(keys))
}

function getBusRoute(from: EcuModule, to: EcuModule) {
  const start = offsetPoint(from.position, [0.16, 0.1, 0])
  const apexY = Math.max(from.position[1], to.position[1]) + 0.16
  const midX = (from.position[0] + to.position[0]) / 2
  const midZ = (from.position[2] + to.position[2]) / 2

  return [
    start,
    [midX, apexY, midZ],
    offsetPoint(to.position, [0, 0.1, 0]),
  ] satisfies [number, number, number][]
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  const time = date.toLocaleTimeString("ko-KR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  return `${time}.${String(date.getMilliseconds()).padStart(3, "0")}`
}

function formatData(data: string[]) {
  return data.join(" ")
}

function getNodeLabel(nodeId?: EcuModuleId) {
  return nodeId ? CAN_NODE_LABELS[nodeId] : "-"
}

function getEventUi(event: CanEvent | null) {
  if (!event?.context.command) return null
  return CAN_COMMAND_CATALOG[event.context.command]
}

function getVisualizationFromEvent(event: CanEvent | null): PreviewScenario | null {
  const definition = getEventUi(event)
  if (!definition) return null

  const activeModules = Array.from(
    new Set(
      [
        definition.context.source,
        definition.context.target,
        ...(definition.context.route ?? []),
        definition.monitoring.idsObserved ? "ids" : null,
      ].filter((value): value is EcuModuleId => value !== null),
    ),
  )

  return {
    title: definition.ui.title,
    vehicleStatus: definition.ui.vehicleStatus,
    busStatus: definition.ui.busStatus,
    effects: definition.ui.effects,
    activeModules,
    route: definition.context.route,
  }
}

function getFrameSummary(event: CanEvent) {
  return {
    time: formatTime(event.timestamp),
    source: getNodeLabel(event.context.source),
    canId: event.frame.canId,
    dlc: String(event.frame.dlc),
    data: formatData(event.frame.data),
    target: getNodeLabel(event.context.target),
  }
}

function VehicleModel({ xray }: { xray: boolean }) {
  const gltf = useGLTF(MODEL_PATH)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useMemo(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return

      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false

      if (!xray) return

      const mechanical = /TIRE|WHEEL|BRAKE|CALIPER|STEER/i.test(mesh.name)
      const setXrayMaterial = (material: THREE.Material) => {
        const next = material.clone()
        next.transparent = true
        next.opacity = mechanical ? 0.72 : 0.4
        next.depthWrite = false
        next.side = THREE.DoubleSide
        if ("color" in next && next.color instanceof THREE.Color) {
          next.color.lerp(new THREE.Color("#a8bac8"), 0.72)
        }
        next.needsUpdate = true
        return next
      }

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(setXrayMaterial)
        : setXrayMaterial(mesh.material)
    })
  }, [scene, xray])

  return <primitive object={scene} />
}

function EcuBoard({
  module,
  selected,
  onSelect,
}: {
  module: EcuModule
  selected: boolean
  onSelect: (id: EcuModuleId) => void
}) {
  const connectorPositions = [-0.14, -0.07, 0, 0.07, 0.14]
  const isGateway = module.role === "gateway"
  const boardWidth = isGateway ? 0.56 : 0.44
  const boardDepth = isGateway ? 0.34 : 0.28
  const panelWidth = isGateway ? 0.46 : 0.37
  const panelDepth = isGateway ? 0.26 : 0.21
  const chipWidth = isGateway ? 0.16 : 0.13
  const chipDepth = isGateway ? 0.1 : 0.084

  return (
    <group position={module.position} rotation={[0, module.rotation, 0]} onClick={() => onSelect(module.id)}>
      {selected && (
        <mesh position={[0, 0.048, 0]}>
          <boxGeometry args={[boardWidth + 0.08, 0.03, boardDepth + 0.08]} />
          <meshStandardMaterial
            color={module.tone}
            emissive={module.tone}
            emissiveIntensity={0.52}
            transparent
            opacity={0.72}
          />
        </mesh>
      )}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[boardWidth, 0.08, boardDepth]} />
        <meshStandardMaterial
          color={isGateway ? "#1f2437" : "#172131"}
          roughness={0.56}
          metalness={0.55}
        />
      </mesh>
      <mesh position={[0, 0.058, 0]} castShadow>
        <boxGeometry args={[panelWidth, 0.035, panelDepth]} />
        <meshStandardMaterial
          color={isGateway ? "#2956a1" : "#2c8b75"}
          roughness={0.44}
          metalness={0.22}
          emissive={isGateway ? "#17305d" : "#103d35"}
          emissiveIntensity={isGateway ? 0.42 : 0.28}
        />
      </mesh>
      <mesh position={[0.02, 0.092, 0.005]} castShadow>
        <boxGeometry args={[chipWidth, 0.027, chipDepth]} />
        <meshStandardMaterial color="#10151f" roughness={0.42} metalness={0.64} />
      </mesh>
      <mesh position={[-0.12, 0.084, -0.045]}>
        <boxGeometry args={[0.075, 0.018, 0.052]} />
        <meshStandardMaterial color={module.tone} emissive={module.tone} emissiveIntensity={0.36} />
      </mesh>
      {connectorPositions.map((x) => (
        <mesh key={x} position={[x, 0.024, 0.152]}>
          <boxGeometry args={[0.026, 0.038, 0.026]} />
          <meshStandardMaterial color="#d59b4d" roughness={0.42} metalness={0.68} />
        </mesh>
      ))}
    </group>
  )
}

function EcuLabel({
  module,
  selected,
  onSelect,
}: {
  module: EcuModule
  selected: boolean
  onSelect: (id: EcuModuleId) => void
}) {
  return (
    <group position={module.position}>
      <Html position={module.labelOffset} center distanceFactor={7.8} sprite>
        <div
          className={`canlab__ecu-marker canlab__ecu-marker--${module.role}${selected ? " is-selected" : ""}`}
          style={{ transform: `translate(${module.labelShift[0]}px, ${module.labelShift[1]}px)` }}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(module.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onSelect(module.id)
            }
          }}
        >
          <strong>{module.label}</strong>
          <span>{module.detail}</span>
        </div>
      </Html>
    </group>
  )
}

function EcuVehicleNetwork({
  showLabels,
  showHardware,
  showBus,
  active,
  activeConnections,
  activeModules,
  selectedModuleId,
  onSelectModule,
}: {
  showLabels: boolean
  showHardware: boolean
  showBus: boolean
  active: boolean
  activeConnections: string[]
  activeModules: EcuModuleId[]
  selectedModuleId: EcuModuleId | null
  onSelectModule: (id: EcuModuleId) => void
}) {
  const modulesById = Object.fromEntries(
    ecuModules.map((module) => [module.id, module]),
  ) as Record<EcuModuleId, EcuModule>

  return (
    <group>
      {ecuModules.map((module) => {
        const visible = activeModules.length === 0 || activeModules.includes(module.id)
        const emphasized = visible && (selectedModuleId === module.id || activeModules.includes(module.id))

        return (
          <group key={module.id}>
            {visible && showLabels && (
              <EcuLabel module={module} selected={selectedModuleId === module.id} onSelect={onSelectModule} />
            )}
            {visible && showHardware && (
              <>
                <Line
                  points={getModuleStem(module)}
                  color={module.tone}
                  transparent
                  opacity={emphasized ? 0.96 : 0.42}
                  lineWidth={emphasized ? 1.1 : 0.8}
                />
                <mesh position={module.anchorPosition}>
                  <sphereGeometry args={[0.032, 12, 12]} />
                  <meshStandardMaterial
                    color={module.tone}
                    emissive={module.tone}
                    emissiveIntensity={emphasized ? 1.35 : 0.7}
                  />
                </mesh>
                <EcuBoard module={module} selected={selectedModuleId === module.id} onSelect={onSelectModule} />
              </>
            )}
          </group>
        )
      })}
      {showBus && (
        <>
          {busConnections.map(({ from, to }) => {
            const fromModule = modulesById[from]
            const toModule = modulesById[to]
            const route = getBusRoute(fromModule, toModule)
            const highlighted = activeConnections.includes(getConnectionKey({ from, to }))

            return (
              <group key={`bus-${from}-${to}`}>
                <Line
                  points={route}
                  color={highlighted ? "#7dff4d" : "#59d9ef"}
                  transparent
                  opacity={highlighted ? 1 : 0.26}
                  lineWidth={highlighted ? 4.8 : 0.7}
                />
                <Line
                  points={route.map(([x, y, z]) => [x + 0.028, y - 0.025, z])}
                  color={highlighted ? "#d9ff66" : toModule.tone}
                  transparent
                  opacity={highlighted ? 0.98 : 0.18}
                  lineWidth={highlighted ? 3.3 : 0.35}
                />
                <Line
                  points={route.map(([x, y, z]) => [x + 0.014, y - 0.012, z])}
                  color={highlighted ? "#f4ff8a" : "#ffffff"}
                  transparent
                  opacity={highlighted ? 0.92 : 0}
                  lineWidth={highlighted ? 1.5 : 0}
                />
              </group>
            )
          })}
          <mesh position={active ? [0.52, 0.91, -0.34] : [0.52, 0.91, 0.05]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial
              color={active ? "#ff8a5b" : "#5be2f2"}
              emissive={active ? "#ff5a32" : "#0ea5b7"}
              emissiveIntensity={1.1}
            />
          </mesh>
        </>
      )}
    </group>
  )
}

class VehicleLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Recoverable model-load failure remains isolated to the viewport.
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <div className="canlab__model-error" role="alert">
            <Warning size={20} weight="fill" />
            <strong>GLB를 불러오지 못했습니다.</strong>
            <button type="button" onClick={() => window.location.reload()}>
              다시 시도
            </button>
          </div>
        </Html>
      )
    }

    return this.props.children
  }
}

function VehicleCanvas({
  autoRotate,
  orbitCommand,
  showLabels,
  showBus,
  networkActive,
  activeConnections,
  activeModules,
  selectedModuleId,
  onSelectModule,
}: {
  autoRotate: boolean
  orbitCommand: { id: number; angle: number }
  showLabels: boolean
  showBus: boolean
  networkActive: boolean
  activeConnections: string[]
  activeModules: EcuModuleId[]
  selectedModuleId: EcuModuleId | null
  onSelectModule: (id: EcuModuleId) => void
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  useEffect(() => {
    if (orbitCommand.id === 0 || !controlsRef.current) return
    const controls = controlsRef.current
    const offset = controls.object.position.clone().sub(controls.target)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitCommand.angle)
    controls.object.position.copy(controls.target.clone().add(offset))
    controls.update()
  }, [orbitCommand])

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [5.8, 3.8, 7.6], fov: 38, near: 0.05, far: 100 }}
      gl={{
        alpha: false,
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
      }}
    >
      <color attach="background" args={["#0b1018"]} />
      <fog attach="fog" args={["#0b1018", 7, 14]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#c9dcff", "#05070d", 0.72]} />
      <directionalLight
        castShadow
        position={[6, 8, 5]}
        intensity={2.35}
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight position={[-5, 4, -3]} angle={0.52} penumbra={0.72} intensity={1.2} color="#b3c9ff" />
      <VehicleLoadBoundary>
        <Suspense
          fallback={
            <Html center>
              <div className="canlab__model-loading" role="status">
                <CircleNotch size={18} className="canlab__spin" />
                GLB 불러오는 중
              </div>
            </Html>
          }
        >
          <Bounds fit observe margin={0.9}>
            <Center>
              <group>
                <VehicleModel xray={showLabels || showBus} />
                {(showLabels || showBus) && (
                  <EcuVehicleNetwork
                    showLabels={showLabels}
                    showHardware={showBus}
                    showBus={showBus}
                    active={networkActive}
                    activeConnections={activeConnections}
                    activeModules={activeModules}
                    selectedModuleId={selectedModuleId}
                    onSelectModule={onSelectModule}
                  />
                )}
              </group>
            </Center>
          </Bounds>
        </Suspense>
      </VehicleLoadBoundary>
      <OrbitControls
        ref={controlsRef}
        autoRotate={autoRotate}
        autoRotateSpeed={0.64}
        enableDamping={false}
        enablePan={false}
        minDistance={3}
        maxDistance={10}
        minPolarAngle={0.32}
        maxPolarAngle={Math.PI - 0.32}
      />
    </Canvas>
  )
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return reducedMotion
}

function LocalShellTerminal({
  clearSignal,
  onConnectionChange,
}: {
  clearSignal: number
  onConnectionChange: (status: TerminalConnectionStatus) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Xterm | null>(null)

  useEffect(() => {
    terminalRef.current?.clear()
  }, [clearSignal])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const terminal = new Xterm({
      allowTransparency: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"JetBrains Mono Variable", "Noto Sans KR Variable", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: "#0d1715",
        black: "#26342f",
        blue: "#8daaba",
        brightBlack: "#70817a",
        brightBlue: "#aabec9",
        brightCyan: "#9bc7be",
        brightGreen: "#a9c9ad",
        brightMagenta: "#c2b1c8",
        brightRed: "#d6a096",
        brightWhite: "#edf2ee",
        brightYellow: "#d9c494",
        cursor: "#d7e3db",
        cyan: "#78aaa0",
        foreground: "#d4ded7",
        green: "#86b393",
        magenta: "#aa9aae",
        red: "#c9857c",
        selectionBackground: "#324b44",
        white: "#c7d1cb",
        yellow: "#bfa86f",
      },
    })
    const fitAddon = new FitAddon()
    const decoder = new TextDecoder()
    let disposed = false

    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    terminalRef.current = terminal
    terminal.writeln("\x1b[38;2;153;171;163mCANLite local shell · 연결 중...\x1b[0m")

    const socket = new WebSocket(TERMINAL_WS_URL)
    socket.binaryType = "arraybuffer"

    const fitAndResize = () => {
      try {
        fitAddon.fit()
      } catch {
        return
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }))
      }
    }

    const inputSubscription = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }))
      }
    })
    const resizeObserver = new ResizeObserver(fitAndResize)
    resizeObserver.observe(mount)

    socket.onopen = () => {
      if (disposed) return
      onConnectionChange("connected")
      terminal.writeln("\x1b[38;2;132;183;157m로컬 Linux 셸에 연결되었습니다.\x1b[0m")
      fitAndResize()
      terminal.focus()
    }
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        terminal.write(event.data)
      } else {
        terminal.write(decoder.decode(new Uint8Array(event.data), { stream: true }))
      }
    }
    socket.onerror = () => {
      if (!disposed) onConnectionChange("offline")
    }
    socket.onclose = () => {
      if (disposed) return
      onConnectionChange("offline")
      terminal.writeln(
        "\r\n\x1b[38;2;206;145;130m연결이 끊겼습니다. 다른 터미널에서 pnpm terminal:server를 실행한 뒤 새로고침하세요.\x1b[0m",
      )
    }

    onConnectionChange("connecting")
    window.requestAnimationFrame(fitAndResize)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      inputSubscription.dispose()
      socket.close()
      terminal.dispose()
      if (terminalRef.current === terminal) terminalRef.current = null
    }
  }, [onConnectionChange])

  return <div className="canlab__shell-terminal" aria-label="로컬 Linux 터미널" ref={mountRef} />
}

useGLTF.preload(MODEL_PATH)

export default function CanPracticeOnlyPage() {
  const [activeStep, setActiveStep] = useState<GuideStep>("1")
  const [completedSteps, setCompletedSteps] = useState<GuideStep[]>([])
  const [activeTab, setActiveTab] = useState<ConsoleTab>("terminal")
  const [showLabels, setShowLabels] = useState(true)
  const [showBus, setShowBus] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [viewKey, setViewKey] = useState(0)
  const [orbitCommand, setOrbitCommand] = useState({ id: 0, angle: 0 })
  const [terminalStatus, setTerminalStatus] = useState<TerminalConnectionStatus>("connecting")
  const [terminalClearSignal, setTerminalClearSignal] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [previewModuleId, setPreviewModuleId] = useState<EcuModuleId | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [events, setEvents] = useState<CanEvent[]>([])
  const [guideOpen, setGuideOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 800,
  )
  const reducedMotion = useReducedMotion()

  const progress = Math.round((completedSteps.length / guideSteps.length) * 100)
  const selectedEvent = events.find((event) => event.eventId === selectedEventId) ?? null
  const previewScenario = previewModuleId ? previewScenarios[previewModuleId] : defaultPreviewScenario
  const eventVisualization = getVisualizationFromEvent(selectedEvent)
  const activeVisualization = eventVisualization ?? previewScenario
  const activeConnections = routeToConnectionKeys(activeVisualization.route)
  const monitorFrames = [...events].reverse()

  const quizScore = quizQuestions.filter(
    (question) => quizAnswers[question.id] === question.answer,
  ).length
  const quizPassed = quizSubmitted && quizScore === quizQuestions.length

  useEffect(() => {
    if (reducedMotion) setAutoRotate(false)
  }, [reducedMotion])

  const markStepCompleted = (step: GuideStep) => {
    setCompletedSteps((current) => (current.includes(step) ? current : [...current, step]))
  }

  const moveToNextStep = (step: GuideStep) => {
    const currentIndex = stepOrder.indexOf(step)
    const nextStep = stepOrder[currentIndex + 1]
    if (nextStep) setActiveStep(nextStep)
  }

  const completeStep = (step: GuideStep) => {
    if (step === "5") {
      setQuizSubmitted(false)
      setQuizAnswers({})
      setQuizOpen(true)
      return
    }

    markStepCompleted(step)
    moveToNextStep(step)
  }

  const submitQuiz = () => {
    setQuizSubmitted(true)
    if (quizQuestions.every((question) => quizAnswers[question.id] === question.answer)) {
      markStepCompleted("5")
      setQuizOpen(false)
    }
  }

  const emitCanEvent = (command: CanCommand) => {
    const event = mockEventProvider.emit(command)
    setEvents((current) => [...current, event])
    setSelectedEventId(event.eventId)
    setPreviewModuleId(null)
    setActiveTab("monitor")

    if (command === "DOOR_LOCK") {
      markStepCompleted("3-1")
    }
    if (command === "TRUNK_OPEN") {
      markStepCompleted("3-2")
    }
    if (command === "DASHBOARD_SYNC" || command === "DIAGNOSTIC_SESSION") {
      markStepCompleted("4")
    }
  }

  const handleSelectModule = (id: EcuModuleId) => {
    setSelectedEventId(null)
    setPreviewModuleId((current) => (current === id ? null : id))
  }

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId)
    setPreviewModuleId(null)
    setActiveTab("inspector")
  }

  const currentGuideStep = guideSteps.find((step) => step.id === activeStep)
  const inspectorEvent = selectedEvent
  const inspectorCatalogEntry = inspectorEvent?.frame.canId
    ? CAN_MESSAGE_CATALOG[inspectorEvent.frame.canId]
    : null

  return (
    <main className="canlab canlab--embedded" aria-label="정상 CAN 메시지 송수신 실습">
      <aside className="canlab__sidebar">
        <div className="canlab__brand">
          <strong>CANLite</strong>
          <span>LOCAL LAB</span>
        </div>
        <div className="canlab__side-progress" aria-label="학습 진행률">
          <i style={{ width: `${Math.max(progress, 25)}%` }} />
          <span>{progress}%</span>
        </div>
        <nav className="canlab__nav" aria-label="CAN 실습 탐색">
          <p>CAN 실습</p>
          <a className="is-active" href="#practice">
            <TerminalWindow size={18} />
            정상 CAN 송수신
          </a>
          <a href="#terminal" onClick={() => setActiveTab("terminal")}>
            <Code size={18} />
            명령 입력
          </a>
          <a href="#monitor" onClick={() => setActiveTab("monitor")}>
            <Monitor size={18} />
            CAN Monitor
          </a>
          <a href="#topology">
            <Network size={18} />
            ECU 맵
          </a>
        </nav>
        <div className="canlab__side-note">
          <Keyboard size={18} />
          <p>
            <strong>Mock Event Adapter</strong>
            현재는 FastAPI 미연동 상태라 아래 Terminal 영역의 Mock 명령이 이벤트 생성기 역할을 합니다.
          </p>
        </div>
      </aside>

      <section className="canlab__shell" id="practice">
        <header className="canlab__header">
          <div className="canlab__crumb">
            <span>홈</span>
            <CaretRight size={13} />
            <span>CAN 실습</span>
            <CaretRight size={13} />
            <strong>정상 CAN 메시지 송수신</strong>
          </div>
          <div className="canlab__header-status">
            <span>
              <i /> 프론트엔드 프리뷰
            </span>
            <button type="button" aria-label="실습 메뉴">
              <List size={19} />
            </button>
          </div>
        </header>

        <div className="canlab__layout">
          <section className="canlab__workbench" aria-label="CAN 실습 작업 영역">
            <section className="canlab__vehicle-panel">
              <div className="canlab__panel-bar">
                <div>
                  <span>Vehicle Viewport</span>
                  <small>RIDGEX · V7.01 GLB</small>
                </div>
                <div className="canlab__vehicle-controls" aria-label="차량 보기 제어">
                  <button
                    className={showLabels ? "is-active" : ""}
                    type="button"
                    aria-pressed={showLabels}
                    onClick={() => setShowLabels((value) => !value)}
                  >
                    <Eye size={14} /> ECU Name
                  </button>
                  <button
                    className={showBus ? "is-active" : ""}
                    type="button"
                    aria-pressed={showBus}
                    onClick={() => setShowBus((value) => !value)}
                  >
                    <Network size={14} /> CAN Bus
                  </button>
                  <button
                    className={autoRotate ? "is-active" : ""}
                    type="button"
                    aria-pressed={autoRotate}
                    disabled={reducedMotion}
                    onClick={() => setAutoRotate((value) => !value)}
                  >
                    <Play size={13} weight="fill" /> {reducedMotion ? "회전 없음" : "회전"}
                  </button>
                  <button type="button" onClick={() => setViewKey((value) => value + 1)}>
                    <ArrowClockwise size={15} /> Reset View
                  </button>
                </div>
              </div>

              <div className="canlab__vehicle-stage">
                <VehicleCanvas
                  autoRotate={autoRotate && !reducedMotion}
                  orbitCommand={orbitCommand}
                  showLabels={showLabels}
                  showBus={showBus}
                  networkActive={Boolean(activeConnections.length)}
                  activeConnections={activeConnections}
                  activeModules={activeVisualization.activeModules}
                  selectedModuleId={previewModuleId}
                  onSelectModule={handleSelectModule}
                  key={viewKey}
                />
                <div className="canlab__vehicle-badge">
                  <Cube size={14} /> 교육용 Toy Car · GLB
                </div>
                <div className="canlab__orbit-buttons" aria-label="모델 회전">
                  <button
                    type="button"
                    aria-label="모델을 왼쪽으로 회전"
                    onClick={() =>
                      setOrbitCommand((state) => ({
                        id: state.id + 1,
                        angle: -Math.PI / 9,
                      }))
                    }
                  >
                    <ArrowCounterClockwise size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="모델을 오른쪽으로 회전"
                    onClick={() =>
                      setOrbitCommand((state) => ({
                        id: state.id + 1,
                        angle: Math.PI / 9,
                      }))
                    }
                  >
                    <ArrowClockwise size={16} />
                  </button>
                </div>
                <div className="canlab__vehicle-actions" aria-live="polite">
                  <strong>{activeVisualization.title}</strong>
                  <ul>
                    {activeVisualization.effects.map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                  </ul>
                </div>
                <div className="canlab__vehicle-state canlab__vehicle-state--dynamic">
                  <i /> {activeVisualization.vehicleStatus}
                </div>
              </div>
            </section>

            <section className="canlab__console" id="terminal" aria-label="CAN 터미널">
              <div className="canlab__tabs" id="monitor" role="tablist" aria-label="실습 결과 보기">
                {consoleTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    aria-selected={activeTab === id}
                    aria-controls={`canlab-panel-${id}`}
                    className={activeTab === id ? "is-active" : ""}
                    id={`canlab-tab-${id}`}
                    key={id}
                    onClick={() => setActiveTab(id)}
                    role="tab"
                    type="button"
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              {activeTab === "terminal" && (
                <div
                  aria-labelledby="canlab-tab-terminal"
                  className="canlab__terminal-pane"
                  id="canlab-panel-terminal"
                  role="tabpanel"
                >
                  <div className="canlab__console-toolbar">
                    <strong>Terminal</strong>
                    <span className={`canlab__terminal-status is-${terminalStatus}`}>
                      <i />
                      {terminalStatus === "connected"
                        ? "로컬 Linux 셸 연결됨"
                        : terminalStatus === "connecting"
                          ? "로컬 Linux 셸 연결 중"
                          : "로컬 Linux 셸 오프라인"}
                    </span>
                    <button type="button" onClick={() => setTerminalClearSignal((value) => value + 1)}>
                      화면 비우기
                    </button>
                  </div>

                  <LocalShellTerminal
                    clearSignal={terminalClearSignal}
                    onConnectionChange={setTerminalStatus}
                  />

                  <div className="canlab__mock-commands">
                    <div className="canlab__mock-commands-head">
                      <strong>내부 제어 / 외부 진단</strong>
                      <span>FastAPI 연동 전에는 아래 버튼이 공통 CAN Event를 생성합니다.</span>
                    </div>
                    <div className="canlab__mock-command-grid">
                      {NORMAL_CAN_COMMANDS.map((command) => {
                        const definition = CAN_COMMAND_CATALOG[command]
                        return (
                          <button
                            key={command}
                            type="button"
                            className="canlab__mock-command"
                            onClick={() => emitCanEvent(command)}
                          >
                            <strong>{definition.label}</strong>
                            <code>{definition.terminalCommand}</code>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "monitor" && (
                <div
                  aria-labelledby="canlab-tab-monitor"
                  className="canlab__data-pane"
                  id="canlab-panel-monitor"
                  role="tabpanel"
                >
                  <div>
                    <strong>vcan0 Recent Frames</strong>
                    <span>{activeVisualization.busStatus}</span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Source</th>
                        <th>CAN ID</th>
                        <th>DLC</th>
                        <th>DATA</th>
                        <th>Target ECU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitorFrames.map((event) => {
                        const frame = getFrameSummary(event)
                        return (
                          <tr
                            key={event.eventId}
                            className={`canlab__monitor-row${selectedEventId === event.eventId ? " is-selected" : ""}`}
                            onClick={() => handleSelectEvent(event.eventId)}
                          >
                            <td>{frame.time}</td>
                            <td>{frame.source}</td>
                            <td>{frame.canId}</td>
                            <td>{frame.dlc}</td>
                            <td>{frame.data}</td>
                            <td>{frame.target}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {monitorFrames.length === 0 && (
                    <p className="canlab__empty-state">
                      아직 생성된 CAN Event가 없습니다. Terminal 탭의 Mock 명령을 실행해 이벤트를 추가하세요.
                    </p>
                  )}
                </div>
              )}

              {activeTab === "inspector" && (
                <div
                  aria-labelledby="canlab-tab-inspector"
                  className="canlab__data-pane canlab__inspector-pane"
                  id="canlab-panel-inspector"
                  role="tabpanel"
                >
                  {inspectorEvent ? (
                    <>
                      <div>
                        <strong>Frame {inspectorEvent.frame.canId}</strong>
                        <span>{getEventUi(inspectorEvent)?.ui.title ?? "Selected CAN Event"}</span>
                      </div>
                      <div className="canlab__inspector-section">
                        <h3>CAN Frame</h3>
                        <dl>
                          <div><dt>CAN ID</dt><dd>{inspectorEvent.frame.canId}</dd></div>
                          <div><dt>DLC</dt><dd>{inspectorEvent.frame.dlc}</dd></div>
                          <div><dt>DATA</dt><dd>{formatData(inspectorEvent.frame.data)}</dd></div>
                          <div><dt>Channel</dt><dd>{inspectorEvent.channel}</dd></div>
                        </dl>
                      </div>
                      <div className="canlab__inspector-section">
                        <h3>Simulation Context</h3>
                        <dl>
                          <div><dt>Source</dt><dd>{getNodeLabel(inspectorEvent.context.source)}</dd></div>
                          <div><dt>Target</dt><dd>{getNodeLabel(inspectorEvent.context.target)}</dd></div>
                          <div><dt>Route</dt><dd>{inspectorEvent.context.route?.map(getNodeLabel).join(" -> ") ?? "-"}</dd></div>
                          <div><dt>Meaning</dt><dd>{inspectorEvent.context.meaning ?? "-"}</dd></div>
                          <div><dt>Action</dt><dd>{inspectorEvent.context.action ?? inspectorCatalogEntry?.action ?? "-"}</dd></div>
                        </dl>
                      </div>
                      <div className="canlab__inspector-section">
                        <h3>Processing</h3>
                        <dl>
                          <div><dt>Filter</dt><dd>{inspectorEvent.processing?.filterResult ?? "-"}</dd></div>
                          <div><dt>Result</dt><dd>{inspectorEvent.processing?.executionResult ?? "-"}</dd></div>
                          <div><dt>IDS</dt><dd>{inspectorEvent.monitoring?.status ?? "NOT_MONITORED"}</dd></div>
                          <div><dt>Origin</dt><dd>{inspectorEvent.origin}</dd></div>
                        </dl>
                      </div>
                    </>
                  ) : (
                    <div className="canlab__inspector-placeholder">
                      <strong>선택된 CAN Event가 없습니다.</strong>
                      <p>
                        Terminal에서 이벤트를 생성하거나 CAN Monitor에서 행을 클릭하면 같은 Event 객체를 기준으로
                        Inspector와 3D highlight가 함께 바뀝니다.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </section>

          <aside className="canlab__guide" aria-label="실습 안내">
            <button
              type="button"
              className="canlab__guide-top"
              aria-expanded={guideOpen}
              onClick={() => setGuideOpen((value) => !value)}
            >
              <span>
                <strong>정상 CAN 메시지 송수신(중앙 집중형 게이트웨이 아키텍처)</strong>
                <small>다음 단계 · {currentGuideStep?.title}</small>
              </span>
              <CaretDown size={16} />
            </button>

            <div className="canlab__guide-body" hidden={!guideOpen}>
              <div className="canlab__guide-progress">
                <span>진행률</span>
                <b>{progress}%</b>
                <i><em style={{ width: `${progress}%` }} /></i>
              </div>

              <section className="canlab__objectives">
                <h1>학습 목표</h1>
                <ol>
                  <li>하나의 CAN Event가 Monitor, Inspector, 3D 경로 강조에 공통으로 반영되는 구조를 이해한다.</li>
                  <li>정상 프레임의 CAN ID, DLC, DATA를 확인한다.</li>
                  <li>어떤 ECU에서 어떤 ECU로 전달되는지 3D 차량 경로에서 확인한다.</li>
                </ol>
              </section>

              <section className="canlab__steps" aria-label="단계별 지시사항">
                <h2>단계별 지시사항</h2>
                {guideSteps.map((step) => {
                  const done = completedSteps.includes(step.id)
                  const current = activeStep === step.id && !done

                  return (
                    <article className={current ? "is-current" : done ? "is-done" : ""} key={step.id}>
                      <button type="button" onClick={() => setActiveStep(step.id)}>
                        <span>{done ? <Check size={13} weight="bold" /> : step.label}</span>
                        <strong>{step.title}</strong>
                        <CaretRight size={14} />
                      </button>
                      {current && step.id !== "5" && (
                        <div>
                          <p>{step.body}</p>
                          <small>성공 조건: 같은 Event가 Monitor, Inspector, 3D highlight에 공통으로 반영됩니다.</small>
                          <button type="button" onClick={() => completeStep(step.id)}>
                            단계 완료 <CaretRight size={13} weight="bold" />
                          </button>
                        </div>
                      )}
                      {current && step.id === "5" && (
                        <div>
                          <p>{step.body}</p>
                          <small>퀴즈 2문제를 모두 맞히면 마지막 단계가 완료됩니다.</small>
                          <button type="button" onClick={() => completeStep(step.id)}>
                            퀴즈 시작 <CaretRight size={13} weight="bold" />
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })}
              </section>

              <section className="canlab__status-box">
                <h2>현재 상태</h2>
                <dl>
                  <div><dt>차량 상태</dt><dd>{activeVisualization.vehicleStatus}</dd></div>
                  <div><dt>CAN Bus</dt><dd>{activeVisualization.busStatus}</dd></div>
                </dl>
              </section>

              <section className="canlab__hint">
                <h2>힌트</h2>
                <button type="button" aria-expanded={hintOpen} onClick={() => setHintOpen((value) => !value)}>
                  {hintOpen ? "힌트 숨기기" : "힌트 보기 (-10점)"}
                </button>
                {hintOpen && (
                  <p>
                    먼저 <code>ip link show vcan0</code>와 <code>candump vcan0</code>를 떠올린 뒤, 실제 연동 전에는
                    Mock Event 버튼이 그 흐름을 대신한다고 보면 됩니다.
                  </p>
                )}
              </section>

              {quizOpen && (
                <section className="canlab__quiz-popup" role="dialog" aria-modal="true" aria-labelledby="canlab-quiz-title">
                  <div className="canlab__quiz-card">
                    <div className="canlab__quiz-header">
                      <strong id="canlab-quiz-title">5단계 마무리 퀴즈</strong>
                      <button type="button" onClick={() => setQuizOpen(false)}>
                        닫기
                      </button>
                    </div>
                    <div className="canlab__quiz-body">
                      {quizQuestions.map((question, index) => (
                        <fieldset key={question.id} className="canlab__quiz-question">
                          <legend>{index + 1}. {question.prompt}</legend>
                          {question.options.map((option) => (
                            <label key={option}>
                              <input
                                type="radio"
                                name={question.id}
                                checked={quizAnswers[question.id] === option}
                                onChange={() =>
                                  setQuizAnswers((current) => ({
                                    ...current,
                                    [question.id]: option,
                                  }))
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <div className="canlab__quiz-footer">
                      {quizSubmitted && (
                        <p className={quizPassed ? "is-success" : "is-warning"}>
                          {quizPassed
                            ? "정답입니다. 5단계가 완료되었습니다."
                            : `정답 ${quizScore}/${quizQuestions.length}. 다시 확인해보세요.`}
                        </p>
                      )}
                      <button type="button" onClick={submitQuiz}>
                        퀴즈 제출
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
