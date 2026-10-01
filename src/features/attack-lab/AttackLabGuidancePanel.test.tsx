// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import AttackLabGuidancePanel from "./AttackLabGuidancePanel"
import {
  ATTACK_LAB_LEARNING,
  ATTACK_LAB_PREDICTION_PROMPTS,
  ATTACK_LAB_PRINCIPLE_QUESTIONS,
  type AttackLabLearningScenario,
} from "./attackLabLearning"

const SCENARIOS: readonly [AttackLabLearningScenario, number][] = [
  ["door", 7],
  ["spoofing", 5],
  ["replay", 5],
]

describe("attack lab learning guidance", () => {
  afterEach(cleanup)

  it.each(SCENARIOS)(
    "provides four answer-safe guided fields for every %s stage",
    (scenario, stageCount) => {
      const learning = ATTACK_LAB_LEARNING[scenario]

      expect(learning.stages).toHaveLength(stageCount)
      learning.stages.forEach((stage) => {
        expect(stage.label.trim()).not.toBe("")
        expect(stage.purpose.trim()).not.toBe("")
        expect(stage.action.trim()).not.toBe("")
        expect(stage.evidence.trim()).not.toBe("")
        expect(stage.completion.trim()).not.toBe("")
      })
    },
  )

  it("keeps the Spoofing principle explicit that CAN ID is not authenticated sender identity", () => {
    const spoofingText = [
      ATTACK_LAB_PRINCIPLE_QUESTIONS.spoofing,
      ATTACK_LAB_PREDICTION_PROMPTS.spoofing,
      ...ATTACK_LAB_LEARNING.spoofing.stages.flatMap((stage) => [
        stage.purpose,
        stage.action,
        stage.evidence,
        stage.completion,
      ]),
    ].join(" ")

    expect(spoofingText).toContain("CAN ID는 인증된 송신자 identity가 아닙니다")
  })

  it.each([
    ["door", ["rolling counter", "checksum"]],
    ["spoofing", ["CAN ID는 인증된 송신자 identity가 아닙니다"]],
    ["replay", ["freshness protection"]],
  ] as const)(
    "asks an outcome-neutral %s principle question without disclosing the result",
    (scenario, requiredConcepts) => {
      const question = ATTACK_LAB_PRINCIPLE_QUESTIONS[scenario]

      requiredConcepts.forEach((concept) => expect(question).toContain(concept))
      expect(question).not.toMatch(
        /거부되고|에서만 .*효과가 적용됐|Replay가 아닌 Spoofing|다시 수락된 사실|freshness protection 부재/,
      )
    },
  )

  it("does not bundle an exact CAN answer command in learner guidance", () => {
    const allGuidance = JSON.stringify({
      learning: ATTACK_LAB_LEARNING,
      prediction: ATTACK_LAB_PREDICTION_PROMPTS,
      principle: ATTACK_LAB_PRINCIPLE_QUESTIONS,
    })

    expect(allGuidance).not.toMatch(/cansend\s+vcan0\s+[0-9a-f]+#[0-9a-f]+/i)
    expect(allGuidance).not.toMatch(/\b[0-9a-f]{3}#[0-9a-f]{2,}\b/i)
  })

  it("renders Guided as an accessible four-field stage explanation", () => {
    render(<AttackLabGuidancePanel scenario="replay" stageIndex={2} />)

    expect(
      screen.getByRole("group", { name: "학습 안내 모드" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Guided/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: /Challenge/ })).not.toBeChecked()
    expect(
      screen.getByRole("heading", { name: "원본 확인" }),
    ).toBeInTheDocument()

    const guidance = screen.getByRole("region", { name: "현재 단계 안내" })
    expect(
      within(guidance)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["단계 목적", "지금 할 일", "확인할 증거", "완료 기준"])
    expect(within(guidance).getAllByRole("definition")).toHaveLength(4)
  })

  it("shows only the stage purpose and learner-owned decisions in Challenge mode", async () => {
    const user = userEvent.setup()
    render(<AttackLabGuidancePanel scenario="door" stageIndex={3} />)

    await user.click(screen.getByRole("radio", { name: /Challenge/ }))

    expect(screen.getByRole("radio", { name: /Challenge/ })).toBeChecked()
    const guidance = screen.getByRole("region", { name: "현재 단계 안내" })
    expect(
      within(guidance)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["단계 목적", "스스로 정할 항목"])
    expect(within(guidance).queryByText("지금 할 일")).not.toBeInTheDocument()
    expect(within(guidance).queryByText("확인할 증거")).not.toBeInTheDocument()
    expect(within(guidance).queryByText("완료 기준")).not.toBeInTheDocument()
  })

  it("reports a controlled beginner/practitioner mode change to the lab page", async () => {
    const user = userEvent.setup()
    const onModeChange = vi.fn()
    const view = render(
      <AttackLabGuidancePanel
        scenario="door"
        stageIndex={0}
        mode="guided"
        onModeChange={onModeChange}
      />,
    )

    await user.click(screen.getByRole("radio", { name: /실습자용/ }))

    expect(onModeChange).toHaveBeenCalledWith("challenge")
    expect(screen.getByRole("radio", { name: /초보자용/ })).toBeChecked()

    view.rerender(
      <AttackLabGuidancePanel
        scenario="door"
        stageIndex={0}
        mode="challenge"
        onModeChange={onModeChange}
      />,
    )
    expect(screen.getByRole("radio", { name: /실습자용/ })).toBeChecked()
    expect(
      screen.getByRole("region", { name: "현재 단계 안내" }),
    ).toHaveTextContent("스스로 정할 항목")
  })

  it("keeps the current stage available without announcing every progress change", () => {
    const view = render(
      <AttackLabGuidancePanel scenario="replay" stageIndex={1} />,
    )

    const initialStage = screen.getByText("현재 학습 단계: 프레임 캡처")
    expect(initialStage).toHaveClass("sr-only")
    expect(initialStage).not.toHaveAttribute("role")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    view.rerender(<AttackLabGuidancePanel scenario="replay" stageIndex={3} />)

    expect(screen.getByText("현재 학습 단계: 재전송")).not.toHaveAttribute(
      "role",
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })
})
