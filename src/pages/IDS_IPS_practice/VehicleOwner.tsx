import type { ThreeElements } from "@react-three/fiber"

export type OwnerReaction = "idle" | "confused-1" | "confused-2" | "angry"
export type VehicleOwnerProps = Pick<ThreeElements["group"], "position" | "rotation" | "scale"> & { ownerReaction: OwnerReaction }

/** Replace this function with useGLTF when a production owner asset is supplied. */
function OwnerModel({ ownerReaction }: Pick<VehicleOwnerProps, "ownerReaction">) {
  const confused = ownerReaction.startsWith("confused")
  const tilt = ownerReaction === "confused-2" ? 0.25 : ownerReaction === "confused-1" ? 0.12 : 0
  const angry = ownerReaction === "angry"
  const clothing = angry ? "#8b1e2d" : "#275d8d"
  return <group position={[0, 0.575, 0]} rotation={[0, 0, tilt]}>
    <mesh position={[0, 0.24, 0]} castShadow><capsuleGeometry args={[0.17, 0.55, 4, 8]} /><meshStandardMaterial color={clothing} /></mesh>
    <mesh position={[0, 0.8, 0]} castShadow><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color={angry ? "#e34b4b" : "#e8b48e"} emissive={angry ? "#651010" : "#000000"} /></mesh>
    <mesh position={[-0.13, -0.3, 0]} castShadow><cylinderGeometry args={[0.055, 0.065, 0.55, 8]} /><meshStandardMaterial color="#1f2937" /></mesh>
    <mesh position={[0.13, -0.3, 0]} castShadow><cylinderGeometry args={[0.055, 0.065, 0.55, 8]} /><meshStandardMaterial color="#1f2937" /></mesh>
    <mesh position={[-0.28, 0.27, 0]} rotation={[0, 0, confused ? 0.7 : 0.15]} castShadow><cylinderGeometry args={[0.04, 0.05, 0.48, 8]} /><meshStandardMaterial color={clothing} /></mesh>
    <mesh position={[0.28, 0.27, 0]} rotation={[0, 0, confused ? -0.7 : -0.15]} castShadow><cylinderGeometry args={[0.04, 0.05, 0.48, 8]} /><meshStandardMaterial color={clothing} /></mesh>
    {angry && <pointLight color="#ef4444" intensity={1.3} distance={2} />}
  </group>
}

export default function VehicleOwner(props: VehicleOwnerProps) {
  const { position, rotation, scale, ownerReaction } = props
  return <group position={position} rotation={rotation} scale={scale}><OwnerModel ownerReaction={ownerReaction} /></group>
}
