import type { ReactNode } from "react"
import Sidebar from "./Sidebar"
import Header from "./Header"
import DesignedSidebar from "./DesignedSidebar"
import DesignedHeader from "./DesignedHeader"
import { designVersion } from "@/design/version"

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const isLegacy = designVersion === "ver1"

  return (
    <div className={`app-shell app-shell--${designVersion}`}>
      {isLegacy ? <Sidebar /> : <DesignedSidebar />}
      <div className="app-shell__workspace">
        {isLegacy ? <Header /> : <DesignedHeader />}
        <main id="main-content" className="app-shell__content">
          {children}
        </main>
      </div>
    </div>
  )
}
