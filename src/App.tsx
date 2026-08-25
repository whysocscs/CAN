import { useState } from "react"
import { Gear } from "@phosphor-icons/react"
import { Settings20Regular } from "@fluentui/react-icons/svg/settings"
import AppShell from "@/components/layout/AppShell"
import { AppProvider, useApp, type Route } from "@/context/AppContext"
import DesignSystemProvider from "@/design/DesignSystemProvider"
import { designVersion, previewAccessOpen } from "@/design/version"
import CoursePage from "@/pages/CoursePage"
import DashboardPage from "@/pages/DashboardPage"
import BadgePage from "@/pages/BadgePage"
import AttackPracticePage, {
  type AttackRoute,
} from "@/pages/AttackPracticePage"
import ModelManagerPage from "@/pages/ModelManagerPage"
import CanPracticeOnlyPage from "@/pages/CanPracticeOnlyPage"
import CanFrameSenderPage from "@/pages/can-practices/CanFrameSenderPage"
import ScaffoldPage, { type ScaffoldPageContent } from "@/pages/ScaffoldPage"
import ECUPage from "@/pages/can-basics/ECUPage"
import FramePage from "@/pages/can-basics/FramePage"
import ProtocolPage from "@/pages/can-basics/ProtocolPage"

const scaffoldPages: Partial<Record<Route, ScaffoldPageContent>> = {
  "practice/normal": {
    title: "정상 CAN 송수신",
    description: "정상 프레임 송수신 실습을 위한 화면 구조입니다.",
    slots: [
      {
        title: "실습 안내",
        description: "학습 목표와 진행 순서가 들어갈 영역",
      },
      {
        title: "CAN 작업 영역",
        description: "송수신 도구와 상태 화면이 들어갈 영역",
      },
      { title: "결과 확인", description: "실습 결과와 피드백이 들어갈 영역" },
    ],
  },
  "practice/sender": {
    title: "CAN Frame 송신기",
    description: "CAN 프레임 작성과 전송 기능을 위한 화면 구조입니다.",
    slots: [
      { title: "프레임 입력", description: "CAN ID, DLC, 데이터 입력 영역" },
      { title: "전송 제어", description: "송신 조건과 실행 제어 영역" },
      { title: "전송 기록", description: "프레임 전송 이력이 들어갈 영역" },
    ],
  },
  "practice/monitor": {
    title: "CAN Monitor",
    description: "CAN 트래픽 관찰과 분석 기능을 위한 화면 구조입니다.",
    slots: [
      { title: "트래픽 목록", description: "수신 프레임 목록이 들어갈 영역" },
      { title: "필터", description: "ID와 프레임 유형 필터가 들어갈 영역" },
      {
        title: "프레임 상세",
        description: "선택한 프레임 분석 정보가 들어갈 영역",
      },
    ],
  },
  "attacks/chain": {
    title: "전체 공격 체인",
    description: "CAN 공격 흐름을 연결해 살펴보는 화면 구조입니다.",
    slots: [
      { title: "공격 시나리오", description: "단계별 공격 흐름이 들어갈 영역" },
      { title: "상태 변화", description: "차량 네트워크 상태가 들어갈 영역" },
      {
        title: "탐지 결과",
        description: "공격 결과와 탐지 정보가 들어갈 영역",
      },
    ],
  },
  "attacks/spoofing": {
    title: "Spoofing",
    description: "CAN 메시지 위조 실습을 위한 화면 구조입니다.",
    slots: [
      { title: "정상 패턴", description: "정상 메시지 기준이 들어갈 영역" },
      { title: "위조 프레임", description: "위조 조건과 입력이 들어갈 영역" },
      { title: "영향 관찰", description: "상태 변화와 경고가 들어갈 영역" },
    ],
  },
  "attacks/replay": {
    title: "Replay",
    description: "프레임 녹화와 재전송 실습을 위한 화면 구조입니다.",
    slots: [
      { title: "프레임 녹화", description: "정상 트래픽 기록이 들어갈 영역" },
      { title: "재생 제어", description: "재전송 조건과 실행이 들어갈 영역" },
      { title: "비교 결과", description: "원본과 재생 트래픽 비교 영역" },
    ],
  },
  "attacks/dos": {
    title: "DoS",
    description: "CAN 버스 부하 공격 실습을 위한 화면 구조입니다.",
    slots: [
      { title: "공격 조건", description: "CAN ID와 전송 빈도 입력 영역" },
      { title: "버스 상태", description: "트래픽 부하와 지연 표시 영역" },
      { title: "중지와 복구", description: "공격 중지와 정상화 확인 영역" },
    ],
  },
  "ids/unknown-id": {
    title: "Unknown ID",
    description: "허용되지 않은 CAN ID 탐지를 위한 화면 구조입니다.",
    slots: [
      { title: "허용 목록", description: "정상 CAN ID 정책 영역" },
      { title: "탐지 이벤트", description: "Unknown ID 경고 목록 영역" },
      { title: "판단 근거", description: "탐지 규칙 설명 영역" },
    ],
  },
  "ids/frequency": {
    title: "Frequency Anomaly",
    description: "메시지 빈도 이상 탐지를 위한 화면 구조입니다.",
    slots: [
      { title: "기준 빈도", description: "정상 주기와 임계값 영역" },
      { title: "빈도 변화", description: "관찰값 비교 영역" },
      { title: "탐지 이벤트", description: "이상 빈도 경고 영역" },
    ],
  },
  "ids/payload-jump": {
    title: "Payload Jump",
    description: "데이터 값 급변 탐지를 위한 화면 구조입니다.",
    slots: [
      { title: "정상 범위", description: "Payload 기준값 영역" },
      { title: "변화 관찰", description: "값 변화 비교 영역" },
      { title: "탐지 이벤트", description: "급변 경고 영역" },
    ],
  },
  "ids/dos-detection": {
    title: "DoS Detection",
    description: "버스 과부하 탐지를 위한 화면 구조입니다.",
    slots: [
      { title: "트래픽 기준", description: "정상 처리량 기준 영역" },
      { title: "임계값", description: "DoS 판단 조건 영역" },
      { title: "대응 결과", description: "탐지와 차단 상태 영역" },
    ],
  },
  "ids/gateway": {
    title: "Gateway Policy",
    description: "게이트웨이 정책 검증을 위한 화면 구조입니다.",
    slots: [
      { title: "정책 목록", description: "허용과 차단 규칙 영역" },
      { title: "트래픽 판정", description: "규칙 적용 결과 영역" },
      { title: "정책 기록", description: "변경과 판정 이력 영역" },
    ],
  },
  results: {
    title: "학습 결과",
    description: "학습 기록과 성취도를 보여줄 화면 구조입니다.",
    slots: [
      { title: "과정별 진행", description: "과정 완료 상태 영역" },
      { title: "점수 기록", description: "학습 점수와 활동 이력 영역" },
      { title: "다음 학습", description: "추천 학습 경로 영역" },
    ],
  },
  profile: {
    title: "프로필",
    description: "학습자 정보와 활동을 보여줄 화면 구조입니다.",
    slots: [
      { title: "기본 정보", description: "학습자 정보 영역" },
      { title: "학습 현황", description: "과정 진행 상태 영역" },
      { title: "최근 활동", description: "학습 활동 기록 영역" },
    ],
  },
  models: {
    title: "3D 모델 관리",
    description: "차량 모델과 ECU 노드 매핑을 위한 화면 구조입니다.",
    slots: [
      { title: "모델 목록", description: "업로드된 모델 목록 영역" },
      { title: "버전 관리", description: "GLB 버전과 검증 상태 영역" },
      { title: "노드 매핑", description: "ECU와 차량 부품 연결 영역" },
    ],
  },
  settings: {
    title: "설정",
    description: "학습 환경 설정을 위한 화면 구조입니다.",
    slots: [
      { title: "화면", description: "테마와 글꼴 설정 영역" },
      { title: "학습 환경", description: "진행 방식 설정 영역" },
      { title: "접근성", description: "모션과 표시 설정 영역" },
    ],
  },
  about: {
    title: "프로젝트 소개",
    description: "CANLite의 목적과 개발 범위를 소개할 화면 구조입니다.",
    slots: [
      { title: "프로젝트 목표", description: "교육 목적과 대상 설명 영역" },
      { title: "현재 범위", description: "구현된 화면과 예정 기능 영역" },
      { title: "기술 구성", description: "프론트엔드 구조 설명 영역" },
    ],
  },
}

function DevToolbar() {
  const { devMode, setDevMode } = useApp()
  const [open, setOpen] = useState(false)

  if (previewAccessOpen) return null

  return (
    <div
      className="dev-toolbar"
      style={{ position: "fixed", bottom: 12, right: 12, zIndex: 9999 }}
    >
      {open && (
        <div
          className="dev-toolbar__panel"
          style={{
            marginBottom: 6,
            padding: "12px 14px",
            borderRadius: 10,
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-md)",
            minWidth: 200,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-secondary)",
              margin: "0 0 8px",
              textTransform: "uppercase",
            }}
          >
            개발자 옵션
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <button
              type="button"
              aria-label="모든 과정 잠금 해제"
              aria-pressed={devMode}
              onClick={() => setDevMode(!devMode)}
              style={{
                position: "relative",
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                backgroundColor: devMode
                  ? "var(--brand-accent)"
                  : "var(--border-strong)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "white",
                  top: 2,
                  left: devMode ? 18 : 2,
                }}
              />
            </button>
            <span style={{ color: "var(--text-primary)" }}>
              모든 과정 잠금 해제
            </span>
          </label>
        </div>
      )}
      <button
        type="button"
        className="dev-toolbar__trigger"
        onClick={() => setOpen((value) => !value)}
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-default)",
          backgroundColor: "var(--surface-elevated)",
          color: "var(--text-secondary)",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {designVersion === "ver1" ? (
          "Dev"
        ) : (
          <>
            {designVersion === "ver3" ? (
              <Settings20Regular />
            ) : (
              <Gear size={15} aria-hidden="true" />
            )}
            <span>Dev</span>
          </>
        )}
      </button>
    </div>
  )
}

function Notifications() {
  const { notifications, dismissNotification } = useApp()
  if (notifications.length === 0) return null

  const colorMap: Record<string, string> = {
    success: "var(--state-success)",
    danger: "var(--state-danger)",
    warning: "var(--state-warning)",
    info: "var(--state-info)",
  }

  return (
    <div className="app-notifications" aria-live="polite">
      {notifications.map((notification) => (
        <div
          className="app-notification"
          key={notification.id}
          style={{ borderColor: `${colorMap[notification.type]}44` }}
        >
          <div>
            <strong style={{ color: colorMap[notification.type] }}>
              {notification.title}
            </strong>
            <p>{notification.message}</p>
          </div>
          <button
            type="button"
            aria-label={`${notification.title} 알림 닫기`}
            onClick={() => dismissNotification(notification.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function Router() {
  const { currentRoute } = useApp()
  const scaffold = scaffoldPages[currentRoute]

  const getPage = () => {
    if (currentRoute === "practice/normal") {
      return <CanPracticeOnlyPage />
    }

    if (currentRoute === "practice/sender") {
      return <CanFrameSenderPage />
    }

    if (designVersion === "ver4" && currentRoute.startsWith("attacks/")) {
      return <AttackPracticePage route={currentRoute as AttackRoute} />
    }

    if (currentRoute === "models") return <ModelManagerPage />

    if (currentRoute === "badges") return <BadgePage />

    if (scaffold) return <ScaffoldPage {...scaffold} />

    switch (currentRoute) {
      case "courses":
        return <CoursePage />
      case "dashboard":
        return <DashboardPage />
      case "can-basics/protocol":
        return <ProtocolPage />
      case "can-basics/frame":
        return <FramePage />
      case "can-basics/ecu":
        return <ECUPage />
      default:
        return <CoursePage />
    }
  }

  return (
    <AppShell>
      <div style={{ height: "100%", overflow: "auto" }}>{getPage()}</div>
    </AppShell>
  )
}

export default function App() {
  return (
    <AppProvider>
      <DesignSystemProvider>
        <Router />
        <Notifications />
        <DevToolbar />
      </DesignSystemProvider>
    </AppProvider>
  )
}
