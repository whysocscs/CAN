export interface CompletionResult {
  /** Tab 이후 입력창에 들어갈 값. 후보가 없으면 입력 그대로다. */
  value: string
  /** 현재 입력으로 시작하는 후보. 2개 이상이면 터미널이 목록을 보여준다. */
  matches: string[]
}

function commonPrefix(values: string[]): string {
  if (values.length === 0) return ""
  let prefix = values[0]
  for (const value of values.slice(1)) {
    let index = 0
    while (index < prefix.length && index < value.length && prefix[index] === value[index]) {
      index += 1
    }
    prefix = prefix.slice(0, index)
  }
  return prefix
}

/**
 * bash처럼 Tab 한 번에 공통 접두어까지 채운다.
 *
 * 후보는 실습에서 허용된 완성형 명령이다. 공백으로 끝나는 후보(예: "cansend vcan0 ")는
 * 뒤에 값을 직접 입력해야 하는 명령 틀이다. 대소문자는 구분하지 않지만 결과는 후보 표기를 따른다.
 */
export function completeCommand(input: string, candidates: readonly string[]): CompletionResult {
  const lowered = input.toLowerCase()
  const matches = [...new Set(candidates)].filter(
    (candidate) => candidate.toLowerCase().startsWith(lowered) && candidate.length > input.length,
  )

  if (matches.length === 0) return { value: input, matches: [] }
  if (matches.length === 1) return { value: matches[0], matches }

  const prefix = commonPrefix(matches.map((match) => match.toLowerCase()))
  const value = prefix.length > input.length ? matches[0].slice(0, prefix.length) : input
  return { value, matches }
}

export const CAN_PRACTICE_COMPLETIONS = [
  "ip link show vcan0",
  "candump vcan0",
  "cansend vcan0 101#00",
  "cansend vcan0 200#00",
] as const

export const IDS_COMPLETIONS = {
  "rule-based": ["cat whitelist.yaml", "cansend vcan0 "],
  "period-based": ["cat whitelist.yaml", "cansend vcan0 "],
  "counter-status": [
    "candump -L vcan0 > capture.log",
    "canplayer -I capture.log -l 1",
    "cansend vcan0 ",
  ],
} as const

export const ATTACK_LAB_COMPLETIONS = {
  door: [
    "pwd",
    "whoami",
    "ls",
    "ip link show dev vcan0",
    "cat baseline.log",
    "cat door-open.log",
    "candump vcan0",
    "candump -L vcan0",
    "cansend vcan0 ",
  ],
  spoofing: [
    "pwd",
    "whoami",
    "ls",
    "candump -L vcan0",
    "cat message-map.txt",
    "cansend vcan0 ",
  ],
  replay: [
    "pwd",
    "whoami",
    "ls",
    "candump -L vcan0",
    "candump -L vcan0 > capture.log",
    "cat capture.log",
    "canplayer -I capture.log -l 1",
  ],
} as const
