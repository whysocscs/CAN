/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DESIGN_VERSION?: "ver1" | "ver2" | "ver3" | "ver4"
  readonly VITE_CAN_STREAM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
