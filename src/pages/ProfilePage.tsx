import { useMemo, useState, type FormEvent } from "react"
import { Check, PencilSimple, UserCircle } from "@phosphor-icons/react"
import { useApp } from "@/context/AppContext"
import { badgeCatalog } from "@/features/badges/catalog"

const STORAGE_KEY = "canlite.profile.v1"

interface LocalProfile {
  name: string
  bio: string
  featuredBadgeIds: string[]
}

const defaultProfile: LocalProfile = {
  name: "CAN 학습자",
  bio: "자동차 네트워크 보안을 학습하고 있습니다.",
  featuredBadgeIds: [],
}

function loadProfile(): LocalProfile {
  if (typeof window === "undefined") return defaultProfile
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")
    if (!stored || typeof stored !== "object") return defaultProfile
    return {
      name: typeof stored.name === "string" ? stored.name : defaultProfile.name,
      bio: typeof stored.bio === "string" ? stored.bio : defaultProfile.bio,
      featuredBadgeIds: Array.isArray(stored.featuredBadgeIds)
        ? stored.featuredBadgeIds.filter((id: unknown): id is string => typeof id === "string").slice(0, 3)
        : [],
    }
  } catch {
    return defaultProfile
  }
}

export default function ProfilePage() {
  const { progress } = useApp()
  const [profile, setProfile] = useState(loadProfile)
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const earnedBadges = useMemo(
    () => badgeCatalog.filter((badge) => badge.isEarned(progress)),
    [progress],
  )
  const featuredBadges = profile.featuredBadgeIds
    .map((id) => earnedBadges.find((badge) => badge.id === id))
    .filter((badge) => badge !== undefined)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const next = {
      name: draft.name.trim() || defaultProfile.name,
      bio: draft.bio.trim().slice(0, 120),
      featuredBadgeIds: draft.featuredBadgeIds.slice(0, 3),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setProfile(next)
    setDraft(next)
    setEditing(false)
  }

  const toggleBadge = (badgeId: string) => {
    setDraft((current) => {
      const selected = current.featuredBadgeIds.includes(badgeId)
      return {
        ...current,
        featuredBadgeIds: selected
          ? current.featuredBadgeIds.filter((id) => id !== badgeId)
          : current.featuredBadgeIds.length < 3
            ? [...current.featuredBadgeIds, badgeId]
            : current.featuredBadgeIds,
      }
    })
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "28px 40px 48px" }}>
      <section
        style={{
          padding: 24,
          borderRadius: 14,
          border: "1px solid var(--border-default)",
          background: "var(--surface-default)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "var(--brand-accent-muted)",
              color: "var(--brand-accent)",
            }}
          >
            <UserCircle size={48} weight="duotone" aria-hidden="true" />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 5px", fontSize: 22 }}>{profile.name}</h1>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>{profile.bio}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} style={{ padding: "8px 13px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--background-primary)", color: "var(--text-primary)", cursor: "pointer" }}>
            <PencilSimple size={15} /> 프로필 편집
          </button>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border-default)", background: "var(--surface-default)" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>학습 현황</h2>
          {["can-basics", "practice", "attacks"].map((course) => (
            <div key={course} style={{ marginBottom: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                <span>{course === "can-basics" ? "CAN 기초" : course === "practice" ? "CAN 실습" : "공격 실습"}</span>
                <strong>{progress.courseProgress[course] || 0}%</strong>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--border-default)", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${progress.courseProgress[course] || 0}%`, height: "100%", background: "var(--brand-accent)" }} />
              </div>
            </div>
          ))}
        </section>

        <section style={{ padding: 20, borderRadius: 12, border: "1px solid var(--border-default)", background: "var(--surface-default)" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>대표 배지</h2>
          {featuredBadges.length > 0 ? featuredBadges.map((badge) => (
            <div key={badge.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--brand-accent)", color: "white", fontSize: 9, fontWeight: 800 }}>{badge.symbol}</span>
              <div><strong style={{ fontSize: 13 }}>{badge.name}</strong><p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 11 }}>{badge.description}</p></div>
            </div>
          )) : <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>프로필 편집에서 대표 배지를 선택하세요.</p>}
        </section>
      </div>

      {editing && (
        <div role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.48)", zIndex: 50 }}>
          <form onSubmit={save} style={{ width: "min(520px, calc(100vw - 32px))", padding: 24, borderRadius: 14, background: "var(--surface-default)", border: "1px solid var(--border-default)" }}>
            <h2 id="profile-edit-title" style={{ margin: "0 0 18px" }}>프로필 편집</h2>
            <label style={{ display: "grid", gap: 6, marginBottom: 14, fontSize: 12 }}>이름<input value={draft.name} maxLength={30} onChange={(event) => setDraft({ ...draft, name: event.target.value })} style={{ padding: 10, borderRadius: 7, border: "1px solid var(--border-default)", background: "var(--background-primary)", color: "var(--text-primary)" }} /></label>
            <label style={{ display: "grid", gap: 6, marginBottom: 18, fontSize: 12 }}>한 줄 소개<textarea value={draft.bio} maxLength={120} rows={3} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} style={{ padding: 10, borderRadius: 7, border: "1px solid var(--border-default)", background: "var(--background-primary)", color: "var(--text-primary)", resize: "vertical" }} /></label>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 20px" }}><legend style={{ fontSize: 12, marginBottom: 8 }}>대표 배지 (최대 3개)</legend><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{earnedBadges.map((badge) => { const selected = draft.featuredBadgeIds.includes(badge.id); return <button key={badge.id} type="button" aria-pressed={selected} onClick={() => toggleBadge(badge.id)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${selected ? "var(--brand-accent)" : "var(--border-default)"}`, background: selected ? "var(--brand-accent-muted)" : "transparent", color: "var(--text-primary)" }}>{selected && <Check size={13} />} {badge.name}</button> })}</div></fieldset>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" onClick={() => { setDraft(profile); setEditing(false) }} style={{ padding: "8px 14px" }}>취소</button><button type="submit" style={{ padding: "8px 14px", background: "var(--brand-accent)", color: "white", border: 0, borderRadius: 7 }}>저장</button></div>
          </form>
        </div>
      )}
    </main>
  )
}
