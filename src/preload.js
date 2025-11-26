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
})

