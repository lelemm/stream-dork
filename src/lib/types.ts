export type ActionType = "hotkey" | "open-url" | "run-command" | "multi-action" | "folder" | "plugin"

export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "custom"

// Animation start corner options
export type AnimationStartCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center"

// Animation direction
export type AnimationDirection = "clockwise" | "counter-clockwise"

export interface ButtonAction {
  id: string
  type: ActionType
  name: string
  icon?: string
  config?: Record<string, any>
  pluginUuid?: string
  actionUuid?: string
  context?: string
  propertyInspectorPath?: string
}

export interface GridButton {
  id: string
  position: { row: number; col: number }
  action?: ButtonAction
  label?: string
  icon?: string
  backgroundColor?: string
  textColor?: string
  status?: "alert" | "ok"
  // Per-button animation duration override (in ms)
  animationDuration?: number
}

export interface PanelSizes {
  leftPanel?: number // percentage width
  rightPanel?: number // percentage width
  bottomPanel?: number // percentage height
}

export interface DeckConfig {
  rows: number
  cols: number
  buttons: GridButton[]
  gridSizePixels?: number
  backgroundPadding?: number
  backgroundColor?: string
  backgroundOpacity?: number
  buttonRadius?: number
  overlayPosition?: OverlayPosition
  overlayMargin?: number
  overlayCustomX?: number
  overlayCustomY?: number
  // Animation settings
  animationEnabled?: boolean
  animationDuration?: number // Default animation duration in ms
  animationDirection?: AnimationDirection
  animationStartCorner?: AnimationStartCorner
  // Shortcut settings
  shortcutDebounceMs?: number
  // Auto-dismiss settings
  autoDismissEnabled?: boolean
  autoDismissDelaySeconds?: number
  // Panel sizes
  panelSizes?: PanelSizes
}
