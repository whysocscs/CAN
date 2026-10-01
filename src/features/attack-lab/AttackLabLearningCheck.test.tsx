// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import AttackLabLearningCheck, {
  type AttackLabLearningCheckProps,
} from "./AttackLabLearningCheck"

const COMPLETE_EXPLANATION =
  "선택한 프레임의 판정과 차량 효과가 같은 실행에 속합니다."

function props(
  overrides: Partial<AttackLabLearningCheckProps> = {},
): AttackLabLearningCheckProps {
  return {
    predictionDraft: "왼쪽 문이 열릴 것으로 예상합니다.",
    predictionBeforeAction: "왼쪽 문이 열릴 것으로 예상합니다.",
    explanation: COMPLETE_EXPLANATION,
    technicalComplete: true,
    reviewReady: true,
    evidenceSelected: true,
    confirmed: false,
    expectationPrompt:
      "예상 Terminal 형태, 중단 장치, IDS·ECU 판정과 차량 효과를 적으세요.",
    principleQuestion:
      "CAN ID가 authenticated sender identity가 아닌 이유는 무엇인가요?",
    actualRows: [
      {
        key: "terminal",
        label: "Terminal",
        value: "오류 없음",
        source: "Terminal",
      },
      { key: "ecu", label: "Toy ECU", value: "EXECUTED", source: "Toy ECU" },
      {
        key: "effect",
        label: "차량 영향",
        value: "Tailgate · 적용됨",
        source: "교육용 분석",
      },
    ],
    onPredictionChange: vi.fn(),
    onExplanationChange: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  }
}

describe("AttackLabLearningCheck", () => {
  afterEach(cleanup)

  it("enables confirmation only after prediction, matching evidence, completed review, and 20 characters", async () => {
    const user = userEvent.setup()
    const cases: Array<Partial<AttackLabLearningCheckProps>> = [
      { predictionBeforeAction: "" },
      { evidenceSelected: false },
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

  it("allows reflection on a completed failed attempt without marking technical success", async () => {
    const user = userEvent.setup()
    const failedAttempt = props({ technicalComplete: false, reviewReady: true })
    render(<AttackLabLearningCheck {...failedAttempt} />)

    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent(
      "미달성",
    )
    const confirm = screen.getByRole("button", { name: "학습 확인" })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(failedAttempt.onConfirm).toHaveBeenCalledOnce()
  })

  it("keeps Toy technical success separate from the controlled learner confirmation", () => {
    render(<AttackLabLearningCheck {...props({ confirmed: false })} />)

    expect(screen.getByText("자동 채점 아님")).toBeInTheDocument()
    expect(screen.getByText("공격 조건 충족").parentElement).toHaveTextContent(
      "달성",
    )
    expect(screen.getByText("학습 확인 완료").parentElement).toHaveTextContent(
      "미완료",
    )
  })

  it("places the saved expectation and authoritative actual rows side by side with a scenario principle question", () => {
    render(<AttackLabLearningCheck {...props()} />)

    expect(screen.getByText("Expected · 실행 전")).toBeInTheDocument()
    expect(screen.getByText("Actual · 관찰 결과")).toBeInTheDocument()
    expect(screen.getByText(/예상 Terminal 형태/)).toBeInTheDocument()
    expect(screen.getByText("오류 없음")).toBeInTheDocument()
    expect(screen.getByText("Tailgate · 적용됨")).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Actual 프레임별 관찰 결과" }),
    ).toHaveAttribute("tabindex", "0")
    expect(
      screen.getByText(/authenticated sender identity/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toBeEnabled()
  })

  it("shows only the prediction step until authoritative playback completes", () => {
    const view = render(
      <AttackLabLearningCheck {...props({ reviewReady: false })} />,
    )

    expect(screen.getByRole("textbox", { name: "실행 전 예상" })).toBeEnabled()
    expect(screen.getByText(/실행 결과 재생이 완료되면/)).toBeInTheDocument()
    expect(screen.queryByText("Expected · 실행 전")).not.toBeInTheDocument()
    expect(screen.queryByText("Actual · 관찰 결과")).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("선택한 근거와 결과 비교"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "학습 확인" }),
    ).not.toBeInTheDocument()

    view.rerender(<AttackLabLearningCheck {...props({ reviewReady: true })} />)

    expect(screen.getByText("Expected · 실행 전")).toBeInTheDocument()
    expect(screen.getByText("Actual · 관찰 결과")).toBeInTheDocument()
    expect(screen.getByLabelText("선택한 근거와 결과 비교")).toBeEnabled()
    expect(screen.getByRole("button", { name: "학습 확인" })).toBeEnabled()
  })
})
