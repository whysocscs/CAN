import type { UserProgress } from "@/context/AppContext"

export type BadgeCategory = "course" | "attack"

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  category: BadgeCategory
  symbol: string
  isEarned: (progress: UserProgress) => boolean
}

export const badgeCatalog: BadgeDefinition[] = [
  {
    id: "course-can-basics",
    name: "CAN 기초 완료",
    description:
      "CAN 프로토콜, 프레임, ECU와 Gateway 과정을 모두 완료했습니다.",
    category: "course",
    symbol: "CAN",
    isEarned: (progress) =>
      progress.badges.some((badge) => badge.id === "course-can-basics") ||
      (progress.courseProgress["can-basics"] || 0) >= 100,
  },
  {
    id: "course-practice",
    name: "CAN 실습 완료",
    description: "정상 CAN 송수신과 CAN Frame 송신기 실습을 모두 완료했습니다.",
    category: "course",
    symbol: "LAB",
    isEarned: (progress) =>
      progress.badges.some((badge) => badge.id === "course-practice") ||
      (progress.courseProgress.practice || 0) >= 100,
  },
  {
    id: "course-attacks",
    name: "공격 실습 완료",
    description: "공격 실습의 세 가지 섹션을 모두 완료했습니다.",
    category: "course",
    symbol: "ATK",
    isEarned: (progress) =>
      progress.badges.some((badge) => badge.id === "course-attacks") ||
      (progress.courseProgress.attacks || 0) >= 100,
  },
  {
    id: "attack-chain",
    name: "공격 체인 분석가",
    description: "전체 공격 체인 실습을 완료했습니다.",
    category: "attack",
    symbol: "CHAIN",
    isEarned: (progress) => progress.completedItems.includes("attacks/chain"),
  },
  {
    id: "attack-spoofing",
    name: "Spoofing 추적자",
    description: "CAN Spoofing 실습을 완료했습니다.",
    category: "attack",
    symbol: "SPF",
    isEarned: (progress) =>
      progress.completedItems.includes("attacks/spoofing"),
  },
  {
    id: "attack-replay",
    name: "Replay 분석가",
    description: "CAN Replay 실습을 완료했습니다.",
    category: "attack",
    symbol: "RPL",
    isEarned: (progress) => progress.completedItems.includes("attacks/replay"),
  },
]
