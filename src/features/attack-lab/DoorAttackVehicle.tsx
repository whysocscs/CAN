import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { Canvas } from "@react-three/fiber"
import {
  Bounds,
  Center,
  Html,
  Line,
  OrbitControls,
  useGLTF,
} from "@react-three/drei"
import { CircleNotch, Warning } from "@phosphor-icons/react"
import * as THREE from "three"
import { useVehicleRig } from "../vehicle/useVehicleRig"

const MODEL_PATH = "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"
const BODY_ECU_POSITION: [number, number, number] = [0.67, 0.73, -0.54]
const LEFT_DOOR_POSITION: [number, number, number] = [-0.9, 0.78, 0.69]

function VehicleModel({ immediate }: { immediate: boolean }) {
  const gltf = useGLTF(MODEL_PATH)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useVehicleRig(scene, { immediate })

  useEffect(() => {
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

function TargetMarker({
  position,
  label,
  detail,
  tone,
  kind,
}: {
  position: [number, number, number]
  label: string
  detail: string
  tone: string
  kind: "body" | "door"
}) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.055, 18, 18]} />
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          emissiveIntensity={1.4}
        />
      </mesh>
      <Html position={[0, 0.34, 0]} center distanceFactor={7.2} sprite>
        <div
          className={`door-attack-vehicle__marker door-attack-vehicle__marker--${kind}`}
          style={{ "--marker-tone": tone } as React.CSSProperties}
        >
          <strong>{label}</strong>
          <span>{detail}</span>
        </div>
      </Html>
    </group>
  )
}

function VehicleScene({ immediate }: { immediate: boolean }) {
  return (
    <Bounds fit clip observe margin={0.72}>
      <Center>
        <group rotation={[0, -0.22, 0]}>
          <VehicleModel immediate={immediate} />
          <Line
            points={[BODY_ECU_POSITION, LEFT_DOOR_POSITION]}
            color="#dc4f4f"
            lineWidth={1.4}
            transparent
            opacity={0.7}
          />
          <TargetMarker
            position={BODY_ECU_POSITION}
            label="Toy Body ECU"
            detail="교육용 논리 ECU 위치"
            tone="#d94b4b"
            kind="body"
          />
          <TargetMarker
            position={LEFT_DOOR_POSITION}
            label="Left Door"
            detail="차량 시각화 대상"
            tone="#2563eb"
            kind="door"
          />
        </group>
      </Center>
    </Bounds>
  )
}

class VehicleErrorBoundary extends Component<{ children: ReactNode }, {
  failed: boolean
}> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The rest of the lab remains usable when the visualization cannot load.
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <div className="door-attack-vehicle__status" role="alert">
            <Warning size={18} weight="fill" aria-hidden="true" />
            GLB 차량 시각화를 불러오지 못했습니다.
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}

export default function DoorAttackVehicle() {
  const reducedMotion = useReducedMotion()

  return (
    <div
      className="door-attack-vehicle"
      role="region"
      aria-label="Toy Vehicle 3D view"
    >
      <Canvas
        shadows="basic"
        dpr={[1, 1.5]}
        camera={{ position: [5.6, 3.1, 7.2], fov: 34, near: 0.05, far: 100 }}
        gl={{
          alpha: false,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
      >
        <color attach="background" args={["#eef2f7"]} />
        <ambientLight intensity={1.05} />
        <hemisphereLight args={["#f8fbff", "#c7d0da", 1.1]} />
        <directionalLight
          castShadow
          position={[6, 8, 5]}
          intensity={2.6}
          shadow-mapSize={[2048, 2048]}
        />
        <spotLight
          position={[-5, 4, -3]}
          angle={0.55}
          penumbra={0.75}
          intensity={0.9}
          color="#8daee8"
        />
        <VehicleErrorBoundary>
          <Suspense
            fallback={
              <Html center>
                <div className="door-attack-vehicle__status" role="status">
                  <CircleNotch
                    size={18}
                    className="door-attack-lab__spin"
                    aria-hidden="true"
                  />
                  GLB 불러오는 중
                </div>
              </Html>
            }
          >
            <VehicleScene immediate={reducedMotion} />
          </Suspense>
        </VehicleErrorBoundary>
        <OrbitControls
          enableDamping={!reducedMotion}
          dampingFactor={0.075}
          enablePan={false}
          minDistance={2.8}
          maxDistance={10}
          minPolarAngle={0.42}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
      <p>드래그: 회전 · 스크롤: 확대/축소</p>
    </div>
  )
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return reducedMotion
}
