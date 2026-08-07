/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DESIGN_VERSION?: "ver1" | "ver2" | "ver3" | "ver4"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
