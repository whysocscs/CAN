import { expect, it } from "vitest"
import { breadcrumbMap, pageTitles } from "./Header"
it.each([
  ["attacks/kuksa", "KUKSA 권한"],
  ["attacks/swupdate", "SWUpdate 업로드"],
] as const)("names the new route %s in the header", (route, title) => {
  expect(pageTitles[route]).toBe(title)
  expect(breadcrumbMap[route]).toEqual(["홈", "공격 실습", title])
})
