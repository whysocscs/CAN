// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import AttackLabLearningCheck, {
  type AttackLabLearningCheckProps,
} from "./AttackLabLearningCheck"

const COMPLETE_EXPLANATION = "선택한 프레임의 판정과 차량 효과가 같은 실행에 속합니다."

function props(
  overrides: Partial<AttackLabLearningCheckProps> = {},
): AttackLabLearningCheckProps {
  return {
    predictionDraft: "왼쪽 문이 열릴 것으로 예상합니다.",
    predictionBeforeAction: "왼쪽 문이 열릴 것으로 예상합니다.",
    explanation: COMPLETE_EXPLANATION,
    technicalComplete: true,
    evidenceSelected: true,
    confirmed: false,
    onPredictionChange: vi.fn(),
    onExplanationChange: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  }
}

describe("AttackLabLearningCheck", () => {
  afterEach(cleanup)

  it("enables confirmation only after prediction, matching evidence, Toy effect, and 20 characters", async () => {
    const user = userEvent.setup()
    const cases: Array<Partial<AttackLabLearningCheckProps>> = [
      { predictionBeforeAction: "" },
      { evidenceSelected: false },
      { technicalComplete: false },
      { explanation: "20자 미만 설명" },
    ]

    const view = render(<AttackLabLearningCheck {...props(cases[0])} />)
    const confirm = screen.getByRole("button", { name: "학습 확인" })
    expect(confirm).toBeDisabled()
    for (const blocked of cases.slice(1)) {
      view.rerender(<AttackLabLearningCheck {...props(blocked)} />)
      expect(confirm).toBeDisabled()
    }

    const ready = props()
    view.rerender(<AttackLabLearningCheck {...ready} />)
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(ready.onConfirm).toHaveBeenCalledOnce()
  })

  it("keeps Toy technical success separate from the controlled learner confirmation", () => {
    render(<AttackLabLearningCheck {...props({ confirmed: false })} />)

    expect(screen.getByText("자동 채점 아님")).toBeInTheDocument()
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent("달성")
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent("미완료")
  })
})
