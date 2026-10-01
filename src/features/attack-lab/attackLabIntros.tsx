import type { LabIntroContent } from "../lab-layout/LabIntro"
import { VEHICLE_ROUTES, VEHICLE_TOPOLOGY_BY_ID } from "../vehicle/vehicleTopology"
import { ATTACK_LAB_LEARNING, type AttackLabLearningScenario } from "./attackLabLearning"
import {
  BEGINNER_CAN_ATTACK_CONFIG,
  DOOR_ATTACK_HINTS,
  DOOR_ATTACK_STAGES,
} from "./attackLabScenarioData"

// 설명 화면의 학습 목표는 새로 쓰지 않고, 실습 단계 안내(attackLabLearning)의 핵심 단계 목적을 그대로 쓴다.
const OBJECTIVE_STAGE_INDEXES: Record<AttackLabLearningScenario, readonly number[]> = {
  door: [2, 3, 5],
  spoofing: [1, 2, 3],
  replay: [1, 2, 3],
}

function objectivesFor(scenario: AttackLabLearningScenario) {
  const stages = ATTACK_LAB_LEARNING[scenario].stages
  return OBJECTIVE_STAGE_INDEXES[scenario].map((index) => stages[index].purpose)
}

function routeLabels(routeId: keyof typeof VEHICLE_ROUTES) {
  return VEHICLE_ROUTES[routeId].map((id) => VEHICLE_TOPOLOGY_BY_ID.get(id)?.label ?? id)
}

function StageNotes({ stages, extra }: { stages: readonly string[]; extra: string }) {
  return (
    <>
      <p>
        <strong>진행 단계</strong> · 실습 화면 위쪽 단계 표시와 오른쪽 “현재 단계” 안내가 함께 바뀝니다.
      </p>
      <ol>
        {stages.map((stage) => (
          <li key={stage}>{stage}</li>
        ))}
      </ol>
      <p>{extra}</p>
    </>
  )
}

const SANDBOX_NOTE =
  "모든 명령은 격리된 Toy ECU와 virtual CAN에서만 처리됩니다. 실제 host shell이나 차량에는 연결되지 않습니다."

export const DOOR_ATTACK_INTRO: LabIntroContent = {
  kicker: "BLACK-BOX CAN · 격리된 Toy ECU 실습",
  title: "Door Attack Workbench",
  description:
    "관찰한 증거로 메시지 계약을 추론하고 왼쪽 문 상태 프레임을 검증합니다. 단순 Replay가 왜 거부되는지 확인한 뒤, 관찰한 규칙으로 프레임 시퀀스를 직접 구성합니다.",
  flowLabel: "ATTACK PATH",
  flow: routeLabels("door"),
  flowNote:
    "공격 프레임은 교육용 OBD 진입점에서 Toy IDS와 Gateway를 지나 Body ECU에 도달합니다. 화면의 위치는 교육용 논리 위치이며 실제 OEM 배치가 아닙니다.",
  objectives: objectivesFor("door"),
  facts: [
    { label: "Target", value: "BODY ECU" },
    { label: "Effect", value: "LEFT DOOR" },
    { label: "Stages", value: `${DOOR_ATTACK_STAGES.length}단계` },
    { label: "Hints", value: `${DOOR_ATTACK_HINTS.length}개` },
  ],
  notes: <StageNotes stages={DOOR_ATTACK_STAGES} extra={SANDBOX_NOTE} />,
}

export function beginnerAttackIntro(scenario: "spoofing" | "replay"): LabIntroContent {
  const config = BEGINNER_CAN_ATTACK_CONFIG[scenario]
  return {
    kicker: "CAN ATTACK BASICS · 격리된 Toy ECU 실습",
    title: config.title,
    description: config.definition,
    flowLabel: "ATTACK PATH",
    flow: routeLabels(config.routeId),
    flowNote: `${config.targetSummary} → ${config.effectSummary}. ${config.objective}`,
    objectives: objectivesFor(scenario),
    facts: [
      { label: "Target", value: config.targetSummary },
      { label: "Effect", value: config.effectSummary },
      { label: "Stages", value: `${config.stages.length}단계` },
      { label: "Lab", value: "Toy ECU / virtual CAN" },
    ],
    notes: <StageNotes stages={config.stages} extra={SANDBOX_NOTE} />,
  }
}
