import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { designVersion } from "../design/version"

export type Route = "courses" | "dashboard" | "can-basics/protocol" | "can-basics/frame" | "can-basics/ecu" | "practice/normal" | "practice/sender" | "practice/monitor" | "attacks/chain" | "attacks/spoofing" | "attacks/replay" | "attacks/dos" | "ids/unknown-id" | "ids/frequency" | "ids/payload-jump" | "ids/dos-detection" | "ids/gateway" | "results" | "badges" | "profile" | "models" | "settings" | "about"

export interface BadgeInfo {
  id: string
  name: string
  emoji: string
  description: string
  earnedAt: string
}

export interface UserProgress {
  totalScore: number
  completedLabs: number
  badges: BadgeInfo[]
  courseProgress: Record<string, number>
  completedItems: string[]
}

export interface Notification {
  id: string
  type: "info" | "success" | "warning" | "danger"
  title: string
  message: string
}

interface AppContextType {
  theme: "light" | "dark"
  toggleTheme: () => void
  currentRoute: Route
  navigate: (route: Route) => void
  progress: UserProgress
  devMode: boolean
  setDevMode: (value: boolean) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (value: boolean) => void
  addScore: (points: number) => void
  completeItem: (itemId: string) => void
  earnBadge: (badge: BadgeInfo) => void
  notifications: Notification[]
  dismissNotification: (id: string) => void
  addNotification: (notification: Omit<Notification, "id">) => void
}

const AppContext = createContext<AppContextType | null>(null)

const initialBadges: BadgeInfo[] = [
  {
    id: "first-login",
    name: "CAN Starter",
    emoji: "CAN",
    description: "CANLite 학습을 시작했습니다.",
    earnedAt: "2024-01-15",
  },
  {
    id: "can-basics",
    name: "Frame Reader",
    emoji: "CAN",
    description: "CAN 기초 과정을 완료했습니다.",
    earnedAt: "2024-01-16",
  },
]

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    designVersion === "ver2" ? "dark" : "light",
  )
  const [currentRoute, setCurrentRoute] = useState<Route>("courses")
  const [devMode, setDevMode] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [progress, setProgress] = useState<UserProgress>({
    totalScore: 1250,
    completedLabs: 3,
    badges: initialBadges,
    courseProgress: {
      "can-basics": 67,
      practice: 33,
      attacks: 0,
      ids: 0,
    },
    completedItems: ["can-basics/protocol", "can-basics/frame"],
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"))
  }, [])

  const navigate = useCallback((route: Route) => {
    setCurrentRoute(route)
  }, [])

  const addScore = useCallback((points: number) => {
    setProgress((current) => ({
      ...current,
      totalScore: current.totalScore + points,
    }))
  }, [])

  const completeItem = useCallback((itemId: string) => {
    setProgress((current) => {
      if (current.completedItems.includes(itemId)) return current

      const nextCourseProgress = { ...current.courseProgress }
      if (itemId.startsWith("can-basics")) {
        nextCourseProgress["can-basics"] = Math.min(
          100,
          (nextCourseProgress["can-basics"] || 0) + 34,
        )
      }

      return {
        ...current,
        completedItems: [...current.completedItems, itemId],
        completedLabs: current.completedLabs + 1,
        courseProgress: nextCourseProgress,
      }
    })
  }, [])

  const earnBadge = useCallback((badge: BadgeInfo) => {
    setProgress((current) => {
      if (current.badges.some((item) => item.id === badge.id)) return current
      return { ...current, badges: [...current.badges, badge] }
    })
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
  }, [])

  const addNotification = useCallback(
    (notification: Omit<Notification, "id">) => {
      const id = Math.random().toString(36).slice(2)
      setNotifications((current) => [...current, { ...notification, id }])
      window.setTimeout(() => {
        setNotifications((current) => current.filter((item) => item.id !== id))
      }, 5000)
    },
    [],
  )

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        currentRoute,
        navigate,
        progress,
        devMode,
        setDevMode,
        sidebarCollapsed,
        setSidebarCollapsed,
        addScore,
        completeItem,
        earnBadge,
        notifications,
        dismissNotification,
        addNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error("useApp must be used within AppProvider")
  return context
}
