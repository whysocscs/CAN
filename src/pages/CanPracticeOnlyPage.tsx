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
import {
  Bounds,
  Center,
  Html,
  Line,
  OrbitControls,
  useGLTF,
} from "@react-three/drei"
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

const MODEL_PATH = "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"

type GuideStep = 1 | 2 | 3 | 4
type ConsoleTab = "terminal" | "monitor" | "inspector"
type TerminalConnectionStatus = "connecting" | "connected" | "offline"

const TERMINAL_WS_URL =
  import.meta.env.VITE_TERMINAL_WS_URL ?? "ws://127.0.0.1:8010/ws/terminal"

const steps: Array<{ id: GuideStep; title: string; body: string }> = [
  {
    id: 1,
    title: "가상 CAN 상태 확인",
    body: '명령 입력창에 "ip link show vcan0"를 실행해 보세요.',
  },
  {
    id: 2,
    title: "CAN 메시지 수신 시작",
    body: "candump vcan0으로 수신 준비 상태를 확인합니다.",
  },
  {
    id: 3,
    title: "Door Lock 메시지 송신",
    body: "cansend vcan0 101#01 명령으로 잠금 프레임을 보냅니다.",
  },
  {
    id: 4,
    title: "CAN Monitor에서 확인",
    body: "수신 프레임과 Body ECU의 반응을 확인합니다.",
  },
]

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
  id: string
  label: string
  detail: string
  position: [number, number, number]
  labelOffset: [number, number, number]
  labelShift: [number, number]
  rotation: number
  tone: string
}

const ecuModules: EcuModule[] = [
  {
    id: "obd",
    label: "Training OBD-II",
    detail: "Driver footwell",
    position: [0.55, 0.69, 1.08],
    labelOffset: [0.18, 0.3, 0.12],
    labelShift: [116, -58],
    rotation: -0.1,
    tone: "#4ee4db",
  },
  {
    id: "dashboard",
    label: "Dashboard ECU",
    detail: "Instrument cluster",
    position: [0.35, 1.04, 0.74],
    labelOffset: [-0.18, 0.32, 0.08],
    labelShift: [-108, -90],
    rotation: 0.08,
    tone: "#8cc9ff",
  },
  {
    id: "gateway",
    label: "Gateway ECU",
    detail: "Centre tunnel · policy",
    position: [0.2, 0.72, 0.14],
    labelOffset: [0.1, 0.34, 0.1],
    labelShift: [-30, 4],
    rotation: -0.04,
    tone: "#ffba6b",
  },
  {
    id: "body",
    label: "Body ECU",
    detail: "B-pillar · door/signal",
    position: [0.67, 0.73, -0.54],
    labelOffset: [0.2, 0.29, 0.08],
    labelShift: [100, -98],
    rotation: 0.2,
    tone: "#a9e67f",
  },
  {
    id: "ids",
    label: "IDS ECU",
    detail: "Rear floor · rule engine",
    position: [0.27, 0.55, -0.84],
    labelOffset: [-0.18, 0.29, 0.08],
    labelShift: [-30, 100],
    rotation: -0.06,
    tone: "#ee8eb4",
  },
  {
    id: "rear",
    label: "Rear Module",
    detail: "Rear quarter · light/lock",
    position: [0.56, 0.6, -1.58],
    labelOffset: [0.13, 0.28, -0.12],
    labelShift: [-282, 72],
    rotation: 0.1,
    tone: "#8cc9ff",
  },
]

function VehicleModel({ xray }: { xray: boolean }) {
  const gltf = useGLTF(MODEL_PATH)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene, xray])

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

function EcuBoard({ module }: { module: EcuModule }) {
  const connectorPositions = [-0.14, -0.07, 0, 0.07, 0.14]

  return (
    <group position={module.position} rotation={[0, module.rotation, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.08, 0.28]} />
        <meshStandardMaterial color="#172131" roughness={0.56} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.058, 0]} castShadow>
        <boxGeometry args={[0.37, 0.035, 0.21]} />
        <meshStandardMaterial color="#2c8b75" roughness={0.44} metalness={0.22} emissive="#103d35" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[0.02, 0.092, 0.005]} castShadow>
        <boxGeometry args={[0.13, 0.027, 0.084]} />
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
      <Html position={module.labelOffset} center distanceFactor={7.8} sprite>
        <div
          className="canlab__ecu-marker"
          style={{ transform: `translate(${module.labelShift[0]}px, ${module.labelShift[1]}px)` }}
        >
          <strong>{module.label}</strong>
          <span>{module.detail}</span>
        </div>
      </Html>
    </group>
  )
}

function EcuVehicleNetwork({
  showModules,
  showBus,
  active,
}: {
  showModules: boolean
  showBus: boolean
  active: boolean
}) {
  const busPath: [number, number, number][] = ecuModules.map(({ position }) => [
    position[0],
    position[1] + 0.14,
    position[2],
  ])

  return (
    <group>
      {showModules && ecuModules.map((module) => <EcuBoard key={module.id} module={module} />)}
      {showBus && (
        <>
          <Line points={busPath} color="#59d9ef" transparent opacity={0.92} lineWidth={1.25} />
          <Line
            points={busPath.map(([x, y, z]) => [x + 0.028, y - 0.02, z])}
            color="#f59d6f"
            transparent
            opacity={0.72}
            lineWidth={0.8}
          />
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

class VehicleLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The UI keeps a recoverable message inside the viewport.
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
  showEcuMap,
  showBus,
  networkActive,
}: {
  autoRotate: boolean
  orbitCommand: { id: number; angle: number }
  showEcuMap: boolean
  showBus: boolean
  networkActive: boolean
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
      <spotLight
        position={[-5, 4, -3]}
        angle={0.52}
        penumbra={0.72}
        intensity={1.2}
        color="#b3c9ff"
      />
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
                <VehicleModel xray={showEcuMap || showBus} />
                {(showEcuMap || showBus) && (
                  <EcuVehicleNetwork
                    showModules={showEcuMap}
                    showBus={showBus}
                    active={networkActive}
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
    terminal.writeln("\x1b[38;2;153;171;163mCANLite local shell · 연결 중…\x1b[0m")

    const fitAndResize = () => {
      try {
        fitAddon.fit()
      } catch {
        return
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
        )
      }
    }

    const socket = new WebSocket(TERMINAL_WS_URL)
    socket.binaryType = "arraybuffer"
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

  return (
    <div
      className="canlab__shell-terminal"
      aria-label="실제 로컬 Linux 터미널"
      ref={mountRef}
    />
  )
}

export default function CanPracticeOnlyPage() {
  const [activeStep, setActiveStep] = useState<GuideStep>(1)
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
  const [guideOpen, setGuideOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 800,
  )
  const reducedMotion = useReducedMotion()

  const progress = Math.round((completedSteps.length / steps.length) * 100)

  useEffect(() => {
    if (reducedMotion) setAutoRotate(false)
  }, [reducedMotion])

  const completeStep = (step: GuideStep) => {
    setCompletedSteps((current) =>
      current.includes(step) ? current : [...current, step],
    )
    if (step < 4) setActiveStep((step + 1) as GuideStep)
  }

  return (
    <main className="canlab canlab--embedded" aria-label="CAN 정상 메시지 송수신 실습">
      <aside className="canlab__sidebar">
        <div className="canlab__brand">
          <strong>CANLite</strong>
          <span>LOCAL LAB</span>
        </div>
        <div className="canlab__side-progress" aria-label="실습 진행률">
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
            명령어 실습
          </a>
          <a href="#monitor" onClick={() => setActiveTab("monitor")}>
            <Monitor size={18} />
            CAN Monitor
          </a>
          <a href="#topology">
            <Network size={18} />
            ECU 흐름
          </a>
        </nav>
        <div className="canlab__side-note">
          <Keyboard size={18} />
          <p>
            <strong>로컬 프리뷰</strong>
            실제 vcan 연결은 백엔드를 붙인 뒤 활성화됩니다.
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
            <strong>정상 CAN 송수신</strong>
          </div>
          <div className="canlab__header-status">
            <span>
              <i /> 브라우저 프리뷰
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
                    <Eye size={14} /> ECU Map
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
                  <button
                    type="button"
                    onClick={() => setViewKey((value) => value + 1)}
                  >
                    <ArrowClockwise size={15} /> Reset View
                  </button>
                </div>
              </div>
              <div className="canlab__vehicle-stage">
                <VehicleCanvas
                  autoRotate={autoRotate && !reducedMotion}
                  orbitCommand={orbitCommand}
                  showEcuMap={showLabels}
                  showBus={showBus}
                  networkActive={completedSteps.length >= 3}
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
                <div className="canlab__vehicle-state">
                  <i /> Door Locked · 정상 상태
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
                    onClick={() => setActiveTab(id as ConsoleTab)}
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
                          ? "로컬 셸 연결 중"
                          : "로컬 셸 오프라인"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTerminalClearSignal((value) => value + 1)}
                    >
                      화면 비우기
                    </button>
                  </div>
                  <LocalShellTerminal
                    clearSignal={terminalClearSignal}
                    onConnectionChange={setTerminalStatus}
                  />
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
                    <strong>vcan0 · 최근 프레임</strong>
                    <span>교육용 표시 예시</span>
                  </div>
                  <table>
                    <thead>
                      <tr><th>시간</th><th>CAN ID</th><th>DLC</th><th>DATA</th><th>수신 ECU</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>00:00.218</td><td>0x101</td><td>1</td><td>01</td><td>Body ECU · Door Locked</td></tr>
                      <tr><td>00:00.104</td><td>0x201</td><td>2</td><td>3C 00</td><td>Dashboard ECU</td></tr>
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "inspector" && (
                <div
                  aria-labelledby="canlab-tab-inspector"
                  className="canlab__data-pane canlab__inspector-pane"
                  id="canlab-panel-inspector"
                  role="tabpanel"
                >
                  <div>
                    <strong>Frame 0x101</strong>
                    <span>정상 Door Lock 명령</span>
                  </div>
                  <dl>
                    <div><dt>CAN ID</dt><dd>0x101</dd></div>
                    <div><dt>Payload</dt><dd>01</dd></div>
                    <div><dt>대상</dt><dd>Body ECU</dd></div>
                    <div><dt>해석</dt><dd>Door Locked</dd></div>
                  </dl>
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
                <strong>정상 CAN 메시지 송수신</strong>
                <small>다음 단계 · {steps.find((step) => step.id === activeStep)?.title}</small>
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
                  <li>CAN 메시지가 어떤 ECU로 전달되는지 확인한다.</li>
                  <li>정상 프레임의 CAN ID와 Payload를 읽는다.</li>
                  <li>명령어와 3D ECU 흐름을 함께 관찰한다.</li>
                </ol>
              </section>
              <section className="canlab__steps" aria-label="단계별 지시사항">
                <h2>단계별 지시사항</h2>
                {steps.map((step) => {
                  const done = completedSteps.includes(step.id)
                  const current = activeStep === step.id && !done
                  return (
                    <article className={current ? "is-current" : done ? "is-done" : ""} key={step.id}>
                      <button type="button" onClick={() => setActiveStep(step.id)}>
                        <span>{done ? <Check size={13} weight="bold" /> : step.id}</span>
                        <strong>{step.title}</strong>
                        <CaretRight size={14} />
                      </button>
                      {current && (
                        <div>
                          <p>{step.body}</p>
                          <small>성공 조건: 화면 내 프리뷰 결과가 표시됩니다.</small>
                          <button type="button" onClick={() => completeStep(step.id)}>
                            단계 완료 <CaretRight size={13} weight="bold" />
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
                  <div><dt>차량 상태</dt><dd>정상 운영 중</dd></div>
                  <div><dt>CAN Bus</dt><dd>프리뷰 활성</dd></div>
                </dl>
              </section>
              <section className="canlab__hint">
                <h2>힌트</h2>
                <button type="button" aria-expanded={hintOpen} onClick={() => setHintOpen((value) => !value)}>
                  {hintOpen ? "힌트 숨기기" : "힌트 보기 (-10점)"}
                </button>
                {hintOpen && <p>먼저 <code>ip link show vcan0</code>를 실행한 뒤 CAN Monitor를 열어 보세요.</p>}
              </section>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
