import type { CSSProperties, ReactNode } from "react"
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components"
import { useApp } from "@/context/AppContext"
import { designVersion } from "./version"

const fluentLightTheme = {
  ...webLightTheme,
  fontFamilyBase: '"Noto Sans KR Variable", "Segoe UI", sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono Variable", "Noto Sans KR Variable", monospace',
  colorBrandForeground1: "#185abd",
  colorBrandForeground2: "#0f548c",
  colorBrandBackground: "#185abd",
  colorBrandBackgroundHover: "#0f548c",
  colorBrandBackgroundPressed: "#0b3d68",
  colorCompoundBrandForeground1: "#185abd",
}

const fluentDarkTheme = {
  ...webDarkTheme,
  fontFamilyBase: '"Noto Sans KR Variable", "Segoe UI", sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono Variable", "Noto Sans KR Variable", monospace',
  colorBrandForeground1: "#75b6ff",
  colorBrandForeground2: "#9dccff",
  colorBrandBackground: "#2f7ed8",
  colorBrandBackgroundHover: "#4b91df",
  colorBrandBackgroundPressed: "#75b6ff",
  colorCompoundBrandForeground1: "#75b6ff",
}

const providerStyle: CSSProperties = { height: "100%", minHeight: 0 }

export default function DesignSystemProvider({
  children,
}: {
  children: ReactNode
}) {
  const { theme } = useApp()
  const content = (
    <div
      className={`design-root design-root--${designVersion}`}
      data-design={designVersion}
    >
      {children}
    </div>
  )

  if (designVersion !== "ver3") return content

  return (
    <FluentProvider
      theme={theme === "dark" ? fluentDarkTheme : fluentLightTheme}
      style={providerStyle}
    >
      {content}
    </FluentProvider>
  )
}
