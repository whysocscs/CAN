import { Avatar, Badge, Button, Tooltip } from "@fluentui/react-components"
import { Bell, Circuitry, Moon, Sun } from "@phosphor-icons/react"
import { Alert20Regular } from "@fluentui/react-icons/svg/alert"
import { WeatherMoon20Regular } from "@fluentui/react-icons/svg/weather-moon"
import { WeatherSunny20Regular } from "@fluentui/react-icons/svg/weather-sunny"
import { useApp } from "@/context/AppContext"
import { designMeta, designVersion } from "@/design/version"
import { breadcrumbMap, pageTitles } from "./Header"

function Breadcrumbs() {
  const { currentRoute } = useApp()
  const crumbs = breadcrumbMap[currentRoute] || []

  return (
    <div className="designed-header__heading">
      <div className="designed-header__breadcrumbs" aria-label="현재 위치">
        {crumbs.slice(0, -1).map((crumb) => (
          <span key={crumb}>{crumb}</span>
        ))}
      </div>
      <strong>{pageTitles[currentRoute]}</strong>
    </div>
  )
}

function CraftHeader() {
  const { theme, toggleTheme, notifications, progress } = useApp()

  return (
    <header className={`designed-header designed-header--${designVersion}`}>
      <Breadcrumbs />
      {designVersion === "ver2" && (
        <div
          className="designed-header__instrument-readout"
          aria-label="실습 상태"
        >
          <span>
            <small>빌드 상태</small>
            <strong>프리뷰</strong>
          </span>
          <span>
            <small>기능 범위</small>
            <strong>CAN 기초</strong>
          </span>
          <span>
            <small>학습 점수</small>
            <strong className="font-mono">
              {progress.totalScore.toLocaleString()}
            </strong>
          </span>
        </div>
      )}
      <div className="designed-header__actions">
        <div className="designed-header__connection">
          <Circuitry size={17} aria-hidden="true" />
          <span>프론트엔드 프리뷰</span>
        </div>
        <button
          type="button"
          className="designed-header__icon-button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          type="button"
          className="designed-header__icon-button"
          aria-label={`알림 ${notifications.length}개`}
        >
          <Bell size={18} />
          {notifications.length > 0 && (
            <span className="designed-header__notification-count">
              {notifications.length}
            </span>
          )}
        </button>
        <div className="designed-header__profile" aria-label="사용자 김민준">
          <span>김</span>
          <div>
            <strong>김민준</strong>
            <small>{designMeta[designVersion].description}</small>
          </div>
        </div>
      </div>
    </header>
  )
}

function FluentHeader() {
  const { theme, toggleTheme, notifications, progress } = useApp()

  return (
    <header className="designed-header designed-header--ver3">
      <Breadcrumbs />
      <div
        className="designed-header__fluent-toolbar"
        role="toolbar"
        aria-label="페이지 도구"
      >
        <Badge appearance="outline">프론트엔드 프리뷰</Badge>
        <Tooltip
          content={theme === "dark" ? "라이트 모드" : "다크 모드"}
          relationship="label"
        >
          <Button
            appearance="subtle"
            icon={
              theme === "dark" ? (
                <WeatherSunny20Regular />
              ) : (
                <WeatherMoon20Regular />
              )
            }
            aria-label={theme === "dark" ? "라이트 모드" : "다크 모드"}
            onClick={toggleTheme}
          />
        </Tooltip>
        <Tooltip
          content={`알림 ${notifications.length}개`}
          relationship="label"
        >
          <Button
            appearance="subtle"
            icon={<Alert20Regular />}
            aria-label={`알림 ${notifications.length}개`}
          />
        </Tooltip>
        <div className="designed-header__fluent-profile">
          <Avatar name="김민준" color="colorful" size={28} />
          <div>
            <strong>김민준</strong>
            <small>{progress.totalScore.toLocaleString()}점</small>
          </div>
        </div>
      </div>
    </header>
  )
}

export default function DesignedHeader() {
  return designVersion === "ver3" ? <FluentHeader /> : <CraftHeader />
}
