import type { DeckConfig } from "@/lib/types"

export interface HostContextOptions {
  pluginUuid: string
  actionUuid: string
  coordinates?: { column: number; row: number }
}

export interface HostEventOptions {
  context: string
  eventName: string
  payload?: Record<string, unknown>
}

export interface HostContextDescriptor {
  context: string
  pluginUuid: string
  action: string
  device: string
  coordinates: { column: number; row: number }
  controller: string
  state: number
  settings: Record<string, unknown>
}

export interface HostActionDescriptor {
  uuid: string
  name: string
  tooltip?: string
  propertyInspectorPath?: string
  icon?: string
}

export interface HostPluginDescriptor {
  uuid: string
  name: string
  version?: string
  icon?: string
  connected: boolean
  propertyInspectorPath?: string
  actions: HostActionDescriptor[]
}

export interface HostState {
  port: number
  plugins: HostPluginDescriptor[]
  contexts: HostContextDescriptor[]
  logs: string[]
}

export interface HostVisualEvent {
  event: string
  action: string
  context: string
  device: string
  payload?: Record<string, unknown>
}

export interface OverlayVisibilityPayload {
  visible: boolean
}

export interface AppFlags {
  showControlPanel: boolean
}

export interface ElectronAPI {
  getConfig: () => Promise<DeckConfig>
  getAppFlags: () => Promise<AppFlags>
  updateConfig: (_config: DeckConfig) => Promise<DeckConfig>
  onConfigUpdated: (_callback: (config: DeckConfig) => void) => () => void
  showSetup: () => void
  closeOverlay: () => void
  forceHideOverlay: () => void
  toggleSetup: () => void
  getHostState: () => Promise<HostState>
  createHostContext: (options: HostContextOptions) => Promise<string>
  sendHostEvent: (options: HostEventOptions) => Promise<void>
  onHostEvent: (callback: (message: HostVisualEvent) => void) => () => void
  onOverlayVisibility: (callback: (payload: OverlayVisibilityPayload) => void) => () => void
  notifyInspectorVisibility: (payload: { context: string; visible: boolean }) => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

export {}

