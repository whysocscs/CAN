import {
  CarProfile,
  Check,
  Eye,
  Gauge,
  Radio,
  ShieldWarning,
  TerminalWindow,
  WaveSine,
} from "@phosphor-icons/react"
import { useApp, type Route } from "@/context/AppContext"
import BeginnerCanAttackLabPage from "@/features/attack-lab/BeginnerCanAttackLabPage"
import DoorAttackLabPage from "@/features/attack-lab/DoorAttackLabPage"

export type AttackRoute = Extract<Route, `attacks/${string}`>

interface AttackFrame {
  time: string
  id: string
  data: string
  source: string
  classification: string
  highlighted?: boolean
}

interface AttackScenario {
  title: string
  description: string
  routeSummary: string
  target: string
  targetKey: string
  canId: string
  payload: string
  interval: string
  baseline: string
  expectedImpact: string
  verdict: string
  steps: string[]
  terminal: string[]
  frames: AttackFrame[]
}

const attackTabs: Array<{ route: AttackRoute; label: string }> = [
  { route: "attacks/chain", label: "전체 공격 체인" },
  { route: "attacks/spoofing", label: "Spoofing" },
  { route: "attacks/replay", label: "Replay" },
  { route: "attacks/dos", label: "DoS" },
]

const scenarios: Record<AttackRoute, AttackScenario> = {
  "attacks/chain": {
    title: "전체 공격 체인",
    description:
      "정상 트래픽 관찰부터 프레임 주입과 IDS 판정까지 이어지는 전체 실습 화면입니다.",
    routeSummary: "기준 수집 → 프레임 변조 → 차량 영향 → 탐지 비교",
    target: "Central Gateway",
    targetKey: "gateway",
    canId: "0x316",
    payload: "7D 00 00 00 00 00 00 00",
    interval: "10 ms",
    baseline: "정상 주기 100 ms",
    expectedImpact: "계기판 속도값 비정상 변화",
    verdict: "Unknown ID와 Frequency 규칙을 함께 비교",
    steps: [
      "정상 패턴 수집",
      "위조 조건 설정",
      "공격 경로 관찰",
      "탐지 결과 비교",
    ],
    terminal: [
      "$ candump vcan0",
      "vcan0 316 [8] 28 00 00 00 00 00 00 00",
      "$ cansend vcan0 316#7D00000000000000",
      "예상 결과: Cluster 수신값 변화",
    ],
    frames: [
      {
        time: "12:08:14.120",
        id: "0x316",
        data: "28 00 00 00 00 00 00 00",
        source: "Powertrain",
        classification: "정상 기준",
      },
      {
        time: "12:08:14.130",
        id: "0x316",
        data: "7D 00 00 00 00 00 00 00",
        source: "Injection",
        classification: "위조 예시",
        highlighted: true,
      },
      {
        time: "12:08:14.140",
        id: "0x220",
        data: "01 42 10 00 00 00 00 00",
        source: "Gateway",
        classification: "정상 통과",
      },
    ],
  },
  "attacks/spoofing": {
    title: "CAN Spoofing",
    description:
      "정상 ECU와 같은 CAN ID를 사용한 위조 프레임이 차량 상태에 미치는 영향을 확인하는 화면입니다.",
    routeSummary: "정상 프레임 → 동일 ID 위조 → Cluster 반영 → 규칙 판정",
    target: "Instrument Cluster",
    targetKey: "cluster",
    canId: "0x316",
    payload: "A0 00 00 00 00 00 00 00",
    interval: "20 ms",
    baseline: "속도값 40 km/h",
    expectedImpact: "표시 속도 160 km/h로 변화",
    verdict: "Payload Jump 규칙의 판정 근거 표시",
    steps: [
      "정상 계기판 확인",
      "위조 Payload 작성",
      "주입 경로 확인",
      "표시값 비교",
    ],
    terminal: [
      "$ candump vcan0,316:7FF",
      "vcan0 316 [8] 28 00 00 00 00 00 00 00",
      "$ cansend vcan0 316#A000000000000000",
      "예상 결과: 속도 Payload 급변 표시",
    ],
    frames: [
      {
        time: "12:11:03.200",
        id: "0x316",
        data: "28 00 00 00 00 00 00 00",
        source: "Powertrain",
        classification: "정상 40 km/h",
      },
      {
        time: "12:11:03.220",
        id: "0x316",
        data: "A0 00 00 00 00 00 00 00",
        source: "Injection",
        classification: "위조 160 km/h",
        highlighted: true,
      },
      {
        time: "12:11:03.240",
        id: "0x316",
        data: "28 00 00 00 00 00 00 00",
        source: "Powertrain",
        classification: "정상 복귀",
      },
    ],
  },
  "attacks/replay": {
    title: "Replay Attack",
    description:
      "기록한 정상 프레임을 다른 시점에 반복 전송하고 시간 패턴의 차이를 비교하는 화면입니다.",
    routeSummary: "정상 기록 → 구간 선택 → 프레임 재생 → 시간 패턴 비교",
    target: "Body Control Module",
    targetKey: "body",
    canId: "0x2A0",
    payload: "01 00 20 00 00 00 00 00",
    interval: "50 ms",
    baseline: "기록 구간 4.8 s",
    expectedImpact: "도어 상태 프레임 반복 수신",
    verdict: "Timestamp와 반복 주기 차이를 나란히 표시",
    steps: [
      "정상 프레임 기록",
      "재생 구간 선택",
      "반복 경로 확인",
      "시간 패턴 비교",
    ],
    terminal: [
      "$ candump -L vcan0 > sample.log",
      "(168120.044) vcan0 2A0#0100200000000000",
      "$ canplayer -I sample.log -l 2",
      "예상 결과: 동일 Payload 반복 수신",
    ],
    frames: [
      {
        time: "12:14:51.044",
        id: "0x2A0",
        data: "01 00 20 00 00 00 00 00",
        source: "Body ECU",
        classification: "원본 기록",
      },
      {
        time: "12:15:07.410",
        id: "0x2A0",
        data: "01 00 20 00 00 00 00 00",
        source: "Replay",
        classification: "재생 프레임",
        highlighted: true,
      },
      {
        time: "12:15:07.460",
        id: "0x2A0",
        data: "01 00 20 00 00 00 00 00",
        source: "Replay",
        classification: "반복 주기",
      },
    ],
  },
  "attacks/dos": {
    title: "DoS Attack",
    description:
      "높은 우선순위 프레임이 CAN 버스를 점유할 때 정상 ECU의 지연과 복구 흐름을 확인하는 화면입니다.",
    routeSummary: "정상 부하 → 우선순위 점유 → 전송 지연 → 버스 복구",
    target: "CAN Bus",
    targetKey: "gateway",
    canId: "0x000",
    payload: "00 00 00 00 00 00 00 00",
    interval: "1 ms",
    baseline: "샘플 부하 18%",
    expectedImpact: "정상 프레임 대기시간 증가",
    verdict: "Bus Load와 Frequency 임계값을 함께 표시",
    steps: [
      "정상 버스 부하 확인",
      "우선순위 ID 선택",
      "점유 구간 관찰",
      "중지 후 복구 확인",
    ],
    terminal: [
      "$ cangen vcan0 -I 000 -L 8 -g 1",
      "vcan0 000 [8] 00 00 00 00 00 00 00 00",
      "예상 상태: arbitration 우선순위 점유",
      "중지 후 정상 프레임 주기 비교",
    ],
    frames: [
      {
        time: "12:18:22.002",
        id: "0x220",
        data: "01 42 10 00 00 00 00 00",
        source: "Brake ECU",
        classification: "정상 기준",
      },
      {
        time: "12:18:22.003",
        id: "0x000",
        data: "00 00 00 00 00 00 00 00",
        source: "Generator",
        classification: "고빈도 예시",
        highlighted: true,
      },
      {
        time: "12:18:22.004",
        id: "0x000",
        data: "00 00 00 00 00 00 00 00",
        source: "Generator",
        classification: "버스 점유",
      },
    ],
  },
}

const ecuNodes = [
  { key: "powertrain", label: "Powertrain", detail: "0x316" },
  { key: "cluster", label: "Cluster", detail: "표시 계통" },
  { key: "gateway", label: "Gateway", detail: "라우팅" },
  { key: "brake", label: "Brake", detail: "0x220" },
  { key: "body", label: "Body ECU", detail: "0x2A0" },
  { key: "steering", label: "Steering", detail: "0x180" },
]

function ScenarioTabs({ current }: { current: AttackRoute }) {
  const { navigate } = useApp()

  return (
    <nav className="attack-preview__tabs" aria-label="공격 실습 선택">
      {attackTabs.map((tab) => (
        <button
          type="button"
          key={tab.route}
          className={tab.route === current ? "is-active" : undefined}
          aria-current={tab.route === current ? "page" : undefined}
          onClick={() => navigate(tab.route)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function ProcedureRoute({ steps }: { steps: string[] }) {
  return (
    <section
      className="attack-preview__procedure"
      aria-labelledby="attack-procedure-title"
    >
      <header>
        <div>
          <h2 id="attack-procedure-title">공격 진행 경로</h2>
          <p>실제 기능이 연결될 때 사용자가 따라갈 학습 순서입니다.</p>
        </div>
        <span>두 번째 단계 화면 예시</span>
      </header>
      <ol>
        {steps.map((step, index) => {
          const state =
            index === 0 ? "complete" : index === 1 ? "current" : "next"
          return (
            <li
              key={step}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="attack-preview__station" aria-hidden="true">
                {state === "complete" ? (
                  <Check size={11} weight="bold" />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <small>
                  {state === "complete"
                    ? "확인 완료 예시"
                    : state === "current"
                      ? "현재 단계 예시"
                      : "다음 단계"}
                </small>
                <strong>{step}</strong>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function NetworkStage({ scenario }: { scenario: AttackScenario }) {
  return (
    <section
      className="attack-preview__network"
      aria-labelledby="attack-network-title"
    >
      <header className="attack-preview__panel-heading">
        <div>
          <h2 id="attack-network-title">차량 CAN 네트워크</h2>
          <p>{scenario.routeSummary}</p>
        </div>
        <span>
          <Radio size={15} aria-hidden="true" /> 샘플 데이터
        </span>
      </header>

      <div className="attack-preview__network-body">
        <div className="attack-preview__injection-source">
          <ShieldWarning size={25} weight="duotone" aria-hidden="true" />
          <div>
            <small>공격 입력 영역</small>
            <strong>vcan0 injector</strong>
            <code>{scenario.canId}</code>
          </div>
        </div>

        <div className="attack-preview__attack-route" aria-hidden="true">
          <span />
        </div>

        <div className="attack-preview__vehicle-map">
          <div className="attack-preview__vehicle-mark" aria-hidden="true">
            <CarProfile size={54} weight="thin" />
            <span>CAN backbone</span>
          </div>
          <div className="attack-preview__ecu-grid">
            {ecuNodes.map((node) => (
              <div
                key={node.key}
                className="attack-preview__ecu"
                data-target={node.key === scenario.targetKey ? "true" : "false"}
              >
                <span aria-hidden="true" />
                <div>
                  <strong>{node.label}</strong>
                  <small>
                    {node.key === scenario.targetKey
                      ? `대상 ${node.detail}`
                      : node.detail}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="attack-preview__trace">
        <div>
          <WaveSine size={18} aria-hidden="true" />
          <span>
            <small>차동 신호 표시 영역</small>
            <strong>CAN H / CAN L</strong>
          </span>
        </div>
        <svg
          viewBox="0 0 600 64"
          role="img"
          aria-label="CAN 차동 신호 샘플 파형"
        >
          <path
            className="attack-preview__trace-high"
            d="M0 22H70V8H140V22H220V8H310V22H390V8H470V22H600"
          />
          <path
            className="attack-preview__trace-low"
            d="M0 42H70V56H140V42H220V56H310V42H390V56H470V42H600"
          />
        </svg>
        <span className="attack-preview__trace-rate">500 kbit/s</span>
      </div>
    </section>
  )
}

function ConditionRail({ scenario }: { scenario: AttackScenario }) {
  return (
    <aside
      className="attack-preview__conditions"
      aria-labelledby="attack-condition-title"
    >
      <header className="attack-preview__panel-heading">
        <div>
          <h2 id="attack-condition-title">공격 조건</h2>
          <p>입력 제어가 배치될 읽기 전용 예시입니다.</p>
        </div>
        <Gauge size={19} aria-hidden="true" />
      </header>

      <dl className="attack-preview__condition-list">
        <div>
          <dt>대상</dt>
          <dd>{scenario.target}</dd>
        </div>
        <div>
          <dt>CAN ID</dt>
          <dd className="mono">{scenario.canId}</dd>
        </div>
        <div>
          <dt>Payload</dt>
          <dd className="mono">{scenario.payload}</dd>
        </div>
        <div>
          <dt>전송 간격</dt>
          <dd className="mono">{scenario.interval}</dd>
        </div>
      </dl>

      <div className="attack-preview__observation">
        <h3>관찰 지점</h3>
        <dl>
          <div>
            <dt>정상 기준</dt>
            <dd>{scenario.baseline}</dd>
          </div>
          <div>
            <dt>예상 영향</dt>
            <dd>{scenario.expectedImpact}</dd>
          </div>
          <div>
            <dt>IDS 판정</dt>
            <dd>{scenario.verdict}</dd>
          </div>
        </dl>
      </div>

      <p className="attack-preview__excluded-note">
        실행, 중지, 초기화 제어는 실제 연결 단계에서 추가하며 현재 저장소에는
        포함하지 않습니다.
      </p>
    </aside>
  )
}

function EvidenceLedger({ scenario }: { scenario: AttackScenario }) {
  return (
    <section
      className="attack-preview__ledger"
      aria-labelledby="attack-ledger-title"
    >
      <header className="attack-preview__panel-heading">
        <div>
          <h2 id="attack-ledger-title">CAN 증거 비교</h2>
          <p>터미널과 프레임 모니터가 함께 표시될 영역입니다.</p>
        </div>
        <span>모든 값은 화면 구성용 샘플</span>
      </header>

      <div className="attack-preview__ledger-grid">
        <div className="attack-preview__terminal">
          <div>
            <TerminalWindow size={17} aria-hidden="true" />
            <strong>명령 미리보기</strong>
          </div>
          <pre aria-label="공격 명령 샘플">
            {scenario.terminal.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </pre>
        </div>

        <div className="attack-preview__frames">
          <table>
            <caption>CAN 프레임 샘플 비교</caption>
            <thead>
              <tr>
                <th>시각</th>
                <th>ID</th>
                <th>DATA</th>
                <th>출처</th>
                <th>분류</th>
              </tr>
            </thead>
            <tbody>
              {scenario.frames.map((frame) => (
                <tr
                  key={`${frame.time}-${frame.source}`}
                  data-highlighted={frame.highlighted ? "true" : "false"}
                >
                  <td className="mono">{frame.time}</td>
                  <td className="mono">{frame.id}</td>
                  <td className="mono">{frame.data}</td>
                  <td>{frame.source}</td>
                  <td>{frame.classification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default function AttackPracticePage({ route }: { route: AttackRoute }) {
  if (route === "attacks/chain") {
    return (
      <main className="attack-preview attack-preview--door-lab">
        <ScenarioTabs current={route} />
        <DoorAttackLabPage />
      </main>
    )
  }

  if (route === "attacks/spoofing" || route === "attacks/replay") {
    const scenario = route === "attacks/spoofing" ? "spoofing" : "replay"
    return (
      <main className="attack-preview attack-preview--door-lab">
        <ScenarioTabs current={route} />
        <BeginnerCanAttackLabPage key={route} scenario={scenario} />
      </main>
    )
  }

  const scenario = scenarios[route]

  return (
    <main className="attack-preview">
      <header className="attack-preview__intro">
        <div>
          <h1>{scenario.title}</h1>
          <p>{scenario.description}</p>
        </div>
        <div className="attack-preview__preview-label">
          <Eye size={19} aria-hidden="true" />
          <span>
            <strong>정적 UI 미리보기</strong>
            <small>실행 및 통신 기능 제외</small>
          </span>
        </div>
      </header>

      <ScenarioTabs current={route} />
      <ProcedureRoute steps={scenario.steps} />

      <div className="attack-preview__board">
        <NetworkStage scenario={scenario} />
        <ConditionRail scenario={scenario} />
      </div>

      <EvidenceLedger scenario={scenario} />
    </main>
  )
}
