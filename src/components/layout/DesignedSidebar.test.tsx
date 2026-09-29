// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppProvider, useApp } from "../../context/AppContext"
import DesignedSidebar from "./DesignedSidebar"

const version = vi.hoisted(() => ({ value: "ver4" }))
vi.mock("../../design/version", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../design/version")>()
  return {
    ...original,
    get designVersion() {
      return version.value
    },
    get previewAccessOpen() {
      return version.value === "ver4"
    },
  }
})
function Controls() {
  const app = useApp()
  return (
    <>
      <button onClick={() => app.setDevMode(true)}>개발 모드 켜기</button>
      <output aria-label="선택된 경로">{app.currentRoute}</output>
    </>
  )
}

describe("DesignedSidebar fresh mobile navigation", () => {
  afterEach(() => {
    cleanup()
    version.value = "ver4"
  })

  it("adds both CVE labs to ver4 and keeps mobile entry", () => {
    render(
      <AppProvider>
        <DesignedSidebar />
        <Controls />
      </AppProvider>,
    )
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole(
        "button",
        { name: "공격 실습" },
      ),
    )
    fireEvent.click(screen.getByRole("button", { name: "KUKSA 권한" }))
    expect(screen.getByLabelText("선택된 경로")).toHaveTextContent(
      "attacks/kuksa",
    )
    fireEvent.click(screen.getByRole("button", { name: "SWUpdate 업로드" }))
    expect(screen.getByLabelText("선택된 경로")).toHaveTextContent(
      "attacks/swupdate",
    )
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "모바일 주요 메뉴" }),
      ).getByRole("button", { name: "공격 실습" }),
    )
    expect(screen.getByLabelText("선택된 경로")).toHaveTextContent(
      "attacks/chain",
    )
  })
  it.each(["ver2", "ver3"])(
    "does not expose CVE labs in %s and retains progression locks",
    (next) => {
      version.value = next
      render(
        <AppProvider>
          <DesignedSidebar />
          <Controls />
        </AppProvider>,
      )
      const attacks = within(
        screen.getByRole("navigation", { name: "주요 메뉴" }),
      ).getByRole("button", { name: /공격 실습/ })
      expect(attacks).toBeDisabled()
      fireEvent.click(screen.getByRole("button", { name: "개발 모드 켜기" }))
      fireEvent.click(attacks)
      expect(
        screen.getByRole("button", { name: "Spoofing" }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "KUKSA 권한" }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "SWUpdate 업로드" }),
      ).not.toBeInTheDocument()
    },
  )

  it("keeps five items and replaces model management with Attack practice", () => {
    render(
      <AppProvider>
        <DesignedSidebar />
      </AppProvider>,
    )
    const mobile = screen.getByRole("navigation", { name: "모바일 주요 메뉴" })
    expect(within(mobile).getAllByRole("button")).toHaveLength(5)
    expect(
      within(mobile).getByRole("button", { name: "공격 실습" }),
    ).toBeInTheDocument()
    expect(within(mobile).queryByText("모델 관리")).not.toBeInTheDocument()
  })
})
