interface AttackStageRailProps {
  stages: readonly string[]
  currentIndex: number
  className?: string
}

export default function AttackStageRail({
  stages,
  currentIndex,
  className,
}: AttackStageRailProps) {
  const activeIndex = Math.max(0, Math.min(currentIndex, stages.length - 1))
  return (
    <ol
      className={["door-attack-lab__stages", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="공격 단계"
      style={{ "--attack-stage-count": stages.length } as CSSProperties}
    >
      {stages.map((stage, index) => {
        const state =
          index < activeIndex
            ? "complete"
            : index === activeIndex
              ? "current"
              : "next"
        return (
          <li
            key={stage}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              data-testid="attack-stage-marker"
              className="door-attack-lab__stage-marker"
            >
              {index + 1}
            </span>
            {index < stages.length - 1 ? (
              <span
                data-testid="attack-stage-connector"
                className="door-attack-lab__stage-connector"
                aria-hidden="true"
              />
            ) : null}
            <strong className="door-attack-lab__stage-label">{stage}</strong>
          </li>
        )
      })}
    </ol>
  )
}
import type { CSSProperties } from "react"
