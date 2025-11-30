import type { DeckConfig, NotificationSettings } from "@/lib/types"

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

export interface IconLibraryIcon {
  id: string
  path: string
  name: string
  tags: string[]
  dataUrl: string
}

export interface IconLibrary {
  id: string
  folder: string
  name: string
  version: string
  description: string
  author: string
  url: string
  icon: string | null
  license: string
  icons: IconLibraryIcon[]
}

export interface HostState {
  port: number
  plugins: HostPluginDescriptor[]
  contexts: HostContextDescriptor[]
  logs: string[]
  iconLibraries: IconLibrary[]
  language: string // Configured language for plugin i18n
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

export interface NotificationData {
  context: string
  event: "setTitle" | "setImage" | "showOk" | "showAlert"
  icon?: string
  title?: string
  backgroundColor?: string
  textColor?: string
  status?: "ok" | "alert"
}

export interface ContextVisualState {
  image?: string
  title?: string
  state?: number
}

export type HostVisualState = Record<string, ContextVisualState>

export interface AppFlags {
  showControlPanel: boolean
  fileLogging: boolean
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
  getHostVisualState: () => Promise<HostVisualState>
  createHostContext: (options: HostContextOptions) => Promise<string>
  sendHostEvent: (options: HostEventOptions) => Promise<void>
  onHostEvent: (callback: (message: HostVisualEvent) => void) => () => void
  onOverlayVisibility: (callback: (payload: OverlayVisibilityPayload) => void) => () => void
  notifyInspectorVisibility: (payload: { context: string; visible: boolean }) => void
  selectIconFile: () => Promise<string | null>
  // Notification window methods
  onNotification?: (callback: (data: NotificationData) => void) => () => void
  onNotificationConfig?: (callback: (config: NotificationSettings) => void) => () => void
  onDismissNotification?: (callback: (data: { id: string }) => void) => () => void
  getNotificationConfig?: () => Promise<NotificationSettings>
  hideNotification?: () => void
  dismissNotification?: (id: string) => void
}

declare global {
  interface Window {
    electron?: ElectronAPI
  }
}

export {}

