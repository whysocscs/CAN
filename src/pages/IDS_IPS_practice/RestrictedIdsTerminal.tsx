import { useEffect, useState, type FormEvent } from "react"
import { CaretRight, TerminalWindow } from "@phosphor-icons/react"

const API_BASE = import.meta.env.VITE_CAN_API_BASE
  ?? (typeof window === "undefined" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8010"
    : `${window.location.protocol}//${window.location.hostname}:8010`)

type Scenario = "rule-based" | "period-based" | "counter-status"
type Entry = { command: string; output: string; ok: boolean }

interface Props {
  scenario: Scenario
  onCommand?: (command: string) => void
}

/** Same restricted REST virtual-shell pattern used by the attack labs. */
export default function RestrictedIdsTerminal({ scenario, onCommand }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [command, setCommand] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`${API_BASE}/labs/ids-ips/${scenario}/sessions`, {
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("IDS/IPS lab API is unavailable")
        return response.json() as Promise<{ sessionId: string }>
      })
      .then((state) => setSessionId(state.sessionId))
      .catch(() => setEntries([{ command: "system", output: "IDS/IPS lab API is unavailable.", ok: false }]))
    return () => controller.abort()
  }, [scenario])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const submitted = command.trim()
    if (!submitted || !sessionId || busy) return
    setBusy(true)
    try {
      const response = await fetch(
        `${API_BASE}/labs/ids-ips/${scenario}/sessions/${encodeURIComponent(sessionId)}/terminal`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: submitted }) },
      )
      const result = await response.json() as { ok?: boolean; output?: string }
      setEntries((current) => [...current, { command: submitted, output: result.output ?? "Command failed.", ok: Boolean(result.ok) }])
      if (result.ok) onCommand?.(submitted)
    } catch {
      setEntries((current) => [...current, { command: submitted, output: "IDS/IPS lab API is unavailable.", ok: false }])
    } finally {
      setCommand("")
      setBusy(false)
    }
  }

  return (
    <section className="door-attack-lab__terminal" role="region" aria-label="Restricted IDS terminal">
      <header className="door-attack-lab__panel-heading">
        <div><TerminalWindow size={18} aria-hidden="true" /><span><strong>Restricted terminal</strong><small>REST virtual shell · host shell 아님</small></span></div>
        <span>vcan0 sandbox</span>
      </header>
      <div className="door-attack-lab__terminal-output" aria-live="polite">
        <p>허용된 명령만 실행됩니다. <code>ls</code>, <code>candump -L vcan0</code>, <code>cansend vcan0 101#00</code></p>
        {entries.map((entry, index) => <div key={`${entry.command}-${index}`} data-ok={entry.ok ? "true" : "false"}><strong>$ {entry.command}</strong><pre>{entry.output}</pre></div>)}
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <span aria-hidden="true">$</span>
        <input aria-label="제한된 IDS 명령" value={command} onChange={(event) => setCommand(event.target.value)} autoComplete="off" disabled={!sessionId || busy} />
        <button type="submit" aria-label="명령 실행" disabled={!sessionId || busy || !command.trim()}><CaretRight size={15} weight="bold" /></button>
      </form>
    </section>
  )
}
