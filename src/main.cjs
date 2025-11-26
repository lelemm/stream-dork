const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
} = require("electron")
const path = require("path")
const fs = require("fs")

const APP_LOG_DIR = path.join(app.getAppPath(), "logs")
let currentLogDate = null
let currentLogPath = null

const rendererLogLevelMap = {
  0: "LOG",
  1: "WARN",
  2: "ERROR",
  3: "DEBUG",
}

const rawConsole = {}
const consoleMethods = ["log", "info", "warn", "error", "debug"]

function safeStringify(value) {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function ensureLogDirectory() {
  if (!fs.existsSync(APP_LOG_DIR)) {
    fs.mkdirSync(APP_LOG_DIR, { recursive: true })
  }
}

function getDailyLogPath() {
  const today = new Date().toISOString().split("T")[0]
  if (currentLogDate !== today || currentLogPath === null) {
    currentLogDate = today
    currentLogPath = path.join(APP_LOG_DIR, `${today}.txt`)
  }

  ensureLogDirectory()
  return currentLogPath
}

function appendLog(level, message) {
  const logLine = `${new Date().toISOString()} [${level}] ${message}\n`
  try {
    fs.appendFileSync(getDailyLogPath(), logLine, "utf-8")
  } catch (error) {
    rawConsole.error("Unable to write to log file:", error)
  }
}

function hookConsole() {
  consoleMethods.forEach((method) => {
    rawConsole[method] = console[method].bind(console)
    console[method] = (...args) => {
      rawConsole[method](...args)
      appendLog(method.toUpperCase(), args.map(safeStringify).join(" "))
    }
  })
}

hookConsole()

function logAppEvent(eventName, details = "") {
  appendLog("APP", `${eventName}${details ? ` ${details}` : ""}`)
}

function attachWindowLogging(win, name) {
  win.webContents.on("console-message", (event, level, message, line, sourceId) => {
    const levelText = rendererLogLevelMap[level] ?? `LEVEL_${level}`
    appendLog(
      "RENDERER",
      `${name} console ${levelText}: ${message} (${sourceId}:${line})`
    )
  })

  win.on("show", () => appendLog("WINDOW", `${name} shown`))
  win.on("hide", () => appendLog("WINDOW", `${name} hidden`))
  win.on("focus", () => appendLog("WINDOW", `${name} focused`))
  win.on("blur", () => appendLog("WINDOW", `${name} blurred`))
  win.on("closed", () => appendLog("WINDOW", `${name} closed`))
}

process.on("uncaughtException", (error) => {
  appendLog("ERROR", `Uncaught exception: ${error.stack || error}`)
})

process.on("unhandledRejection", (reason) => {
  const detail =
    reason instanceof Error ? reason.stack : safeStringify(reason)
  appendLog("ERROR", `Unhandled rejection: ${detail}`)
})

app.on("browser-window-created", (event, window) => {
  appendLog("WINDOW", `Browser window created (id=${window.id})`)
})

const CONFIG_FILE = path.join(app.getPath("userData"), "config.json")

const defaultConfig = {
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

let config = { ...defaultConfig }

let setupWindow
let overlayWindow
let tray

const isDev = process.env.NODE_ENV !== "production"
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"

function loadRenderer(window, page) {
  try {
    if (isDev && devServerUrl) {
      window.loadURL(`${devServerUrl}/${page}.html`)
    } else {
      window.loadFile(path.join(__dirname, "..", "dist", `${page}.html`))
    }
  } catch (error) {
    appendLog("ERROR", `loadRenderer(${page}) failed: ${error.stack || error}`)
    throw error
  }
}

function ensureConfigDirectory() {
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function loadConfigFromDisk() {
  appendLog("CONFIG", "Loading configuration from disk")
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8")
      const parsed = JSON.parse(raw)
      config = { ...defaultConfig, ...parsed }
    }
  } catch (error) {
    appendLog("ERROR", `loadConfigFromDisk failed: ${error.stack || error}`)
  }
}

function saveConfigToDisk() {
  appendLog("CONFIG", "Saving configuration to disk")
  try {
    ensureConfigDirectory()
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
  } catch (error) {
    appendLog("ERROR", `saveConfigToDisk failed: ${error.stack || error}`)
  }
}

function updateConfig(partial) {
  config = { ...config, ...partial }
  saveConfigToDisk()
  broadcastConfig()
  return config
}

function broadcastConfig() {
  const windows = [setupWindow, overlayWindow]
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("config-updated", config)
    }
  })
}

function createSetupWindow() {
  appendLog("WINDOW", "Creating setup window")
  try {
    setupWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: true,
      frame: true,
      transparent: false,
      icon: null,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    loadRenderer(setupWindow, "setup")
    attachWindowLogging(setupWindow, "SetupWindow")
  } catch (error) {
    appendLog("ERROR", `createSetupWindow failed: ${error.stack || error}`)
    throw error
  }

  setupWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      setupWindow.hide()
    }
  })

  setupWindow.on("ready-to-show", () => {
    if (setupWindow?.isMinimized()) {
      setupWindow.restore()
    }
    setupWindow?.show()
  })
}

function createOverlayWindow() {
  appendLog("WINDOW", "Creating overlay window")
  try {
    overlayWindow = new BrowserWindow({
      width: 600,
      height: 400,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    loadRenderer(overlayWindow, "overlay")
    attachWindowLogging(overlayWindow, "OverlayWindow")
  } catch (error) {
    appendLog("ERROR", `createOverlayWindow failed: ${error.stack || error}`)
    throw error
  }

  overlayWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      overlayWindow.hide()
    }
  })
}

function showSetupWindow() {
  if (!setupWindow || setupWindow.isDestroyed()) {
    createSetupWindow()
    return
  }

  if (setupWindow.isMinimized()) {
    setupWindow.restore()
  }

  setupWindow.show()
  setupWindow.focus()
}

function showOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }

  overlayWindow.setAlwaysOnTop(true, "screen-saver")
  overlayWindow.show()
  overlayWindow.focus()
}

function hideOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

function toggleOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    hideOverlayWindow()
  } else {
    showOverlayWindow()
  }
}

function createTray() {
  appendLog("APP", "Creating tray icon")
  try {
    const trayIcon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAF0lEQVR42mO8du3fPwMDAwMDAyMjIwGABnBAJ7zE18AAAAASUVORK5CYII="
  )

    tray = new Tray(trayIcon)

    const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Setup",
      click: () => {
        showSetupWindow()
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true
        app.quit()
      },
    },
  ])

    tray.setContextMenu(contextMenu)
    tray.setToolTip("Fake Stream Deck")
    tray.on("double-click", () => {
      toggleOverlayWindow()
    })
  } catch (error) {
    appendLog("ERROR", `createTray failed: ${error.stack || error}`)
    throw error
  }
}

app
  .whenReady()
  .then(() => {
    logAppEvent("app.whenReady")
    loadConfigFromDisk()
    showSetupWindow()
    createOverlayWindow()
    broadcastConfig()
    createTray()

    globalShortcut.register("Control+Alt+Space", () => {
      appendLog("INPUT", "Control+Alt+Space shortcut triggered")
      toggleOverlayWindow()
    })
  })
  .catch((error) => {
    appendLog("ERROR", `app.whenReady failed: ${error.stack || error}`)
  })

app.on("window-all-closed", (event) => {
  logAppEvent("window-all-closed")
  event.preventDefault()
})

app.on("before-quit", () => {
  logAppEvent("before-quit")
  app.isQuiting = true
  globalShortcut.unregisterAll()
})

app.on("activate", () => {
  logAppEvent("activate")
  if (BrowserWindow.getAllWindows().length === 0) {
    createSetupWindow()
    createOverlayWindow()
  }
})

ipcMain.handle("get-config", () => {
  appendLog("IPC", "get-config requested")
  return config
})

ipcMain.handle("update-config", (event, updates) => {
  appendLog("IPC", `update-config with ${safeStringify(updates)}`)
  return updateConfig(updates)
})

ipcMain.on("show-setup", () => {
  appendLog("IPC", "show-setup requested")
  showSetupWindow()
})

ipcMain.on("close-overlay", () => {
  appendLog("IPC", "close-overlay requested")
  hideOverlayWindow()
})

ipcMain.on("toggle-setup", () => {
  appendLog("IPC", "toggle-setup requested")
  if (setupWindow?.isVisible()) {
    setupWindow.hide()
  } else {
    showSetupWindow()
  }
})

