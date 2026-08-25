import { CheckCircle, LockSimple, Medal } from "@phosphor-icons/react"
import { useApp } from "@/context/AppContext"
import { badgeCatalog, type BadgeCategory } from "@/features/badges/catalog"

const sections: Array<{
  category: BadgeCategory
  title: string
  description: string
}> = [
  {
    category: "course",
    title: "과정 완료 배지",
    description: "각 학습 과정을 100% 완료하면 획득합니다.",
  },
  {
    category: "attack",
    title: "공격 실습 배지",
    description: "공격 실습의 각 섹션을 완료할 때마다 하나씩 획득합니다.",
  },
]

export default function BadgePage() {
  const { progress } = useApp()
  const earnedCount = badgeCatalog.filter((badge) => badge.isEarned(progress)).length

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 40px 48px" }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Medal size={26} weight="duotone" aria-hidden="true" />
          <h1 style={{ margin: 0, fontSize: 22 }}>배지 컬렉션</h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          {earnedCount} / {badgeCatalog.length}개 획득
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.category} style={{ marginBottom: 30 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>{section.title}</h2>
          <p style={{ margin: "0 0 14px", color: "var(--text-secondary)", fontSize: 12 }}>
            {section.description}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            {badgeCatalog
              .filter((badge) => badge.category === section.category)
              .map((badge) => {
                const earned = badge.isEarned(progress)
                return (
                  <article
                    key={badge.id}
                    data-earned={earned}
                    style={{
                      padding: 18,
                      borderRadius: 12,
                      border: `1px solid ${earned ? "var(--brand-accent)" : "var(--border-default)"}`,
                      background: earned ? "var(--brand-accent-muted)" : "var(--surface-default)",
                      opacity: earned ? 1 : 0.68,
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        marginBottom: 12,
                        background: earned ? "var(--brand-accent)" : "var(--background-secondary)",
                        color: earned ? "white" : "var(--text-secondary)",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {badge.symbol}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {earned ? <CheckCircle size={16} weight="fill" /> : <LockSimple size={16} />}
                      <strong style={{ fontSize: 14 }}>{badge.name}</strong>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
                      {badge.description}
                    </p>
                  </article>
                )
              })}
          </div>
        </section>
      ))}
    </main>
  )
}
