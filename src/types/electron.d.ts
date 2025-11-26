import type { DeckConfig } from "@/lib/types"

export interface ElectronAPI {
  getConfig: () => Promise<DeckConfig>
  updateConfig: (_config: DeckConfig) => Promise<DeckConfig>
  onConfigUpdated: (_callback: (config: DeckConfig) => void) => () => void
  showSetup: () => void
  closeOverlay: () => void
  toggleSetup: () => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

export {}

