export function realTerminalEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true"
}

export const REAL_TERMINAL_ENABLED = realTerminalEnabled(
  import.meta.env.VITE_ENABLE_REAL_TERMINAL,
)
