import type { CSSProperties } from "react"

export type FrameFieldGroup =
  | "sof"
  | "arbitration"
  | "control"
  | "data"
  | "crc"
  | "ack"
  | "eof"

export type FrameField = {
  id: string
  name: string
  shortName: string
  group: FrameFieldGroup
  bitLabel: string
  overviewDescription: string
  overviewValue?: string
  role: string
  fixedValue?: 0 | 1
  fixedState?: "Dominant" | "Recessive"
  exampleBits?: string
  exampleLabel?: string
  width: number
}

export type FrameFocus =
  | "all"
  | "arbitration"
  | "control-data"
  | "integrity"
  | "stuffing"

export const classicalCanFields: readonly FrameField[] = [
  {
    id: "sof",
    name: "Start of Frame (SOF)",
    shortName: "SOF",
    group: "sof",
    bitLabel: "1 bit",
    overviewDescription: "새로운 CAN Frame의 시작을 알립니다.",
    overviewValue: "Data Frame 시작 값: 0",
    role: "Bus Idle 뒤 Frame의 시작을 알립니다.",
    fixedValue: 0,
    fixedState: "Dominant",
    exampleBits: "0",
    width: 1,
  },
  {
    id: "identifier",
    name: "Identifier",
    shortName: "ID [10:0]",
    group: "arbitration",
    bitLabel: "11 bits",
    overviewDescription: "CAN 메시지를 구분하고 Arbitration 우선순위에 사용됩니다.",
    overviewValue: "Standard CAN: 11-bit Identifier",
    role: "메시지를 식별하고 Bus 중재 우선순위에 사용됩니다. ECU 주소가 아닙니다.",
    exampleBits: "00100000001",
    exampleLabel: "0x101",
    width: 3.2,
  },
  {
    id: "rtr",
    name: "Remote Transmission Request (RTR)",
    shortName: "RTR",
    group: "arbitration",
    bitLabel: "1 bit",
    overviewDescription: "Data Frame과 Remote Frame을 구분하는 데 사용됩니다.",
    overviewValue: "Data Frame: RTR = 0",
    role: "Data Frame과 Remote Frame을 구분합니다. Standard Data Frame에서는 0입니다.",
    fixedValue: 0,
    fixedState: "Dominant",
    exampleBits: "0",
    exampleLabel: "Data Frame",
    width: 1,
  },
  {
    id: "ide",
    name: "Identifier Extension (IDE)",
    shortName: "IDE",
    group: "control",
    bitLabel: "1 bit",
    overviewDescription: "Standard Frame과 Extended Frame 형식을 구분합니다.",
    overviewValue: "Standard Frame: IDE = 0",
    role: "Standard와 Extended 형식을 구분합니다. Standard Frame에서는 0입니다.",
    fixedValue: 0,
    fixedState: "Dominant",
    exampleBits: "0",
    exampleLabel: "Standard",
    width: 1,
  },
  {
    id: "r0",
    name: "Reserved bit (r0)",
    shortName: "r0",
    group: "control",
    bitLabel: "1 bit",
    overviewDescription: "Classical Standard CAN에서 사용하는 Reserved bit입니다.",
    overviewValue: "값: 0",
    role: "Classical Standard CAN의 reserved bit이며 0으로 전송합니다.",
    fixedValue: 0,
    fixedState: "Dominant",
    exampleBits: "0",
    width: 1,
  },
  {
    id: "dlc",
    name: "Data Length Code (DLC)",
    shortName: "DLC [3:0]",
    group: "control",
    bitLabel: "4 bits",
    overviewDescription: "뒤따르는 Data Field의 길이를 나타냅니다.",
    overviewValue: "Classical CAN: 0~8 bytes",
    role: "뒤따르는 Data Field의 길이를 나타냅니다. Classical CAN Data Frame에서는 0~8 bytes입니다.",
    exampleBits: "0001",
    exampleLabel: "1 byte",
    width: 1.8,
  },
  {
    id: "data",
    name: "Data Field",
    shortName: "DATA",
    group: "data",
    bitLabel: "0–64 bits",
    overviewDescription: "ECU가 전달하려는 실제 데이터를 담습니다.",
    overviewValue: "Classical CAN: 최대 8 bytes",
    role: "0~8 bytes의 실제 payload를 전달합니다. 현재 예제 0x01은 1 byte입니다.",
    exampleBits: "00000001",
    exampleLabel: "0x01 · 8 bits",
    width: 4.2,
  },
  {
    id: "crc-sequence",
    name: "CRC Sequence",
    shortName: "CRC SEQ",
    group: "crc",
    bitLabel: "15 bits",
    overviewDescription: "Frame 전송 중 발생한 오류를 검출하는 데 사용됩니다.",
    role: "CRC-15/CAN 계산값으로 전송 중 bit 오류를 검출합니다.",
    exampleLabel: "15-bit calculated value",
    width: 3,
  },
  {
    id: "crc-delimiter",
    name: "CRC Delimiter",
    shortName: "CRC DEL",
    group: "crc",
    bitLabel: "1 bit",
    overviewDescription: "CRC Sequence와 뒤의 ACK Field를 구분합니다.",
    overviewValue: "고정 값: 1",
    role: "CRC Sequence와 ACK Field 사이를 구분하는 고정 Recessive bit입니다.",
    fixedValue: 1,
    fixedState: "Recessive",
    exampleBits: "1",
    width: 1.2,
  },
  {
    id: "ack-slot",
    name: "ACK Slot",
    shortName: "ACK SLOT",
    group: "ack",
    bitLabel: "1 bit",
    overviewDescription: "다른 CAN 노드가 Frame을 정상 수신했는지 확인하는 영역입니다.",
    role: "송신자는 1을 보내고, 오류 없이 수신한 다른 노드는 0으로 덮어씁니다.",
    exampleLabel: "TX 1 · RX 0 · Bus 0",
    width: 1.3,
  },
  {
    id: "ack-delimiter",
    name: "ACK Delimiter",
    shortName: "ACK DEL",
    group: "ack",
    bitLabel: "1 bit",
    overviewDescription: "ACK Slot의 끝을 구분합니다.",
    overviewValue: "고정 값: 1",
    role: "ACK Slot 뒤의 고정 Recessive bit입니다.",
    fixedValue: 1,
    fixedState: "Recessive",
    exampleBits: "1",
    width: 1.2,
  },
  {
    id: "eof",
    name: "End of Frame (EOF)",
    shortName: "EOF",
    group: "eof",
    bitLabel: "7 bits",
    overviewDescription: "CAN Frame의 끝을 표시합니다.",
    overviewValue: "7개의 연속된 1",
    role: "7개의 연속 Recessive 1로 Data Frame의 끝을 표시합니다.",
    fixedValue: 1,
    fixedState: "Recessive",
    exampleBits: "1111111",
    width: 2.2,
  },
] as const

const groupLabels: readonly {
  id: FrameFieldGroup
  label: string
  width: number
}[] = [
  { id: "sof", label: "START", width: 1 },
  { id: "arbitration", label: "ARBITRATION FIELD", width: 4.2 },
  { id: "control", label: "CONTROL FIELD", width: 3.8 },
  { id: "data", label: "DATA FIELD", width: 4.2 },
  { id: "crc", label: "CRC FIELD", width: 4.2 },
  { id: "ack", label: "ACK FIELD", width: 2.5 },
  { id: "eof", label: "END", width: 2.2 },
]

const focusGroups: Record<FrameFocus, readonly FrameFieldGroup[]> = {
  all: ["sof", "arbitration", "control", "data", "crc", "ack", "eof"],
  arbitration: ["sof", "arbitration"],
  "control-data": ["control", "data"],
  integrity: ["crc", "ack", "eof"],
  stuffing: ["sof", "arbitration", "control", "data", "crc"],
}

export function FrameNotationVisual() {
  return (
    <div
      className="frame-notation"
      role="img"
      aria-label="축약 표기 0x101#01은 Identifier 0x101과 Data 01만 보여주지만 실제 wire Frame에는 SOF, Arbitration, Control, Data, CRC, ACK, EOF가 포함됩니다."
    >
      <small>교육용 / 분석 도구 표기</small>
      <code>0x101#01</code>
      <dl>
        <div><dt>0x101</dt><dd>Identifier</dd></div>
        <div><dt>#</dt><dd>구분 기호</dd></div>
        <div><dt>01</dt><dd>Data</dd></div>
      </dl>
      <span>실제 CAN Bus에서는</span>
      <i aria-hidden="true">↓</i>
      <p>SOF · Arbitration · Control · Data · CRC · ACK · EOF</p>
    </div>
  )
}

export function FrameIntroductionVisual() {
  const groups = ["SOF", "Arbitration", "Control", "Data", "CRC", "ACK", "EOF"]
  return (
    <div className="frame-introduction" role="img" aria-label="CAN Frame은 SOF, Arbitration, Control, Data, CRC, ACK, EOF 그룹이 정해진 순서로 이어집니다.">
      <small>CLASSICAL CAN DATA FRAME</small>
      <strong>하나의 메시지</strong>
      <div>
        {groups.map((group) => <span key={group}>{group}</span>)}
      </div>
      <p>시작 · 식별 · 제어 · 데이터 · 오류 검증 · 수신 확인 · 종료</p>
    </div>
  )
}

export function FrameAnatomyVisual({
  focus,
  selectedField,
  onSelect,
}: {
  focus: FrameFocus
  selectedField: FrameField | null
  onSelect: (field: FrameField) => void
}) {
  const activeGroups = focusGroups[focus]
  const effectiveField =
    selectedField && activeGroups.includes(selectedField.group)
      ? selectedField
      : (classicalCanFields.find((field) =>
          activeGroups.includes(field.group),
        ) ?? classicalCanFields[0])
  const selectedIndex = classicalCanFields.findIndex(
    (field) => field.id === effectiveField.id,
  )
  const selectRelativeField = (offset: number) => {
    const nextIndex = Math.min(
      classicalCanFields.length - 1,
      Math.max(0, selectedIndex + offset),
    )
    onSelect(classicalCanFields[nextIndex])
  }

  return (
    <div className="frame-anatomy" data-focus={focus}>
      <div className="frame-anatomy__note">Classical CAN Standard Data Frame 기준</div>
      {focus === "stuffing" && (
        <div className="frame-anatomy__stuff-range">
          <span>BIT STUFFING 적용 · SOF → CRC Sequence 끝</span>
        </div>
      )}
      <div className="frame-anatomy__viewport">
        <div className="frame-anatomy__map">
          <div className="frame-anatomy__groups" aria-hidden="true">
            <span className="is-context">BUS IDLE</span>
            {groupLabels.map((group) => (
              <span
                key={group.id}
                className={activeGroups.includes(group.id) ? "is-active" : ""}
                style={{ "--frame-field-width": group.width } as CSSProperties}
              >
                {group.label}
              </span>
            ))}
            <span className="is-context">INTERMISSION</span>
          </div>
          <div className="frame-anatomy__strip" role="group" aria-label="Standard CAN Data Frame 세부 필드">
            <span className="frame-anatomy__context">Idle<br /><small>Frame 밖</small></span>
            {classicalCanFields.map((field) => {
              const selected = effectiveField.id === field.id
              const active = activeGroups.includes(field.group)
              return (
                <button
                  key={field.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${field.name}, ${field.bitLabel}. ${field.role}`}
                  className={`${selected ? "is-selected" : ""}${active ? " is-active" : " is-muted"}`}
                  style={{ "--frame-field-width": field.width } as CSSProperties}
                  onClick={() => onSelect(field)}
                >
                  <b>{field.shortName}</b>
                  <small>{field.bitLabel}</small>
                  {focus !== "all" && field.fixedValue !== undefined && (
                    <em>{field.fixedValue} · {field.fixedState}</em>
                  )}
                </button>
              )
            })}
            <span className="frame-anatomy__context">3 bits<br /><small>Frame 밖</small></span>
          </div>
        </div>
      </div>

      {focus === "all" ? (
        <FieldOverviewInspector
          field={effectiveField}
          index={selectedIndex}
          onPrevious={() => selectRelativeField(-1)}
          onNext={() => selectRelativeField(1)}
        />
      ) : (
        <div className="frame-anatomy__detail" aria-live="polite">
          <span>
            <small>{effectiveField.group.toUpperCase()}</small>
            <strong>{effectiveField.name}</strong>
            <code>{effectiveField.bitLabel}</code>
          </span>
          <p>{effectiveField.role}</p>
          {(effectiveField.exampleBits || effectiveField.exampleLabel) && (
            <span className="frame-anatomy__example">
              {effectiveField.exampleLabel && <b>{effectiveField.exampleLabel}</b>}
              {effectiveField.exampleBits && <code>{effectiveField.exampleBits}</code>}
            </span>
          )}
        </div>
      )}

      {focus === "arbitration" && <ArbitrationFieldDetail />}
      {focus === "control-data" && <ControlDataDetail />}
      {focus === "integrity" && <IntegrityDetail />}
      {focus === "stuffing" && <StuffingDetail />}
    </div>
  )
}

function BitCells({ bits, label }: { bits: string; label: string }) {
  return (
    <code className="frame-playground__bits" aria-label={label}>
      {[...bits].map((bit, index) => <i key={`${bit}-${index}`}>{bit}</i>)}
    </code>
  )
}

function FieldOverviewInspector({
  field,
  index,
  onPrevious,
  onNext,
}: {
  field: FrameField
  index: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <section className="frame-overview-inspector" aria-live="polite" aria-label={`${field.name} 기본 정보`}>
      <header><small>{field.group.toUpperCase()}</small><strong>{field.name}</strong><code>{field.bitLabel}</code></header>
      <div><p>{field.overviewDescription}</p>{field.overviewValue && <strong>{field.overviewValue}</strong>}</div>
      <nav aria-label="Frame field 순차 탐색">
        <button type="button" onClick={onPrevious} disabled={index === 0}>← Previous Field</button>
        <span>{field.shortName} <b>{index + 1} / {classicalCanFields.length}</b></span>
        <button type="button" onClick={onNext} disabled={index === classicalCanFields.length - 1}>Next Field →</button>
      </nav>
    </section>
  )
}

function ArbitrationFieldDetail() {
  return (
    <div className="frame-anatomy__addon frame-arbitration-detail">
      <section className="frame-detail-sof">
        <span><small>BUS IDLE</small><BitCells bits="11111" label="Bus Idle의 다섯 Recessive bit" /></span>
        <b aria-hidden="true">→</b>
        <span><small>SOF</small><BitCells bits="0" label="SOF Dominant 0" /><em>Dominant</em></span>
      </section>
      <div>
        <small>ID[10] · MSB</small>
        <code aria-label="Identifier 0x101의 11 bit binary">{[..."00100000001"].map((bit, index) => <i key={index}>{bit}</i>)}</code>
        <small>ID[0] · LSB</small>
      </div>
      <dl>
        <div><dt>DATA FRAME</dt><dd>RTR = 0 · Dominant</dd></div>
        <div><dt>REMOTE REQUEST</dt><dd>RTR = 1 · Recessive</dd></div>
      </dl>
    </div>
  )
}

function ControlDataDetail() {
  return (
    <div className="frame-anatomy__addon frame-control-detail">
      <span><small>IDE</small><code>0</code><b>Standard</b></span>
      <span><small>r0</small><code>0</code><b>Reserved</b></span>
      <span><small>DLC</small><code>0001</code><b>1 byte</b></span>
      <i aria-hidden="true">→</i>
      <span className="is-data"><small>DATA 0x01</small><code>00000001</code><b>8 bits</b></span>
    </div>
  )
}

function IntegrityDetail() {
  return (
    <div className="frame-anatomy__addon frame-integrity-detail">
      <dl>
        <div><dt>CRC Sequence</dt><dd>15-bit calculated value</dd></div>
        <div><dt>CRC Delimiter</dt><dd>1 · Recessive</dd></div>
        <div><dt>ACK Delimiter</dt><dd>1 · Recessive</dd></div>
        <div><dt>EOF</dt><dd>1111111 · 7 Recessive</dd></div>
      </dl>
      <div className="frame-ack-matrix" aria-label="ACK Slot에서 송신자는 Recessive 1, 정상 수신 노드는 Dominant 0, Bus 결과는 Dominant 0입니다.">
        <span><small>TX · Transmitter</small><strong>1</strong><em>Recessive</em></span>
        <span><small>RX · Receiver</small><strong>0</strong><em>Dominant</em></span>
        <span className="is-result"><small>BUS RESULT</small><strong>0</strong><em>Dominant</em></span>
      </div>
      <p><strong>ACK는 특정 ECU가 메시지 내용을 사용했다는 의미가 아닙니다.</strong> 하나 이상의 다른 CAN 노드가 Frame을 오류 없이 수신했음을 의미합니다.</p>
    </div>
  )
}

function StuffingDetail() {
  return (
    <div className="frame-anatomy__addon frame-stuffing-detail">
      <div>
        <span><small>원본</small><code>00000</code></span>
        <i>→</i>
        <span><small>wire 전송</small><code>00000<b>1</b></code><em>Stuff Bit</em></span>
      </div>
      <dl>
        <div><dt>적용</dt><dd>SOF → CRC Sequence</dd></div>
        <div><dt>미적용</dt><dd>CRC Delimiter → Intermission</dd></div>
        <div><dt>현재 예제</dt><dd>44 + 8 × 1 = 52 nominal bits</dd></div>
      </dl>
      <p>Stuff Bit는 nominal field length에 포함되지 않습니다. Intermission 3 bits도 Data Frame 밖의 최소 간격입니다.</p>
      <div className="frame-intermission-flow" aria-label="EOF 일곱 Recessive bit 다음에 Frame 밖의 Intermission 세 Recessive bit가 이어지고 Bus Idle로 돌아갑니다.">
        <span><small>EOF</small><code>1111111</code></span><i>→</i><span><small>INTERMISSION · FRAME 밖</small><code>111</code></span><i>→</i><span><small>BUS IDLE</small><code>1…</code></span>
      </div>
    </div>
  )
}

export function FrameApplicationVisual({
  frameType,
  onChange,
}: {
  frameType: "standard" | "extended"
  onChange: (type: "standard" | "extended") => void
}) {
  return (
    <div className="frame-application">
      <section aria-label="분석 도구 표기 0x101#01을 Identifier, DLC, Data 예제와 연결합니다.">
        <small>분석 도구 표기</small>
        <code>0x101#01</code>
        <div><span><small>Identifier</small><b>0x101</b><em>00100000001</em></span><i>+</i><span><small>DLC</small><b>0001</b><em>1 byte</em></span><i>+</i><span><small>Data</small><b>01</b><em>00000001</em></span></div>
        <p><b>#</b>은 실제 wire Field가 아니라 분석 도구의 구분 표기입니다.</p>
      </section>
      <FrameComparisonVisual frameType={frameType} onChange={onChange} />
    </div>
  )
}

export function FrameComparisonVisual({
  frameType,
  onChange,
}: {
  frameType: "standard" | "extended"
  onChange: (type: "standard" | "extended") => void
}) {
  return (
    <div className="frame-comparison">
      <div className="frame-comparison__tabs" role="group" aria-label="CAN Frame 형식 선택">
        <button type="button" className={frameType === "standard" ? "is-active" : ""} aria-pressed={frameType === "standard"} onClick={() => onChange("standard")}>Standard · 11-bit</button>
        <button type="button" className={frameType === "extended" ? "is-active" : ""} aria-pressed={frameType === "extended"} onClick={() => onChange("extended")}>Extended · 29-bit</button>
      </div>
      <div className="frame-comparison__diagram" role="img" aria-label={frameType === "standard" ? "Standard Frame의 Arbitration Field는 11-bit Identifier와 RTR로 구성되고 Control Field에는 IDE, r0, DLC가 이어집니다." : "Extended Frame의 Arbitration Field에는 Base Identifier, SRR, IDE, Extended Identifier, RTR이 순서대로 이어집니다."}>
        {frameType === "standard" ? (
          <>
            <small>STANDARD CAN 2.0A · MAX 0x7FF</small>
            <div><span className="is-wide">Base Identifier<em>11 bits</em></span><span>RTR<em>1</em></span><span>IDE<em>0</em></span><span>r0<em>0</em></span><span>DLC<em>4</em></span></div>
            <p>Arbitration: Identifier + RTR · Control: IDE + r0 + DLC</p>
          </>
        ) : (
          <>
            <small>EXTENDED CAN 2.0B · MAX 0x1FFFFFFF</small>
            <div><span className="is-wide">Base ID<em>11 bits</em></span><span>SRR<em>1</em></span><span>IDE<em>1</em></span><span className="is-wide">Extended ID<em>18 bits</em></span><span>RTR<em>1</em></span><span>r1<em>1</em></span><span>r0<em>1</em></span><span>DLC<em>4</em></span></div>
            <p>Arbitration: Base ID + SRR + IDE + Extended ID + RTR · Control: r1 + r0 + DLC</p>
          </>
        )}
      </div>
      <dl className="frame-comparison__facts">
        <div><dt>Identifier</dt><dd>{frameType === "standard" ? "11 bits" : "29 bits"}</dd></div>
        <div><dt>최대 ID</dt><dd>{frameType === "standard" ? "0x7FF" : "0x1FFFFFFF"}</dd></div>
        <div><dt>형식 구분</dt><dd>{frameType === "standard" ? "IDE = 0" : "SRR + IDE = 1"}</dd></div>
      </dl>
    </div>
  )
}
