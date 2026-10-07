// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import IpsBlockingTimeline, { type IpsFrame, type IpsRule } from "./IpsBlockingTimeline"

afterEach(cleanup)
const normal: IpsFrame = { id: "normal", time: 0, canId: "0x456", data: "010A", counter: 10, kind: "normal", ids: "PASS" }
const replay: IpsFrame = { id: "replay", time: 400, canId: "0x456", data: "010B", counter: 11, kind: "attack", ids: "REPLAY" }

it.each(["none", "counter", "id"] as IpsRule[])("selects normal and attack markers under the %s rule", (activeRule) => {
  const onSelectFrame = vi.fn()
  const onOpenFrame = vi.fn()
  render(<IpsBlockingTimeline frames={[normal, replay]} activeRule={activeRule} popoverFrame={null} selectedRule="counter" selectedFrameId="normal" onSelectFrame={onSelectFrame} onOpenFrame={onOpenFrame} onSelectRule={vi.fn()} onApply={vi.fn()} />)
  const first = screen.getByRole("button", { name: `패킷 1: PASS, ${activeRule === "id" ? "BLOCK" : "ALLOW"}` })
  expect(first).toHaveAttribute("aria-pressed", "true")
  fireEvent.click(first)
  expect(onSelectFrame).toHaveBeenLastCalledWith(normal)
  fireEvent.click(screen.getByRole("button", { name: activeRule === "none" ? "REPLAY attack frame" : "패킷 2: REPLAY, BLOCK" }))
  expect(onSelectFrame).toHaveBeenLastCalledWith(replay)
  expect(onOpenFrame).toHaveBeenLastCalledWith(activeRule === "none" ? replay : null)
})
