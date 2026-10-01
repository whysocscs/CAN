import { createContext, useContext, useState, type ReactNode } from "react"
import { Info } from "@phosphor-icons/react"
import LabIntro, { type LabIntroContent } from "./LabIntro"

const LabIntroContext = createContext<(() => void) | null>(null)

interface LabIntroGateProps {
  intro: LabIntroContent
  children: ReactNode
}

/**
 * 설명 화면 → 실습 화면 순서를 관리한다.
 *
 * 실습을 한 번 시작하면 설명을 다시 열어도 실습 화면은 언마운트하지 않는다.
 * 그래야 터미널 기록과 세션이 유지된다. 다른 실습으로 이동하면 Gate가 통째로
 * 바뀌므로 모든 상태가 초기화된다.
 */
export default function LabIntroGate({ intro, children }: LabIntroGateProps) {
  const [started, setStarted] = useState(false)
  const [showingIntro, setShowingIntro] = useState(true)

  return (
    <LabIntroContext.Provider value={() => setShowingIntro(true)}>
      {showingIntro ? (
        <LabIntro
          {...intro}
          startLabel={started ? "실습으로 돌아가기" : "실습 시작"}
          onStart={() => {
            setStarted(true)
            setShowingIntro(false)
          }}
        />
      ) : null}
      {started ? <div className="lab-v2__gate-body" hidden={showingIntro}>{children}</div> : null}
    </LabIntroContext.Provider>
  )
}

/** 실습 화면 상단 바에 두는 "실습 소개" 버튼. Gate 밖에서는 렌더링하지 않는다. */
export function LabIntroButton() {
  const openIntro = useContext(LabIntroContext)
  if (!openIntro) return null
  return (
    <button type="button" className="lab-v2__intro-button" onClick={openIntro}>
      <Info size={14} aria-hidden="true" /> 실습 소개
    </button>
  )
}
