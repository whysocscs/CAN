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
import {
  Bounds,
  Center,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei"
import {
  ArrowsOutSimple,
  ArrowCounterClockwise,
  ArrowClockwise,
  CheckCircle,
  Cube,
  Eye,
  MapPin,
  Play,
} from "@phosphor-icons/react"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import {
  useCanVehicleStream,
  useVehicleRig,
  useVehicleState,
  vehicle,
} from "../features/vehicle"

const MODEL_PATH = "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"

const mappingTargets = [
  ["Body ECU", "도어 · 조명 · 잠금 상태"],
  ["Gateway ECU", "CAN 버스 정책 경로"],
  ["Dashboard ECU", "속도 · 경고등 상태"],
  ["IDS ECU", "탐지 이벤트 위치"],
]

function VehicleModel() {
  const gltf = useGLTF(MODEL_PATH)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useVehicleRig(scene)

  useMemo(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
    })
  }, [scene])

  return <primitive object={scene} />
}

function VehicleControls() {
  const state = useVehicleState()
  // 백엔드가 떠 있으면 실제 CAN 프레임에도 반응합니다. 없으면 버튼만 동작합니다.
  const streamStatus = useCanVehicleStream()

  return (
    <>
      <span
        className="model-manager__stream-status"
        title={`CAN 스트림: ${streamStatus}`}
        aria-label={`CAN 스트림 ${streamStatus}`}
      >
        CAN {streamStatus === "open" ? "연결됨" : "오프라인"}
      </span>
      <button
        type="button"
        aria-pressed={state.doorL > 0.5 && state.doorR > 0.5}
        onClick={() => vehicle.toggleDoor()}
      >
        {state.doorL > 0.5 ? "문 닫기" : "문 열기"}
      </button>
      <button
        type="button"
        aria-pressed={state.tailgate > 0.5}
        onClick={() => vehicle.toggleTrunk()}
      >
        {state.tailgate > 0.5 ? "트렁크 닫기" : "트렁크 열기"}
      </button>
    </>
  )
}

function ModelLoading() {
  return (
    <Html center>
      <div className="model-manager__loading" role="status">
        GLB 불러오는 중
      </div>
    </Html>
  )
}

class ModelLoadErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The retry action remains available inside the 3D canvas.
  }

  render() {
    if (this.state.hasError) {
      return (
        <Html center>
          <div className="model-manager__load-error" role="alert">
            <strong>GLB 모델을 불러오지 못했습니다.</strong>
            <span>파일을 확인한 뒤 다시 시도해 주세요.</span>
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

function ModelCanvas({
  autoRotate,
  orbitCommand,
}: {
  autoRotate: boolean
  orbitCommand: { id: number; angle: number }
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
      camera={{ position: [5.8, 3.8, 7.6], fov: 38 }}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <ambientLight intensity={1.05} />
      <hemisphereLight args={["#e1f0e9", "#18251f", 1.15]} />
      <directionalLight castShadow position={[6, 8, 5]} intensity={3.05} shadow-mapSize={[2048, 2048]} />
      <spotLight position={[-5, 4, -3]} angle={0.52} penumbra={0.72} intensity={1.1} color="#90afa4" />
      <ModelLoadErrorBoundary>
        <Suspense fallback={<ModelLoading />}>
          <Bounds fit clip observe margin={1.18}>
            <Center>
              <VehicleModel />
            </Center>
          </Bounds>
        </Suspense>
      </ModelLoadErrorBoundary>
      <OrbitControls
        ref={controlsRef}
        autoRotate={autoRotate}
        autoRotateSpeed={0.7}
        enableDamping
        dampingFactor={0.075}
        enablePan={false}
        minDistance={1.3}
        maxDistance={20}
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

export default function ModelManagerPage() {
  const [autoRotate, setAutoRotate] = useState(false)
  const [viewKey, setViewKey] = useState(0)
  const [orbitCommand, setOrbitCommand] = useState({ id: 0, angle: 0 })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) setAutoRotate(false)
  }, [reducedMotion])

  return (
    <div className="model-manager">
      <header className="model-manager__header">
        <div>
          <h1>3D 모델 관리</h1>
          <p>
            현재 교육 화면에 사용할 RIDGEX 차량 모델입니다. 드래그하여 확인하고,
            이후 ECU 위치를 실제 GLB 노드에 연결할 수 있습니다.
          </p>
        </div>
        <span className="model-manager__status">
          <CheckCircle size={16} aria-hidden="true" />
          로컬 활성 모델
        </span>
      </header>

      <div className="model-manager__workspace">
        <section className="model-manager__viewer" aria-labelledby="active-model-title">
          <div className="model-manager__viewer-bar">
            <div>
              <span className="model-manager__micro-label">ACTIVE MODEL</span>
              <h2 id="active-model-title">RIDGEX · V7.01</h2>
            </div>
            <div className="model-manager__view-controls" aria-label="3D 모델 보기 제어">
              <button
                className={autoRotate ? "is-active" : ""}
                type="button"
                aria-pressed={autoRotate}
                disabled={reducedMotion}
                onClick={() => setAutoRotate((value) => !value)}
              >
                <Play size={15} weight="fill" aria-hidden="true" />
                {reducedMotion ? "자동 회전 꺼짐" : "자동 회전"}
              </button>
              <button
                type="button"
                aria-label="모델을 왼쪽으로 회전"
                onClick={() =>
                  setOrbitCommand((command) => ({
                    id: command.id + 1,
                    angle: -Math.PI / 9,
                  }))
                }
              >
                <ArrowCounterClockwise size={16} aria-hidden="true" />
                왼쪽 회전
              </button>
              <button
                type="button"
                aria-label="모델을 오른쪽으로 회전"
                onClick={() =>
                  setOrbitCommand((command) => ({
                    id: command.id + 1,
                    angle: Math.PI / 9,
                  }))
                }
              >
                <ArrowClockwise size={16} aria-hidden="true" />
                오른쪽 회전
              </button>
              <button
                type="button"
                onClick={() => setViewKey((value) => value + 1)}
              >
                <ArrowClockwise size={16} aria-hidden="true" />
                보기 초기화
              </button>
              <VehicleControls />
            </div>
          </div>

          <div
            className="model-manager__canvas"
            role="region"
            aria-label="RIDGEX 차량 GLB 3D 미리보기"
            aria-describedby="model-view-help"
          >
            <ModelCanvas
              autoRotate={autoRotate && !reducedMotion}
              orbitCommand={orbitCommand}
              key={viewKey}
            />
            <div className="model-manager__canvas-note" id="model-view-help">
              <ArrowsOutSimple size={16} aria-hidden="true" />
              드래그: 회전 · 스크롤: 확대/축소
            </div>
          </div>

          <footer className="model-manager__viewer-footer">
            <Cube size={17} aria-hidden="true" />
            <span className="model-manager__filename">RIDGEX_ROCKER_CLEANUP_V7_01.glb</span>
            <span>GLB · 4.0 MB</span>
          </footer>
        </section>

        <aside className="model-manager__details" aria-label="모델 연결 정보">
          <section className="model-manager__detail-section">
            <div className="model-manager__section-heading">
              <Eye size={18} aria-hidden="true" />
              <h2>현재 모델</h2>
            </div>
            <dl className="model-manager__metadata">
              <div>
                <dt>형식</dt>
                <dd>GLB</dd>
              </div>
              <div>
                <dt>버전</dt>
                <dd>V7.01</dd>
              </div>
              <div>
                <dt>상태</dt>
                <dd>브라우저에서 로드됨</dd>
              </div>
            </dl>
          </section>

          <section className="model-manager__detail-section">
            <div className="model-manager__section-heading">
              <MapPin size={18} aria-hidden="true" />
              <h2>ECU 노드 매핑</h2>
            </div>
            <p className="model-manager__mapping-intro">
              교육 실습에서 강조할 위치를 정하는 단계입니다. 현재는 모델만 연결되어 있습니다.
            </p>
            <ul className="model-manager__mapping-list">
              {mappingTargets.map(([name, description]) => (
                <li key={name}>
                  <div>
                    <strong>{name}</strong>
                    <span>{description}</span>
                  </div>
                  <small>매핑 대기</small>
                </li>
              ))}
            </ul>
          </section>

          <section className="model-manager__detail-section model-manager__scope">
            <h2>현재 범위</h2>
            <p>
              이 프리뷰는 업로드나 서버 저장 없이, 포함된 단일 GLB 파일을 교육 사이트에서 직접 읽습니다.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
