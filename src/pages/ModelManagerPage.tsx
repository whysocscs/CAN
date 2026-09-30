import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { Html } from "@react-three/drei"
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
  VehicleModelSelector,
  useCanVehicleStream,
  useSelectedVehicleModel,
  useVehicleRig,
  useVehicleState,
  vehicle,
} from "../features/vehicle"
import {
  SharedVehicleCanvas,
  SharedVehicleOrbitControls,
  SharedVehicleOverviewController,
  SharedVehicleScene,
  useSharedVehicleClone,
} from "../features/vehicle/SharedVehicleScene"

const mappingTargets = [
  ["Body ECU", "도어 · 조명 · 잠금 상태"],
  ["Gateway ECU", "CAN 버스 정책 경로"],
  ["Dashboard ECU", "속도 · 경고등 상태"],
  ["IDS ECU", "탐지 이벤트 위치"],
  ["Rear ECU", "후방 센서 · 구동 상태"],
  ["OBD 인터페이스", "진단 · 실습 장치"],
]

function VehicleRigAttachment() {
  const scene = useSharedVehicleClone()
  useVehicleRig(scene)
  return null
}

function VehicleControls({
  supportsVehicleControls,
}: {
  supportsVehicleControls: boolean
}) {
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
      {supportsVehicleControls ? (
        <>
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
      ) : (
        <span className="model-manager__control-note">시각화 전용 모델</span>
      )}
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
  resetRevision,
  orbitCommand,
}: {
  autoRotate: boolean
  resetRevision: number
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
    <SharedVehicleCanvas>
      <ModelLoadErrorBoundary>
        <Suspense fallback={<ModelLoading />}>
          <SharedVehicleScene xray={false}>
            <VehicleRigAttachment />
            <SharedVehicleOverviewController resetRevision={resetRevision} />
          </SharedVehicleScene>
        </Suspense>
      </ModelLoadErrorBoundary>
      <SharedVehicleOrbitControls
        controlsRef={controlsRef}
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={0.7}
        enableDamping
        dampingFactor={0.075}
      />
    </SharedVehicleCanvas>
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
  const selectedModel = useSelectedVehicleModel()

  useEffect(() => {
    setViewKey((value) => value + 1)
    setOrbitCommand({ id: 0, angle: 0 })
  }, [selectedModel.id])

  useEffect(() => {
    if (reducedMotion) setAutoRotate(false)
  }, [reducedMotion])

  return (
    <div className="model-manager">
      <header className="model-manager__header">
        <div>
          <h1>3D 모델 관리</h1>
          <p>
            차량 모델을 선택해 3D 프리뷰로 확인할 수 있습니다. 드래그하여
            회전하고, 이후 ECU 위치를 실제 GLB 노드에 연결할 수 있습니다.
          </p>
        </div>
        <span className="model-manager__status">
          <CheckCircle size={16} aria-hidden="true" />
          로컬 활성 모델
        </span>
      </header>

      <div className="model-manager__workspace">
        <section
          className="model-manager__viewer"
          aria-labelledby="active-model-title"
        >
          <div className="model-manager__viewer-bar">
            <div>
              <span className="model-manager__micro-label">ACTIVE MODEL</span>
              <h2 id="active-model-title">{selectedModel.title}</h2>
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
              <VehicleControls
                supportsVehicleControls={selectedModel.supportsVehicleControls}
              />
            </div>
          </div>

          <div
            className="model-manager__canvas"
            role="region"
            aria-label={`${selectedModel.title} GLB 3D 미리보기`}
            aria-describedby="model-view-help"
          >
            <ModelCanvas
              key={`${selectedModel.id}-${viewKey}`}
              autoRotate={autoRotate && !reducedMotion}
              resetRevision={viewKey}
              orbitCommand={orbitCommand}
            />
            <div className="model-manager__canvas-note" id="model-view-help">
              <ArrowsOutSimple size={16} aria-hidden="true" />
              드래그: 회전 · 스크롤: 확대/축소
            </div>
          </div>

          <footer className="model-manager__viewer-footer">
            <Cube size={17} aria-hidden="true" />
            <span className="model-manager__filename">
              {selectedModel.fileName}
            </span>
            <span>GLB · {selectedModel.sizeLabel}</span>
          </footer>
        </section>

        <aside className="model-manager__details" aria-label="모델 연결 정보">
          <section className="model-manager__detail-section model-manager__selection-section">
            <div className="model-manager__section-heading">
              <Cube size={18} aria-hidden="true" />
              <h2>차량 모델 선택</h2>
            </div>
            <VehicleModelSelector />
            <p className="model-manager__selection-description">
              {selectedModel.description}
            </p>
          </section>

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
                <dd>{selectedModel.formatVersion}</dd>
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
              {selectedModel.id === "canlite-s3"
                ? "CANLite E04 ECU 킷의 GLB 노드를 차량 앵커에 연결했습니다."
                : "선택한 차량에는 CANLite E04 ECU 킷이 표시되지 않습니다."}
            </p>
            <ul className="model-manager__mapping-list">
              {mappingTargets.map(([name, description]) => (
                <li key={name}>
                  <div>
                    <strong>{name}</strong>
                    <span>{description}</span>
                  </div>
                  <small>
                    {selectedModel.id === "canlite-s3" ? "연결됨" : "대기"}
                  </small>
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
