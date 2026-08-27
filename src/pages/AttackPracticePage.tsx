import { useApp, type Route } from "@/context/AppContext"
import BeginnerCanAttackLabPage from "@/features/attack-lab/BeginnerCanAttackLabPage"
import DoorAttackLabPage from "@/features/attack-lab/DoorAttackLabPage"

export type AttackRoute = Extract<Route, `attacks/${string}`>

interface AttackTab {
  route: AttackRoute
  label: string
}

const attackTabs: AttackTab[] = [
  { route: "attacks/chain", label: "전체 공격 체인" },
  { route: "attacks/spoofing", label: "Spoofing" },
  { route: "attacks/replay", label: "Replay" },
]

function ScenarioTabs({ current }: { current: AttackRoute }) {
  const { navigate } = useApp()

  return (
    <nav className="attack-preview__tabs" aria-label="공격 실습 선택">
      {attackTabs.map((tab) => (
        <button
          type="button"
          key={tab.route}
          className={tab.route === current ? "is-active" : undefined}
          aria-current={tab.route === current ? "page" : undefined}
          onClick={() => navigate(tab.route)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

export default function AttackPracticePage({ route }: { route: AttackRoute }) {
  const { completeItem } = useApp()

  if (route === "attacks/chain") {
    return (
      <main className="attack-preview attack-preview--door-lab">
        <ScenarioTabs current={route} />
        <DoorAttackLabPage onComplete={() => completeItem(route)} />
      </main>
    )
  }

  const scenario = route === "attacks/spoofing" ? "spoofing" : "replay"

  return (
    <main className="attack-preview attack-preview--door-lab">
      <ScenarioTabs current={route} />
      <BeginnerCanAttackLabPage
        key={route}
        scenario={scenario}
        onComplete={() => completeItem(route)}
      />
    </main>
  )
}
