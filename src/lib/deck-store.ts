"use client"

import { create } from "zustand"
import type { DeckConfig, GridButton, OverlayPosition } from "./types"

const defaultConfig: DeckConfig = {
  rows: 3,
  cols: 5,
  buttons: [],
  gridSizePixels: 400,
  backgroundPadding: 8,
  backgroundColor: "#0a0a0a",
  buttonRadius: 16,
  overlayPosition: "bottom-right",
  overlayMargin: 20,
  overlayCustomX: 100,
  overlayCustomY: 100,
}

const pushUpdateToMain = (config: DeckConfig) => {
  if (typeof window !== "undefined" && typeof window.electron?.updateConfig === "function") {
    window.electron.updateConfig(config).catch(() => {
      /* Best-effort sync */
    })
  }
}

interface DeckStore {
  config: DeckConfig
  selectedButton: GridButton | null
  setConfigFromMain: (config: DeckConfig) => void
  setGridDimensions: (rows: number, cols: number) => void
  setGridSizePixels: (size: number) => void
  setBackgroundPadding: (padding: number) => void
  setBackgroundColor: (color: string) => void
  setButtonRadius: (radius: number) => void
  setOverlayPosition: (position: OverlayPosition) => void
  setOverlayMargin: (margin: number) => void
  setOverlayCustomPosition: (x: number, y: number) => void
  addButton: (button: GridButton) => void
  updateButton: (id: string, updates: Partial<GridButton>) => void
  removeButton: (id: string) => void
  setSelectedButton: (button: GridButton | null) => void
  executeAction: (actionId: string) => void
  exportConfig: () => string
  importConfig: (json: string) => boolean
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  config: defaultConfig,
  selectedButton: null,

  setConfigFromMain: (newConfig) => {
    set({ config: { ...defaultConfig, ...newConfig } })
  },

  setGridDimensions: (rows, cols) => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        rows,
        cols,
        buttons: state.config.buttons.filter(
          (btn) => btn.position.row < rows && btn.position.col < cols,
        ),
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setGridSizePixels: (size) => {
    set((state) => {
      const updatedConfig = { ...state.config, gridSizePixels: size }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setBackgroundPadding: (padding) => {
    set((state) => {
      const updatedConfig = { ...state.config, backgroundPadding: padding }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setBackgroundColor: (color) => {
    set((state) => {
      const updatedConfig = { ...state.config, backgroundColor: color }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setButtonRadius: (radius) => {
    set((state) => {
      const updatedConfig = { ...state.config, buttonRadius: radius }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setOverlayPosition: (position) => {
    set((state) => {
      const updatedConfig = { ...state.config, overlayPosition: position }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setOverlayMargin: (margin) => {
    set((state) => {
      const updatedConfig = { ...state.config, overlayMargin: margin }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setOverlayCustomPosition: (x, y) => {
    set((state) => {
      const updatedConfig = { ...state.config, overlayCustomX: x, overlayCustomY: y }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  addButton: (button) => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        buttons: [...state.config.buttons, button],
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  updateButton: (id, updates) => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        buttons: state.config.buttons.map((btn) => (btn.id === id ? { ...btn, ...updates } : btn)),
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  removeButton: (id) => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        buttons: state.config.buttons.filter((btn) => btn.id !== id),
      }
      pushUpdateToMain(updatedConfig)
      return {
        config: updatedConfig,
        selectedButton: state.selectedButton?.id === id ? null : state.selectedButton,
      }
    })
  },

  setSelectedButton: (button) => {
    set({ selectedButton: button })
  },

  executeAction: (actionId) => {
    const button = get().config.buttons.find((btn) => btn.id === actionId)
    if (!button?.action) return

    console.log("[v0] Executing action:", button.action)

    switch (button.action.type) {
      case "hotkey":
        console.log("[v0] Hotkey pressed:", button.action.config?.keys)
        break
      case "open-url":
        console.log("[v0] Opening URL:", button.action.config?.url)
        break
      case "run-command":
        console.log("[v0] Running command:", button.action.config?.command)
        break
      case "multi-action":
        console.log("[v0] Multi-action triggered")
        break
      default:
        console.log("[v0] Unknown action type")
    }
  },

  exportConfig: () => {
    return JSON.stringify(get().config, null, 2)
  },

  importConfig: (json: string) => {
    try {
      const parsed = JSON.parse(json) as DeckConfig
      if (typeof parsed.rows !== "number" || typeof parsed.cols !== "number") {
        return false
      }
      const updatedConfig = { ...defaultConfig, ...parsed }
      pushUpdateToMain(updatedConfig)
      set({ config: updatedConfig })
      return true
    } catch {
      return false
    }
  },
}))

export { defaultConfig }
