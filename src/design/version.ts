import { ver2Contract } from "./variants/ver2"
import { ver3Contract } from "./variants/ver3"
import { ver4Contract } from "./variants/ver4"

export type DesignVersion = "ver1" | "ver2" | "ver3" | "ver4"

const requestedVersion =
  import.meta.env.VITE_DESIGN_VERSION || import.meta.env.MODE

export const designVersion: DesignVersion =
  requestedVersion === "ver2" ||
  requestedVersion === "ver3" ||
  requestedVersion === "ver4"
    ? requestedVersion
    : "ver1"

// VER4 is currently a preview build. Keep every course and lab directly
// accessible until the production launch introduces real progression rules.
export const previewAccessOpen = designVersion === "ver4"

export const designMeta: Record<DesignVersion, {
  name: string
  shortName: string
  description: string
}> = {
  ver1: {
    name: "Original",
    shortName: "CANLite",
    description: "기존 인터페이스",
  },
  ver2: {
    name: ver2Contract.name,
    shortName: "CANLite",
    description: ver2Contract.description,
  },
  ver3: {
    name: ver3Contract.name,
    shortName: "CANLite",
    description: ver3Contract.description,
  },
  ver4: {
    name: ver4Contract.name,
    shortName: "CANLite",
    description: ver4Contract.description,
  },
}

if (typeof document !== "undefined") {
  document.documentElement.dataset.designVersion = designVersion
}
