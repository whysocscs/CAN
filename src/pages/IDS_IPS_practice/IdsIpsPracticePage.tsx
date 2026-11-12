import CounterStatusCheckIDSPage from "./CounterStatusCheckIDSPage"
import PeriodBasedIDSPage from "./PeriodBasedIDSPage"
import RuleBasedIDSPage from "./RuleBasedIDSPage"

export type IdsIpsScenario = "rule-based" | "period-based" | "counter-status"

export default function IdsIpsPracticePage({ scenario }: { scenario: IdsIpsScenario }) {
  if (scenario === "period-based") return <PeriodBasedIDSPage />
  if (scenario === "counter-status") return <CounterStatusCheckIDSPage />
  return <RuleBasedIDSPage />
}
