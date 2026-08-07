import { Circuitry, Clock, Path } from "@phosphor-icons/react"

export interface ScaffoldPageContent {
  title: string
  description: string
  slots: Array<{
    title: string
    description: string
  }>
}

export default function ScaffoldPage({
  title,
  description,
  slots,
}: ScaffoldPageContent) {
  return (
    <div className="module-scaffold">
      <header className="module-scaffold__header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="module-scaffold__status">
          <Clock size={16} aria-hidden="true" />
          구현 예정
        </span>
      </header>

      <div className="module-scaffold__layout">
        <section
          className="module-scaffold__outline"
          aria-labelledby="scaffold-outline-title"
        >
          <div className="module-scaffold__section-heading">
            <Path size={20} aria-hidden="true" />
            <h2 id="scaffold-outline-title">남겨둔 화면 구조</h2>
          </div>
          <ol className="module-scaffold__slots">
            {slots.map((slot) => (
              <li key={slot.title}>
                <span aria-hidden="true" />
                <div>
                  <strong>{slot.title}</strong>
                  <p>{slot.description}</p>
                </div>
                <small>준비 중</small>
              </li>
            ))}
          </ol>
        </section>

        <aside className="module-scaffold__notice">
          <Circuitry size={24} aria-hidden="true" />
          <h2>프론트엔드 틀만 포함</h2>
          <p>
            데이터 처리, 시뮬레이션, 업로드 기능은 아직 연결하지 않았습니다.
            현재 저장소에서는 화면 구조와 이동 경로만 확인할 수 있습니다.
          </p>
        </aside>
      </div>
    </div>
  )
}
