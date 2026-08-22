// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../../context/AppContext"
import DesignedSidebar from "./DesignedSidebar"

describe("DesignedSidebar fresh mobile navigation", () => {
  afterEach(() => cleanup())

  it("keeps five items and replaces model management with Attack practice", () => {
    render(<AppProvider><DesignedSidebar /></AppProvider>)
    const mobile = screen.getByRole("navigation", { name: "모바일 주요 메뉴" })
    expect(within(mobile).getAllByRole("button")).toHaveLength(5)
    expect(within(mobile).getByRole("button", { name: "공격 실습" })).toBeInTheDocument()
    expect(within(mobile).queryByText("모델 관리")).not.toBeInTheDocument()
  })
})
