export type ActionType = "hotkey" | "open-url" | "run-command" | "multi-action" | "folder"

export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "custom"

export interface ButtonAction {
  id: string
  type: ActionType
  name: string
  icon?: string
  config?: Record<string, any>
}

export interface GridButton {
  id: string
  position: { row: number; col: number }
  action?: ButtonAction
  label?: string
  icon?: string
  backgroundColor?: string
  textColor?: string
}

export interface DeckConfig {
  rows: number
  cols: number
  buttons: GridButton[]
  gridSizePixels?: number
  backgroundPadding?: number
  backgroundColor?: string
  buttonRadius?: number
  overlayPosition?: OverlayPosition
  overlayMargin?: number
  overlayCustomX?: number
  overlayCustomY?: number
}
