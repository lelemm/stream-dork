const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electron", {
  getConfig: async () => ipcRenderer.invoke("get-config"),
  getAppFlags: async () => ipcRenderer.invoke("get-app-flags"),
  updateConfig: async (updates) => ipcRenderer.invoke("update-config", updates),
  onConfigUpdated: (callback) => {
    const listener = (event, config) => callback(config)
    ipcRenderer.on("config-updated", listener)
    return () => ipcRenderer.off("config-updated", listener)
  },
  showSetup: () => ipcRenderer.send("show-setup"),
  closeOverlay: () => ipcRenderer.send("close-overlay"),
  forceHideOverlay: () => ipcRenderer.send("force-hide-overlay"),
  setIgnoreMouseEvents: (ignore, forward = true) => ipcRenderer.send("set-ignore-mouse-events", { ignore, forward }),
  toggleSetup: () => ipcRenderer.send("toggle-setup"),
  getHostState: async () => ipcRenderer.invoke("host:get-state"),
  getHostVisualState: async () => ipcRenderer.invoke("host:get-visual-state"),
  createHostContext: async (payload) => ipcRenderer.invoke("host:create-context", payload),
  sendHostEvent: async (payload) => ipcRenderer.invoke("host:send-event", payload),
  onHostEvent: (callback) => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on("host-event", listener)
    return () => ipcRenderer.off("host-event", listener)
  },
  onOverlayVisibility: (callback) => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on("overlay-visibility", listener)
    return () => ipcRenderer.off("overlay-visibility", listener)
  },
  notifyInspectorVisibility: ({ context, visible }) =>
    ipcRenderer.send("host:inspector-visibility", { context, visible }),
  selectIconFile: async () => ipcRenderer.invoke("select-icon-file"),
  // Notification window methods
  onNotification: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on("show-notification", listener)
    return () => ipcRenderer.off("show-notification", listener)
  },
  onNotificationConfig: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on("notification-config", listener)
    return () => ipcRenderer.off("notification-config", listener)
  },
  onDismissNotification: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on("dismiss-notification", listener)
    return () => ipcRenderer.off("dismiss-notification", listener)
  },
  getNotificationConfig: async () => ipcRenderer.invoke("get-notification-config"),
  hideNotification: () => ipcRenderer.send("hide-notification"),
  setNotificationIgnoreMouseEvents: (ignore, forward = true) => ipcRenderer.send("set-notification-ignore-mouse-events", { ignore, forward }),
  dismissNotification: (context) => ipcRenderer.send("dismiss-notification", { context }),
  openPluginFolder: () => ipcRenderer.send("open-plugin-folder"),
  testShortcut: async (shortcut) => ipcRenderer.invoke("test-shortcut", shortcut),
  registerOverlayShortcut: async () => ipcRenderer.invoke("register-overlay-shortcut"),
  // Snooze notification methods
  snoozeNotification: async (context, minutes) => ipcRenderer.invoke("snooze-notification", { context, minutes }),
  wakeNotification: async (context) => ipcRenderer.invoke("wake-notification", { context }),
  getSnoozedContexts: async () => ipcRenderer.invoke("get-snoozed-contexts"),
})

