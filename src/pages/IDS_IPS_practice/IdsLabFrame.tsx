import type { ReactNode } from "react"
import { ClipboardText, Monitor, Play, TerminalWindow } from "@phosphor-icons/react"
import { LabIntroButton } from "@/features/lab-layout/LabIntroGate"
import LabTabs, { type LabTab } from "@/features/lab-layout/LabTabs"
import "@/features/lab-layout/labV2.css"

export type IdsTone = "ok" | "danger" | "neutral"

interface StatusItem {
  label: string
  value: ReactNode
  tone?: IdsTone
}

interface IdsGuide {
  progressLabel: string
  progress: number
  steps: readonly string[]
  currentStep: number
  mission: ReactNode
  missionAction?: ReactNode
  verdict?: { title: string; label: ReactNode; tone: IdsTone; note?: ReactNode }
  hint: ReactNode
}

interface IdsLabFrameProps {
  ariaLabel: string
  kicker: string
  title: string
  status: readonly StatusItem[]
  started: boolean
  onStart: () => void
  main: ReactNode
  guide: IdsGuide
  tabs: readonly LabTab<string>[]
}

/** IDS/IPS 실습 공통 VERSION 2 작업 화면: 상단 바 + 왼쪽 시각화 + 오른쪽 안내·콘솔 탭. */
export default function IdsLabFrame({
  ariaLabel,
  kicker,
  title,
  status,
  started,
  onStart,
  main,
  guide,
  tabs,
}: IdsLabFrameProps) {
  const progress = Math.max(0, Math.min(100, Math.round(guide.progress)))
  return (
    <main className="lab-v2 ids-lab" aria-label={ariaLabel}>
      <header className="lab-v2__bar">
        <div className="lab-v2__title">
          <p>{kicker}</p>
          <h1>{title}</h1>
        </div>
        <dl className="lab-v2__status">
          {status.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd data-tone={item.tone}>{item.value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="lab-v2__button is-primary" onClick={onStart}>
          <Play size={14} weight="fill" aria-hidden="true" />
          {started ? "다시 시작" : "시작"}
        </button>
        <LabIntroButton />
      </header>

      <div className="lab-v2__workbench">
        <div className="lab-v2__main">{main}</div>
        <aside className="lab-v2__side" aria-label="실습 안내와 콘솔">
          <div className="lab-v2__guide">
            <section>
              <div className="lab-v2__progress">
                <span>{guide.progressLabel}</span>
                <b>{progress}%</b>
                <i><em style={{ width: `${progress}%` }} /></i>
              </div>
            </section>
            <section>
              <h2>진행 단계</h2>
              <ol className="lab-v2__steps">
                {guide.steps.map((step, index) => (
                  <li key={step} aria-current={guide.currentStep === index ? "step" : undefined}>
                    {index + 1}. {step}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>현재 미션</h2>
              <p>{guide.mission}</p>
              {guide.missionAction ? <div style={{ marginTop: 8 }}>{guide.missionAction}</div> : null}
            </section>
            {guide.verdict ? (
              <section>
                <h2>{guide.verdict.title}</h2>
                <span className="lab-v2__verdict" data-tone={guide.verdict.tone}>{guide.verdict.label}</span>
                {guide.verdict.note ? <p>{guide.verdict.note}</p> : null}
              </section>
            ) : null}
            <section>
              <h2>힌트</h2>
              <p>{guide.hint}</p>
            </section>
          </div>
          <LabTabs label="IDS 실습 콘솔" tabs={tabs} />
        </aside>
      </div>
    </main>
  )
}

interface ConsolePaneProps {
  title: string
  status: string
  onClear: () => void
  children: ReactNode
}

/** 콘솔 탭 하나의 상단 툴바(제목·연결 상태·화면 비우기)와 본문. */
export function IdsConsolePane({ title, status, onClear, children }: ConsolePaneProps) {
  return (
    <>
      <div className="lab-v2__console-toolbar">
        <strong>{title}</strong>
        <span>{status}</span>
        <button type="button" className="lab-v2__button" onClick={onClear}>화면 비우기</button>
      </div>
      {children}
    </>
  )
}

export const IDS_TAB_ICONS = { terminal: TerminalWindow, monitor: Monitor, idsLog: ClipboardText }
