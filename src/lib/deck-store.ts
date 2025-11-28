import { create } from "zustand"
import type { DeckConfig, GridButton, OverlayPosition, AnimationDirection, AnimationStartCorner, PanelSizes, NotificationSettings, Scene } from "./types"

// Migration helper: convert old config to new scene-based structure
const migrateConfig = (config: DeckConfig): DeckConfig => {
  // If already has scenes, return as-is
  if (config.scenes && config.scenes.length > 0) {
    // Ensure activeSceneId is set
    if (!config.activeSceneId && config.scenes[0]) {
      return { ...config, activeSceneId: config.scenes[0].id }
    }
    return config
  }

  // Migrate from old structure
  const rows = config.rows ?? 3
  const cols = config.cols ?? 5
  const buttons = config.buttons ?? []
  
  const defaultScene: Scene = {
    id: `scene-${Date.now()}`,
    name: "Scene 1",
    rows,
    cols,
    buttons,
  }

  return {
    ...config,
    scenes: [defaultScene],
    activeSceneId: defaultScene.id,
    // Keep legacy fields for backward compatibility during transition
    rows,
    cols,
    buttons,
  }
}

const defaultConfig: DeckConfig = {
  scenes: [
    {
      id: "scene-default",
      name: "Scene 1",
      rows: 3,
      cols: 5,
      buttons: [],
    },
  ],
  activeSceneId: "scene-default",
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
    allScenesAlwaysActive: true,
  },
  // Application settings
  startWithWindows: false,
  showSetupOnStart: true,
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
const getActiveScene = (config: DeckConfig): Scene | null => {
  if (!config.scenes || config.scenes.length === 0) return null
  const activeId = config.activeSceneId || config.scenes[0].id
  return config.scenes.find((s) => s.id === activeId) || config.scenes[0] || null
}

interface DeckStore {
  config: DeckConfig
  selectedButton: GridButton | null
  activeScene: Scene | null
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
  // Application settings
  setStartWithWindows: (enabled: boolean) => void
  setShowSetupOnStart: (enabled: boolean) => void
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

export const useDeckStore = create<DeckStore>((set, get) => {
  // Helper to get active scene from current state
  const getActiveSceneFromState = (state: { config: DeckConfig }): Scene | null => {
    return getActiveScene(state.config)
  }

  // Helper to update both config and activeScene
  const updateConfig = (updater: (state: { config: DeckConfig; activeScene: Scene | null }) => { config: DeckConfig; activeScene: Scene | null }) => {
    set((state) => {
      const result = updater({ config: state.config, activeScene: getActiveScene(state.config) })
      return result
    })
  }

  return {
    config: defaultConfig,
    selectedButton: null,
    activeScene: getActiveScene(defaultConfig),

    setConfigFromMain: (newConfig) => {
      // Mark that we've received config from main, so future updates can be pushed
      configLoadedFromMain = true
      const migrated = migrateConfig({ ...defaultConfig, ...newConfig })
      set({ config: migrated, activeScene: getActiveScene(migrated) })
    },

  setGridDimensions: (rows, cols) => {
    set((state) => {
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config, activeScene: getActiveScene(state.config) }

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id
          ? {
              ...scene,
              rows,
              cols,
              buttons: scene.buttons.filter(
                (btn) => btn.position.row < rows && btn.position.col < cols,
              ),
            }
          : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        rows,
        cols,
        buttons: activeScene.buttons.filter(
          (btn) => btn.position.row < rows && btn.position.col < cols,
        ),
      }
      pushUpdateToMain(updatedConfig)
      const newActiveScene = getActiveScene(updatedConfig)
      return { config: updatedConfig, activeScene: newActiveScene }
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

  setStartWithWindows: (enabled) => {
    set((state) => {
      const updatedConfig = { ...state.config, startWithWindows: enabled }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setShowSetupOnStart: (enabled) => {
    set((state) => {
      const updatedConfig = { ...state.config, showSetupOnStart: enabled }
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

  addScene: (name) => {
    let newSceneId = ""
    set((state) => {
      const sceneCount = (state.config.scenes?.length || 0) + 1
      const sceneName = name || `Scene ${sceneCount}`
      newSceneId = `scene-${Date.now()}-${Math.random()}`
      
      const newScene: Scene = {
        id: newSceneId,
        name: sceneName,
        rows: 3,
        cols: 5,
        buttons: [],
      }

      const updatedScenes = [...(state.config.scenes || []), newScene]
      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
    return newSceneId
  },

  removeScene: (sceneId) => {
    set((state) => {
      const scenes = state.config.scenes || []
      if (scenes.length <= 1) return { config: state.config } // Don't allow removing last scene

      const sceneToRemove = scenes.find((s) => s.id === sceneId)
      if (!sceneToRemove) return { config: state.config }

      // Send willDisappear for all buttons in the scene being removed
      sceneToRemove.buttons.forEach((btn) => {
        if (btn.action?.context) {
          window.electron?.sendHostEvent({ context: btn.action.context, eventName: "willDisappear" })
        }
      })

      const updatedScenes = scenes.filter((s) => s.id !== sceneId)
      const newActiveSceneId =
        state.config.activeSceneId === sceneId
          ? updatedScenes[0]?.id || ""
          : state.config.activeSceneId

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        activeSceneId: newActiveSceneId,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  renameScene: (sceneId, name) => {
    set((state) => {
      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === sceneId ? { ...scene, name } : scene,
      ) || []
      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  reorderScenes: (sceneIds) => {
    set((state) => {
      const scenes = state.config.scenes || []
      const sceneMap = new Map(scenes.map((s) => [s.id, s]))
      const reorderedScenes = sceneIds.map((id) => sceneMap.get(id)).filter(Boolean) as Scene[]
      
      // Add any scenes not in the reorder list (shouldn't happen, but safety check)
      const existingIds = new Set(sceneIds)
      scenes.forEach((scene) => {
        if (!existingIds.has(scene.id)) {
          reorderedScenes.push(scene)
        }
      })

      const updatedConfig = {
        ...state.config,
        scenes: reorderedScenes,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setActiveScene: (sceneId) => {
    set((state) => {
      const scenes = state.config.scenes || []
      const scene = scenes.find((s) => s.id === sceneId)
      if (!scene) return { config: state.config }

      const oldActiveScene = getActiveSceneFromState(state)
      const allScenesAlwaysActive = state.config.notification?.allScenesAlwaysActive ?? true

      // Send willDisappear for old scene buttons (unless all scenes always active)
      if (oldActiveScene && !allScenesAlwaysActive) {
        oldActiveScene.buttons.forEach((btn) => {
          if (btn.action?.context) {
            window.electron?.sendHostEvent({ context: btn.action.context, eventName: "willDisappear" })
          }
        })
      }

      // Send willAppear for new scene buttons (unless all scenes always active)
      if (!allScenesAlwaysActive) {
        scene.buttons.forEach((btn) => {
          if (btn.action?.context) {
            window.electron?.sendHostEvent({ context: btn.action.context, eventName: "willAppear" })
          }
        })
      }

      const updatedConfig = {
        ...state.config,
        activeSceneId: sceneId,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  addButton: (button) => {
    set((state) => {
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config }

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id
          ? { ...scene, buttons: [...scene.buttons, button] }
          : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons: [...activeScene.buttons, button],
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  updateButton: (id, updates) => {
    set((state) => {
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config }

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id
          ? {
              ...scene,
              buttons: scene.buttons.map((btn) => (btn.id === id ? { ...btn, ...updates } : btn)),
            }
          : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons: activeScene.buttons.map((btn) => (btn.id === id ? { ...btn, ...updates } : btn)),
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  removeButton: (id) => {
    set((state) => {
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config }

      const removedButton = activeScene.buttons.find((btn) => btn.id === id)
      if (removedButton?.action?.context) {
        window.electron?.sendHostEvent({ context: removedButton.action.context, eventName: "willDisappear" })
      }

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id
          ? { ...scene, buttons: scene.buttons.filter((btn) => btn.id !== id) }
          : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons: activeScene.buttons.filter((btn) => btn.id !== id),
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
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config }

      // Check if target position is occupied
      const existingButton = activeScene.buttons.find(
        (btn) => btn.position.row === newRow && btn.position.col === newCol
      )
      
      const buttons = activeScene.buttons.map((btn) => {
        if (btn.id === id) {
          return { ...btn, position: { row: newRow, col: newCol } }
        }
        // If there's a button at the target, swap positions
        if (existingButton && btn.id === existingButton.id) {
          const sourceButton = activeScene.buttons.find((b) => b.id === id)
          if (sourceButton) {
            return { ...btn, position: { row: sourceButton.position.row, col: sourceButton.position.col } }
          }
        }
        return btn
      })

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id ? { ...scene, buttons } : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  copyButton: (id) => {
    const state = get()
    const activeScene = getActiveScene(state)
    if (!activeScene) return null
    const button = activeScene.buttons.find((btn) => btn.id === id)
    if (!button) return null
    // Return a deep copy of the button
    return JSON.parse(JSON.stringify(button))
  },

  pasteButton: (button, row, col) => {
    set((state) => {
      const activeScene = getActiveSceneFromState(state)
      if (!activeScene) return { config: state.config }

      // Remove any existing button at the target position
      const buttons = activeScene.buttons.filter(
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

      const updatedScenes = state.config.scenes?.map((scene) =>
        scene.id === activeScene.id ? { ...scene, buttons } : scene,
      ) || []

      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons,
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setSelectedButton: (button) => {
    set({ selectedButton: button })
  },

  executeAction: (actionId) => {
    const state = get()
    const activeScene = getActiveScene(state.config)
    if (!activeScene) return
    const button = activeScene.buttons.find((btn) => btn.id === actionId)
    if (!button?.action) return

    console.log("[v0] Executing action:", button.action)

    switch (button.action.type) {
      case "plugin":
        if (button.action.context) {
          window.electron?.sendHostEvent({ context: button.action.context, eventName: "keyDown" })
          setTimeout(() => {
            window.electron?.sendHostEvent({ context: button.action.context, eventName: "keyUp" })
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
      const updatedScenes = state.config.scenes?.map((scene) => {
        const updatedButtons = scene.buttons.map((button) => {
          if (button.action?.context === context) {
            const updatedButton = updater({ ...button })
            updated = updated || updatedButton !== button
            return updatedButton || button
          }
          return button
        })
        return { ...scene, buttons: updatedButtons }
      }) || []

      if (!updated) {
        return { config: state.config }
      }

      // Also update legacy buttons array for compatibility
      const activeScene = getActiveSceneFromState({ config: { ...state.config, scenes: updatedScenes } })
      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons: activeScene?.buttons || [],
      }
      pushUpdateToMain(updatedConfig)
      return { config: updatedConfig }
    })
  },

  setButtonStatusByContext: (context, status) => {
    set((state) => {
      let updated = false
      const updatedScenes = state.config.scenes?.map((scene) => {
        const updatedButtons = scene.buttons.map((button) => {
          if (button.action?.context === context) {
            if (button.status === status) return button
            updated = true
            return { ...button, status }
          }
          return button
        })
        return { ...scene, buttons: updatedButtons }
      }) || []

      if (!updated) {
        return { config: state.config }
      }

      // Also update legacy buttons array for compatibility
      const activeScene = getActiveSceneFromState({ config: { ...state.config, scenes: updatedScenes } })
      const updatedConfig = {
        ...state.config,
        scenes: updatedScenes,
        // Legacy compatibility
        buttons: activeScene?.buttons || [],
      }
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
      // Migrate if needed
      const migrated = migrateConfig({ ...defaultConfig, ...parsed })
      pushUpdateToMain(migrated)
      set({ config: migrated })
      return true
    } catch {
      return false
    }
  },
  }})

export { defaultConfig }
