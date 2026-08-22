import type { DoorLabCapturedFrame } from "./doorLabTypes"

const CANDUMP_LINE = /^\((\d+(?:\.\d+)?)\)\s+(\S+)\s+([0-9a-fA-F]+)#([0-9a-fA-F]*)$/

function formatByte(value: string): string {
  return value.replace(/^0x/i, "").toUpperCase().padStart(2, "0")
}

/** Parse only complete candump -L lines; terminal text and malformed records are ignored. */
export function parseTerminalFrames(output: string): DoorLabCapturedFrame[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = CANDUMP_LINE.exec(line.trim())
    if (!match) return []

    const [, rawTimestamp, channel, rawCanId, rawPayload] = match
    if (rawPayload.length % 2 !== 0) return []
    const data = rawPayload.match(/.{2}/g)?.map(formatByte) ?? []
    return [{
      timestamp: Number.parseFloat(rawTimestamp),
      channel,
      frame: {
        canId: `0x${rawCanId.toLowerCase()}`,
        dlc: data.length,
        data,
      },
    }]
  })
}

export function formatFrameData(data: readonly string[]): string {
  return data.map(formatByte).join(" ")
}

export function frameBits(data: readonly string[]): string {
  return data
    .map((byte) => Number.parseInt(formatByte(byte), 16).toString(2).padStart(8, "0"))
    .join(" ")
}

/** Append monitor records while retaining only the 300 most recent entries. */
export function appendBoundedEvents<T>(existing: readonly T[], incoming: readonly T[]): T[] {
  return [...existing, ...incoming].slice(-300)
}
