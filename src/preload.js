const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electron", {
  getConfig: async () => ipcRenderer.invoke("get-config"),
  updateConfig: async (updates) => ipcRenderer.invoke("update-config", updates),
  onConfigUpdated: (callback) => {
    const listener = (event, config) => callback(config)
    ipcRenderer.on("config-updated", listener)
    return () => ipcRenderer.off("config-updated", listener)
  },
  showSetup: () => ipcRenderer.send("show-setup"),
  closeOverlay: () => ipcRenderer.send("close-overlay"),
  toggleSetup: () => ipcRenderer.send("toggle-setup"),
  getHostState: async () => ipcRenderer.invoke("host:get-state"),
  createHostContext: async (payload) => ipcRenderer.invoke("host:create-context", payload),
  sendHostEvent: async (payload) => ipcRenderer.invoke("host:send-event", payload),
  onHostEvent: (callback) => {
    const listener = (event, payload) => callback(payload)
    ipcRenderer.on("host-event", listener)
    return () => ipcRenderer.off("host-event", listener)
  },
  notifyInspectorVisibility: ({ context, visible }) =>
    ipcRenderer.send("host:inspector-visibility", { context, visible }),
})

