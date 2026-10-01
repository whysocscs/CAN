import CanPracticeOnlyPage from "@/pages/CanPracticeOnlyPage"

export type IdsIpsScenario = "rule-based" | "period-based" | "counter-status"

const titles: Record<IdsIpsScenario, string> = {
  "rule-based": "Rule-based IDS",
  "period-based": "Period-based IDS",
  "counter-status": "Counter/Status Check IDS",
}

export default function IdsIpsPracticePage({ scenario }: { scenario: IdsIpsScenario }) {
  return (
    <>
      <h1 className="sr-only">{titles[scenario]}</h1>
      <CanPracticeOnlyPage idsScenario={scenario} title={titles[scenario]} />
    </>
  )
}
