import { create } from "zustand"
import type { DeckConfig, GridButton, OverlayPosition, AnimationDirection, AnimationStartCorner, PanelSizes, NotificationSettings, Scene } from "./types"

const DEFAULT_SCENE_ID = "default"

const defaultConfig: DeckConfig = {
  rows: 3,
  cols: 5,
  buttons: [],
  scenes: [{ id: DEFAULT_SCENE_ID, name: "Scene 1", rows: 3, cols: 5 }],
  activeSceneId: DEFAULT_SCENE_ID,
  gridSizePixels: 400,
  backgroundPadding: 8,
  backgroundColor: "#0a0a0a",
  backgroundOpacity: 100,
  buttonRadius: 16,
  overlayPosition: "bottom-right",
  overlayMargin: 20,
  overlayCustomX: 100,
  overlayCustomY: 100,
  // Animation defaults
  animationEnabled: true,
  animationDuration: 250,
  animationDirection: "clockwise",
  animationStartCorner: "bottom-right",
  // Shortcut defaults
  shortcutDebounceMs: 300,
  // Auto-dismiss defaults
  autoDismissEnabled: false,
  autoDismissDelaySeconds: 5,
  // Panel sizes defaults
  panelSizes: {
    leftPanel: 20,
    rightPanel: 22,
    bottomPanel: 35,
  },
  // Plugin language for i18n
  language: "en",
  // Notification settings
  notification: {
    enabled: true,
    dismissOnClick: false,
    autoDismissSeconds: 5,
    fanDirection: "vertical",
    alwaysFanOut: false,
    clickThrough: false,
    hoverOpacity: 100,
  },
}

// Flag to track whether the config has been loaded from main process
// This prevents race conditions where ResizablePanelGroup triggers onLayout
// before the actual config is fetched, which would overwrite saved buttons
let configLoadedFromMain = false

const pushUpdateToMain = (config: DeckConfig) => {
  // Don't push updates until we've loaded the config from main
  // This prevents overwriting saved config with default empty values
  if (!configLoadedFromMain) {
    return
  }
  if (typeof window !== "undefined" && typeof window.electron?.updateConfig === "function") {
    window.electron.updateConfig(config).catch(() => {
      /* Best-effort sync */
    })
  }
}

// Helper to get active scene
const getActiveScene = (config: DeckConfig): Scene => {
  const scenes = config.scenes || [{ id: DEFAULT_SCENE_ID, name: "Scene 1", rows: config.rows, cols: config.cols }]
  const activeId = config.activeSceneId || DEFAULT_SCENE_ID
  return scenes.find((s) => s.id === activeId) || scenes[0]
}

// Helper to get buttons for active scene
const getSceneButtons = (config: DeckConfig): GridButton[] => {
  const activeId = config.activeSceneId || DEFAULT_SCENE_ID
  return config.buttons.filter((btn) => (btn.sceneId || DEFAULT_SCENE_ID) === activeId)
}

interface DeckStore {
  config: DeckConfig
  selectedButton: GridButton | null
  // Computed getters for current scene
  activeScene: Scene
  sceneButtons: GridButton[]
  setConfigFromMain: (config: DeckConfig) => void
  setGridDimensions: (rows: number, cols: number) => void
  // Scene management
  addScene: (name?: string) => string
  removeScene: (sceneId: string) => void
  renameScene: (sceneId: string, name: string) => void
  reorderScenes: (sceneIds: string[]) => void
  setActiveScene: (sceneId: string) => void
  setGridSizePixels: (size: number) => void
  setBackgroundPadding: (padding: number) => void
  setBackgroundColor: (color: string) => void
  setBackgroundOpacity: (opacity: number) => void
  setButtonRadius: (radius: number) => void
  setOverlayPosition: (position: OverlayPosition) => void
  setOverlayMargin: (margin: number) => void
  setOverlayCustomPosition: (x: number, y: number) => void
  // Animation settings
  setAnimationEnabled: (enabled: boolean) => void
  setAnimationDuration: (duration: number) => void
  setAnimationDirection: (direction: AnimationDirection) => void
  setAnimationStartCorner: (corner: AnimationStartCorner) => void
  // Shortcut settings
  setShortcutDebounceMs: (ms: number) => void
  // Auto-dismiss settings
  setAutoDismissEnabled: (enabled: boolean) => void
  setAutoDismissDelaySeconds: (seconds: number) => void
  // Notification settings
  setNotificationSettings: (settings: NotificationSettings) => void
  // Panel sizes
  setPanelSizes: (sizes: PanelSizes) => void
  resetPanelSizes: () => void
  // Button operations
  addButton: (button: GridButton) => void
  updateButton: (id: string, updates: Partial<GridButton>) => void
  removeButton: (id: string) => void
  moveButton: (id: string, newRow: number, newCol: number) => void
  copyButton: (id: string) => GridButton | null
  pasteButton: (button: GridButton, row: number, col: number) => void
  setSelectedButton: (button: GridButton | null) => void
  executeAction: (actionId: string) => void
  exportConfig: () => string
  importConfig: (json: string) => boolean
  updateButtonByContext: (context: string, updater: (button: GridButton) => GridButton | null) => void
  setButtonStatusByContext: (context: string, status?: "alert" | "ok") => void
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  config: defaultConfig,
  selectedButton: null,
  
  // Computed: active scene metadata
  get activeScene() {
    return getActiveScene(get().config)
  },
  
  // Computed: buttons for active scene only
  get sceneButtons() {
    return getSceneButtons(get().config)
  },

  setConfigFromMain: (newConfig) => {
    // Mark that we've received config from main, so future updates can be pushed
    configLoadedFromMain = true
    // Ensure scenes exist with migration
    const migrated = { ...defaultConfig, ...newConfig }
    if (!migrated.scenes || migrated.scenes.length === 0) {
      migrated.scenes = [{ id: DEFAULT_SCENE_ID, name: "Scene 1", rows: migrated.rows, cols: migrated.cols }]
      migrated.activeSceneId = DEFAULT_SCENE_ID
    }
    set({ config: migrated })
  },

  setGridDimensions: (rows, cols) => {
    set((state) => {
      const activeSceneId = state.config.activeSceneId || DEFAULT_SCENE_ID
      // Update scene dimensions
      const scenes = (state.config.scenes || []).map((scene) =>
        scene.id === activeSceneId ? { ...scene, rows, cols } : scene
      )
      // Filter buttons for current scene that are out of bounds
      const buttons = state.config.buttons.filter((btn) => {
        if ((btn.sceneId || DEFAULT_SCENE_ID) !== activeSceneId) return true
        return btn.position.row < rows && btn.position.col < cols
      })
      const updatedConfig = { ...state.config, rows, cols, scenes, buttons }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  addScene: (name) => {
    const newId = `scene-${Date.now()}`
    set((state) => {
      const sceneCount = (state.config.scenes?.length || 0) + 1
      const newScene: Scene = {
        id: newId,
        name: name || `Scene ${sceneCount}`,
        rows: 3,
        cols: 5,
      }
      const scenes = [...(state.config.scenes || []), newScene]
      const updatedConfig = { ...state.config, scenes }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
    return newId
  },

  removeScene: (sceneId) => {
    set((state) => {
      const scenes = state.config.scenes || []
      if (scenes.length <= 1) return { config: state.config } // Can't remove last scene
      
      // Remove scene and its buttons
      const newScenes = scenes.filter((s) => s.id !== sceneId)
      const buttons = state.config.buttons.filter((btn) => (btn.sceneId || DEFAULT_SCENE_ID) !== sceneId)
      
      // If removing active scene, switch to first available
      let activeSceneId = state.config.activeSceneId
      if (activeSceneId === sceneId) {
        activeSceneId = newScenes[0]?.id || DEFAULT_SCENE_ID
      }
      
      const updatedConfig = { ...state.config, scenes: newScenes, buttons, activeSceneId }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  renameScene: (sceneId, name) => {
    set((state) => {
      const scenes = (state.config.scenes || []).map((scene) =>
        scene.id === sceneId ? { ...scene, name } : scene
      )
      const updatedConfig = { ...state.config, scenes }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  reorderScenes: (sceneIds) => {
    set((state) => {
      const sceneMap = new Map((state.config.scenes || []).map((s) => [s.id, s]))
      const scenes = sceneIds.map((id) => sceneMap.get(id)).filter(Boolean) as Scene[]
      const updatedConfig = { ...state.config, scenes }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setActiveScene: (sceneId) => {
    set((state) => {
      const scene = state.config.scenes?.find((s) => s.id === sceneId)
      if (!scene) return { config: state.config }
      
      const updatedConfig = {
        ...state.config,
        activeSceneId: sceneId,
        // Update global rows/cols to match scene
        rows: scene.rows,
        cols: scene.cols,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig, selectedButton: null }
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

  setBackgroundOpacity: (opacity) => {
    set((state) => {
      const updatedConfig = { ...state.config, backgroundOpacity: opacity }
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

  setAnimationEnabled: (enabled) => {
    set((state) => {
      const updatedConfig = { ...state.config, animationEnabled: enabled }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setAnimationDuration: (duration) => {
    set((state) => {
      const updatedConfig = { ...state.config, animationDuration: duration }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setAnimationDirection: (direction) => {
    set((state) => {
      const updatedConfig = { ...state.config, animationDirection: direction }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setAnimationStartCorner: (corner) => {
    set((state) => {
      const updatedConfig = { ...state.config, animationStartCorner: corner }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setShortcutDebounceMs: (ms) => {
    set((state) => {
      const updatedConfig = { ...state.config, shortcutDebounceMs: ms }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setAutoDismissEnabled: (enabled) => {
    set((state) => {
      const updatedConfig = { ...state.config, autoDismissEnabled: enabled }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setAutoDismissDelaySeconds: (seconds) => {
    set((state) => {
      const updatedConfig = { ...state.config, autoDismissDelaySeconds: seconds }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setNotificationSettings: (settings) => {
    set((state) => {
      const updatedConfig = { ...state.config, notification: settings }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setPanelSizes: (sizes) => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        panelSizes: { ...state.config.panelSizes, ...sizes },
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  resetPanelSizes: () => {
    set((state) => {
      const updatedConfig = {
        ...state.config,
        panelSizes: defaultConfig.panelSizes,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  addButton: (button) => {
    set((state) => {
      // Add button with current scene ID
      const buttonWithScene = {
        ...button,
        sceneId: state.config.activeSceneId || DEFAULT_SCENE_ID,
      }
      const updatedConfig = {
        ...state.config,
        buttons: [...state.config.buttons, buttonWithScene],
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
      const removedButton = state.config.buttons.find((btn) => btn.id === id)
      if (removedButton?.action?.context) {
        window.electron?.sendHostEvent({ context: removedButton.action.context, eventName: "willDisappear" })
      }

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

  moveButton: (id, newRow, newCol) => {
    set((state) => {
      // Check if target position is occupied
      const existingButton = state.config.buttons.find(
        (btn) => btn.position.row === newRow && btn.position.col === newCol
      )
      
      const buttons = state.config.buttons.map((btn) => {
        if (btn.id === id) {
          return { ...btn, position: { row: newRow, col: newCol } }
        }
        // If there's a button at the target, swap positions
        if (existingButton && btn.id === existingButton.id) {
          const sourceButton = state.config.buttons.find((b) => b.id === id)
          if (sourceButton) {
            return { ...btn, position: { row: sourceButton.position.row, col: sourceButton.position.col } }
          }
        }
        return btn
      })

      const updatedConfig = { ...state.config, buttons }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  copyButton: (id) => {
    const state = get()
    const button = state.config.buttons.find((btn) => btn.id === id)
    if (!button) return null
    // Return a deep copy of the button
    return JSON.parse(JSON.stringify(button))
  },

  pasteButton: (button, row, col) => {
    set((state) => {
      // Remove any existing button at the target position
      const buttons = state.config.buttons.filter(
        (btn) => !(btn.position.row === row && btn.position.col === col)
      )
      
      // Create new button with new ID and position
      const newButton: GridButton = {
        ...button,
        id: `${Date.now()}-${Math.random()}`,
        position: { row, col },
        action: button.action ? { ...button.action, context: undefined } : undefined,
      }
      
      buttons.push(newButton)
      
      const updatedConfig = { ...state.config, buttons }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
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
      case "plugin":
        if (button.action?.context) {
          const ctx = button.action.context
          window.electron?.sendHostEvent({ context: ctx, eventName: "keyDown" })
          setTimeout(() => {
            window.electron?.sendHostEvent({ context: ctx, eventName: "keyUp" })
          }, 120)
        }
        break
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

  updateButtonByContext: (context, updater) => {
    set((state) => {
      let updated = false
      const buttons = state.config.buttons.map((button) => {
        if (button.action?.context === context) {
          const updatedButton = updater({ ...button })
          updated = updated || updatedButton !== button
          return updatedButton || button
        }
        return button
      })
      if (!updated) {
        return { config: state.config }
      }
      const updatedConfig = { ...state.config, buttons }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setButtonStatusByContext: (context, status) => {
    set((state) => {
      let updated = false
      const buttons = state.config.buttons.map((button) => {
        if (button.action?.context === context) {
          if (button.status === status) return button
          updated = true
          return { ...button, status }
        }
        return button
      })
      if (!updated) {
        return { config: state.config }
      }
      const updatedConfig = { ...state.config, buttons }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
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
