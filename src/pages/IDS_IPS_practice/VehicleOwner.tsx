import { useMemo, useRef } from "react"
import { useFrame, type ThreeElements } from "@react-three/fiber"
import * as THREE from "three"

export type OwnerReaction = "idle" | "confused-1" | "confused-2" | "angry"
export type VehicleOwnerProps = Pick<ThreeElements["group"], "position" | "rotation" | "scale"> & { ownerReaction: OwnerReaction }

/*
 * 코드로 만든 차주 캐릭터. 발바닥이 y=0, 키는 약 1.55 단위다.
 * 관절(목·어깨·팔꿈치·고관절·무릎)을 그룹으로 나누고, 반응마다 목표 자세를 계산한 뒤
 * 매 프레임 부드럽게 따라가게 해서 사람처럼 자연스럽게 바뀌도록 했다.
 *  - idle: 숨쉬기, 체중 이동, 눈 깜빡임, 주위 둘러보기
 *  - confused-1: 트렁크 쪽을 돌아보며 머리를 긁적임
 *  - confused-2: 손바닥을 위로 들고 어깨를 으쓱, 고개를 갸웃·저음
 *  - angry: 얼굴이 붉어지고 눈썹을 찌푸린 채 주먹을 흔들며 소리치고 발을 구름
 */

const SKIN = "#e7b58f"
const SKIN_ANGRY = "#d9675a"
const HAIR = "#3a2a20"
const SHIRT = "#4f7fae"
const PANTS = "#2c3442"
const SHOE = "#1b1d22"

interface Pose {
  rootY: number
  lean: number
  twist: number
  shrug: number
  breathe: number
  headYaw: number
  headTilt: number
  headPitch: number
  lShoulder: [number, number, number]
  rShoulder: [number, number, number]
  lElbow: number
  rElbow: number
  lHip: number
  rHip: number
  lKnee: number
  rKnee: number
  lBrow: [number, number]
  rBrow: [number, number]
  eyeOpen: number
  smile: number
  mouthOpen: number
  flush: number
  fist: number
}

function blinkAt(t: number) {
  // 3.7초마다 0.14초 동안 감는다.
  const phase = t % 3.7
  return phase < 0.14 ? Math.abs(Math.cos((phase / 0.14) * Math.PI)) : 1
}

function targetPose(reaction: OwnerReaction, t: number): Pose {
  const blink = blinkAt(t)
  const idleBreathe = Math.sin(t * 1.7)

  if (reaction === "confused-1") {
    const scratch = Math.sin(t * 13)
    return {
      rootY: 0,
      lean: 0.02,
      twist: 0.5,
      shrug: 0,
      breathe: idleBreathe,
      headYaw: 0.55 + 0.05 * Math.sin(t * 0.9),
      headTilt: 0.22,
      headPitch: -0.05,
      lShoulder: [0.05, 0, 0.14],
      lElbow: -0.25,
      rShoulder: [-2.55 + 0.05 * scratch, 0, -0.55 + 0.06 * scratch],
      rElbow: -1.85,
      lHip: 0,
      rHip: 0,
      lKnee: 0,
      rKnee: 0.12,
      lBrow: [0.006, 0.05],
      rBrow: [0.016, -0.18],
      eyeOpen: blink,
      smile: -0.15,
      mouthOpen: 0.12,
      flush: 0,
      fist: 0.2,
    }
  }

  if (reaction === "confused-2") {
    const shrugCycle = Math.max(0, Math.sin(t * 2.2))
    return {
      rootY: 0,
      lean: -0.02,
      twist: 0.12 * Math.sin(t * 0.7),
      shrug: 0.035 * shrugCycle,
      breathe: idleBreathe,
      headYaw: 0.28 * Math.sin(t * 3.1),
      headTilt: 0.12,
      headPitch: 0.04,
      lShoulder: [-0.35, 0, 0.42 + 0.08 * shrugCycle],
      lElbow: -1.45,
      rShoulder: [-0.35, 0, -0.42 - 0.08 * shrugCycle],
      rElbow: -1.45,
      lHip: 0,
      rHip: 0,
      lKnee: 0.06,
      rKnee: 0,
      lBrow: [0.016, -0.12],
      rBrow: [0.016, 0.12],
      eyeOpen: Math.min(blink, 1.08),
      smile: -0.3,
      mouthOpen: 0.38,
      flush: 0.15,
      fist: 0,
    }
  }

  if (reaction === "angry") {
    const shake = Math.sin(t * 9.5)
    const yell = 0.55 + 0.25 * Math.sin(t * 7.3)
    // 1.3초 주기로 왼발을 들었다가 쾅 내려찍는다.
    const stompPhase = (t % 1.3) / 1.3
    const lift = stompPhase < 0.32 ? Math.sin((stompPhase / 0.32) * Math.PI) : 0
    const impact = stompPhase >= 0.32 && stompPhase < 0.42 ? 1 - (stompPhase - 0.32) / 0.1 : 0
    const pant = Math.sin(t * 6)
    return {
      rootY: 0.03 * lift - 0.012 * impact,
      lean: 0.16 + 0.03 * shake,
      twist: -0.1,
      shrug: 0.03,
      breathe: pant * 1.6,
      headYaw: 0.06 * Math.sin(t * 4),
      headTilt: -0.04,
      headPitch: 0.12 + 0.05 * shake,
      // 두 주먹을 가슴 앞에서 번갈아 흔든다.
      lShoulder: [-0.6 + 0.22 * shake, 0, 0.32],
      lElbow: -1.95,
      rShoulder: [-0.6 - 0.22 * shake, 0, -0.32],
      rElbow: -1.95,
      lHip: -0.75 * lift,
      rHip: 0,
      lKnee: 1.15 * lift,
      rKnee: 0.04,
      lBrow: [-0.01, -0.45],
      rBrow: [-0.01, 0.45],
      eyeOpen: 0.62 * blink + 0.05,
      smile: -1,
      mouthOpen: yell,
      flush: 1,
      fist: 1,
    }
  }

  const look = Math.sin(t * 0.33)
  return {
    rootY: 0,
    lean: 0.02,
    twist: 0.05 * Math.sin(t * 0.25),
    shrug: 0,
    breathe: idleBreathe,
    headYaw: 0.22 * look,
    headTilt: 0.04 * Math.sin(t * 0.5),
    headPitch: 0,
    lShoulder: [0.04 + 0.03 * Math.sin(t * 0.8), 0, 0.12],
    lElbow: -0.18,
    rShoulder: [0.04 - 0.03 * Math.sin(t * 0.8), 0, -0.12],
    rElbow: -0.18,
    lHip: 0,
    rHip: 0,
    lKnee: 0.05 + 0.04 * Math.max(0, Math.sin(t * 0.4)),
    rKnee: 0.05 + 0.04 * Math.max(0, -Math.sin(t * 0.4)),
    lBrow: [0, 0],
    rBrow: [0, 0],
    eyeOpen: blink,
    smile: 0.3,
    mouthOpen: 0,
    flush: 0,
    fist: 0,
  }
}

function damp(current: number, target: number, rate: number, dt: number) {
  return THREE.MathUtils.damp(current, target, rate, dt)
}

function dampPose(current: Pose, target: Pose, dt: number) {
  const rate = 7
  for (const key of Object.keys(target) as (keyof Pose)[]) {
    const value = target[key]
    if (Array.isArray(value)) {
      const arr = current[key] as number[]
      value.forEach((v, i) => {
        arr[i] = damp(arr[i], v, rate, dt)
      })
    } else {
      ;(current[key] as number) = damp(current[key] as number, value as number, rate, dt)
    }
  }
}

function clonePose(pose: Pose): Pose {
  return JSON.parse(JSON.stringify(pose)) as Pose
}

/** 관절 아래로 늘어진 팔다리 한 마디. 그룹 원점이 관절이다. */
function Segment({ length, radius, color }: { length: number; radius: number; color: string }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.001, length - radius * 2), 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  )
}

function OwnerModel({ ownerReaction }: Pick<VehicleOwnerProps, "ownerReaction">) {
  const pose = useRef<Pose>(clonePose(targetPose("idle", 0)))
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const chest = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const lShoulder = useRef<THREE.Group>(null)
  const rShoulder = useRef<THREE.Group>(null)
  const lElbow = useRef<THREE.Group>(null)
  const rElbow = useRef<THREE.Group>(null)
  const lHand = useRef<THREE.Mesh>(null)
  const rHand = useRef<THREE.Mesh>(null)
  const lHip = useRef<THREE.Group>(null)
  const rHip = useRef<THREE.Group>(null)
  const lKnee = useRef<THREE.Group>(null)
  const rKnee = useRef<THREE.Group>(null)
  const lBrow = useRef<THREE.Mesh>(null)
  const rBrow = useRef<THREE.Mesh>(null)
  const lEye = useRef<THREE.Group>(null)
  const rEye = useRef<THREE.Group>(null)
  const mouth = useRef<THREE.Mesh>(null)
  const mouthInner = useRef<THREE.Mesh>(null)
  const cheeks = useRef<THREE.Group>(null)

  const faceMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.65 }),
    [],
  )
  const handMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }),
    [],
  )
  const cheekMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c2413a", transparent: true, opacity: 0, roughness: 1 }),
    [],
  )
  const skin = useMemo(() => new THREE.Color(SKIN), [])
  const skinAngry = useMemo(() => new THREE.Color(SKIN_ANGRY), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const t = state.clock.elapsedTime
    const p = pose.current
    dampPose(p, targetPose(ownerReaction, t), dt)

    root.current?.position.set(0, p.rootY, 0)
    if (torso.current) {
      torso.current.rotation.set(p.lean, p.twist, 0)
      torso.current.position.y = 0.8 + p.shrug * 0.3
    }
    chest.current?.scale.set(1.12 + 0.012 * p.breathe, 1 + 0.01 * p.breathe, 0.72 + 0.02 * p.breathe)
    head.current?.rotation.set(p.headPitch, p.headYaw, p.headTilt)
    lShoulder.current?.rotation.set(...p.lShoulder)
    rShoulder.current?.rotation.set(...p.rShoulder)
    if (lShoulder.current) lShoulder.current.position.y = 0.43 + p.shrug
    if (rShoulder.current) rShoulder.current.position.y = 0.43 + p.shrug
    lElbow.current?.rotation.set(p.lElbow, 0, 0)
    rElbow.current?.rotation.set(p.rElbow, 0, 0)
    const fistScale = 1 - 0.18 * p.fist
    lHand.current?.scale.set(0.8 * (1 + 0.1 * p.fist), 1.1 * fistScale, 0.55 + 0.25 * p.fist)
    rHand.current?.scale.set(0.8 * (1 + 0.1 * p.fist), 1.1 * fistScale, 0.55 + 0.25 * p.fist)
    lHip.current?.rotation.set(p.lHip, 0, 0.02)
    rHip.current?.rotation.set(p.rHip, 0, -0.02)
    lKnee.current?.rotation.set(p.lKnee, 0, 0)
    rKnee.current?.rotation.set(p.rKnee, 0, 0)
    if (lBrow.current) {
      lBrow.current.position.y = 0.052 + p.lBrow[0]
      lBrow.current.rotation.z = p.lBrow[1]
    }
    if (rBrow.current) {
      rBrow.current.position.y = 0.052 + p.rBrow[0]
      rBrow.current.rotation.z = p.rBrow[1]
    }
    const eyeY = Math.max(0.08, p.eyeOpen)
    lEye.current?.scale.set(1, eyeY, 1)
    rEye.current?.scale.set(1, eyeY, 1)
    // 위로 볼록(∩) = 찡그림, 아래로 볼록(∪) = 웃음. 입을 벌리면 안쪽 어두운 부분이 커진다.
    mouth.current?.scale.set(1 + 0.15 * p.mouthOpen, -p.smile * 0.9 || 0.05, 1)
    mouthInner.current?.scale.set(1 + 0.2 * p.mouthOpen, Math.max(0.05, p.mouthOpen), 1)
    faceMaterial.color.copy(skin).lerp(skinAngry, p.flush * 0.55)
    cheekMaterial.opacity = 0.55 * p.flush
    if (cheeks.current) cheeks.current.visible = p.flush > 0.02
  })

  return (
    <group ref={root}>
      {/* 다리: 고관절 → 무릎 → 신발 */}
      {([
        [-0.085, lHip, lKnee],
        [0.085, rHip, rKnee],
      ] as const).map(([x, hip, knee]) => (
        <group key={x} ref={hip} position={[x, 0.79, 0]}>
          <Segment length={0.39} radius={0.076} color={PANTS} />
          <group ref={knee} position={[0, -0.39, 0]}>
            <Segment length={0.35} radius={0.062} color={PANTS} />
            {/* 신발: 윗부분 + 밑창 */}
            <mesh position={[0, -0.36, 0.04]} scale={[1, 0.75, 1.9]} castShadow>
              <sphereGeometry args={[0.058, 16, 10]} />
              <meshStandardMaterial color={SHOE} roughness={0.55} />
            </mesh>
            <mesh position={[0, -0.395, 0.04]} castShadow>
              <boxGeometry args={[0.1, 0.02, 0.24]} />
              <meshStandardMaterial color="#d9d4cc" roughness={0.9} />
            </mesh>
          </group>
        </group>
      ))}

      {/* 골반 */}
      <mesh position={[0, 0.8, 0]} scale={[1.12, 0.55, 0.78]} castShadow>
        <sphereGeometry args={[0.15, 20, 14]} />
        <meshStandardMaterial color={PANTS} roughness={0.85} />
      </mesh>

      {/* 상체: 허리를 중심으로 숙이고 비튼다 */}
      <group ref={torso} position={[0, 0.8, 0]}>
        <mesh ref={chest} position={[0, 0.25, 0]} castShadow>
          <capsuleGeometry args={[0.15, 0.2, 8, 16]} />
          <meshStandardMaterial color={SHIRT} roughness={0.85} />
        </mesh>
        {/* 어깨선: 목에서 어깨로 완만하게 내려오는 면 */}
        <mesh position={[0, 0.38, -0.005]} scale={[1.62, 0.3, 0.74]} castShadow>
          <sphereGeometry args={[0.12, 24, 14]} />
          <meshStandardMaterial color={SHIRT} roughness={0.85} />
        </mesh>
        {/* 허리띠와 셔츠 깃 */}
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.128, 0.014, 6, 24]} />
          <meshStandardMaterial color="#3a2b1f" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.465, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.055, 0.016, 6, 16]} />
          <meshStandardMaterial color="#e9eef4" roughness={0.8} />
        </mesh>
        {/* 목 */}
        <mesh position={[0, 0.5, 0]} material={faceMaterial} castShadow>
          <cylinderGeometry args={[0.042, 0.048, 0.08, 12]} />
        </mesh>

        {/* 머리 */}
        <group ref={head} position={[0, 0.54, 0]}>
          <group position={[0, 0.11, 0]}>
            <mesh scale={[0.95, 1.15, 1]} material={faceMaterial} castShadow>
              <sphereGeometry args={[0.1, 28, 20]} />
            </mesh>
            {/* 머리카락: 정수리를 덮는 반구 + 뒤통수 */}
            <mesh position={[0, 0.02, -0.008]} scale={[1, 1.15, 1.04]}>
              <sphereGeometry args={[0.104, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.46]} />
              <meshStandardMaterial color={HAIR} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.01, -0.035]} scale={[0.98, 1.05, 0.8]}>
              <sphereGeometry args={[0.1, 20, 14]} />
              <meshStandardMaterial color={HAIR} roughness={0.9} />
            </mesh>
            {/* 귀 */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.094, -0.005, -0.005]} scale={[0.35, 0.75, 0.55]} material={faceMaterial}>
                <sphereGeometry args={[0.03, 10, 8]} />
              </mesh>
            ))}
            {/* 코 */}
            <mesh position={[0, -0.012, 0.1]} scale={[0.75, 1, 1.15]} material={faceMaterial}>
              <sphereGeometry args={[0.016, 10, 8]} />
            </mesh>
            {/* 눈: 흰자 + 눈동자, 그룹 세로 크기로 깜빡임/찡그림 */}
            {([
              [-0.036, lEye],
              [0.036, rEye],
            ] as const).map(([x, ref]) => (
              <group key={x} ref={ref} position={[x, 0.018, 0.084]}>
                <mesh scale={[1, 0.8, 0.6]}>
                  <sphereGeometry args={[0.017, 14, 10]} />
                  <meshStandardMaterial color="#f7f7f2" roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, 0.009]}>
                  <sphereGeometry args={[0.0095, 12, 8]} />
                  <meshStandardMaterial color="#2a1c14" roughness={0.2} />
                </mesh>
              </group>
            ))}
            {/* 눈썹 */}
            <mesh ref={lBrow} position={[-0.037, 0.052, 0.094]}>
              <boxGeometry args={[0.042, 0.009, 0.01]} />
              <meshStandardMaterial color={HAIR} />
            </mesh>
            <mesh ref={rBrow} position={[0.037, 0.052, 0.094]}>
              <boxGeometry args={[0.042, 0.009, 0.01]} />
              <meshStandardMaterial color={HAIR} />
            </mesh>
            {/* 입: 입술 곡선 + 벌린 입 안쪽 */}
            <mesh ref={mouthInner} position={[0, -0.05, 0.088]} scale={[1, 0.05, 1]}>
              <sphereGeometry args={[0.018, 14, 10]} />
              <meshStandardMaterial color="#5a1f1f" roughness={0.6} />
            </mesh>
            <mesh ref={mouth} position={[0, -0.052, 0.094]}>
              <torusGeometry args={[0.02, 0.0035, 6, 16, Math.PI]} />
              <meshStandardMaterial color="#8c3b36" roughness={0.6} />
            </mesh>
            {/* 화났을 때 붉어지는 볼 */}
            <group ref={cheeks} visible={false}>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.055, -0.022, 0.078]} scale={[1, 0.6, 0.4]} material={cheekMaterial}>
                  <sphereGeometry args={[0.022, 10, 8]} />
                </mesh>
              ))}
            </group>
          </group>
        </group>

        {/* 팔: 어깨 → 팔꿈치 → 손 */}
        {([
          [-0.19, lShoulder, lElbow, lHand],
          [0.19, rShoulder, rElbow, rHand],
        ] as const).map(([x, shoulder, elbow, hand]) => (
          <group key={x} ref={shoulder} position={[x, 0.43, 0]}>
            <Segment length={0.28} radius={0.05} color={SHIRT} />
            <group ref={elbow} position={[0, -0.28, 0]}>
              <Segment length={0.13} radius={0.042} color={SHIRT} />
              <mesh position={[0, -0.18, 0]} material={handMaterial} castShadow>
                <cylinderGeometry args={[0.034, 0.03, 0.11, 10]} />
              </mesh>
              <mesh ref={hand} position={[0, -0.27, 0]} scale={[0.8, 1.1, 0.55]} material={handMaterial} castShadow>
                <sphereGeometry args={[0.042, 14, 10]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

export default function VehicleOwner(props: VehicleOwnerProps) {
  const { position, rotation, scale, ownerReaction } = props
  return <group position={position} rotation={rotation} scale={scale}><OwnerModel ownerReaction={ownerReaction} /></group>
}
