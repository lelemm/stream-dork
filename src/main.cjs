const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  dialog,
} = require("electron")
const path = require("path")
const fs = require("fs")
const { discoverPlugins } = require("./host/plugin-discovery.cjs")
const { discoverIconLibraries } = require("./host/icon-library-discovery.cjs")
const { StreamDeckHost } = require("./host/streamdeck-host.cjs")

// Parse command line arguments
// In packaged apps, process.argv[0] is the executable, process.argv[1] might be the app path
// User arguments start from process.argv[2], but we should check all args to be safe
const allArgs = process.argv
const args = process.argv.slice(2)

// Helper to check if an argument matches (case-insensitive, handles =1 and standalone)
function hasFlag(argList, flagName) {
  return argList.some(arg => {
    if (typeof arg !== 'string') return false
    const lowerArg = arg.toLowerCase()
    const lowerFlag = flagName.toLowerCase()
    return lowerArg === lowerFlag || 
           lowerArg === `${lowerFlag}=1` ||
           lowerArg.startsWith(`${lowerFlag}=`)
  })
}

const showControlPanel = hasFlag(allArgs, '--stream-dork-control-panel')
const enableFileLogging = hasFlag(allArgs, '--stream-dork-file-logging')

// Debug: Always log what we received (before app is ready, use console directly)
console.log('[DEBUG] All process.argv:', JSON.stringify(process.argv))
console.log('[DEBUG] Parsed args (slice 2):', JSON.stringify(args))
console.log('[DEBUG] File logging flag detected:', enableFileLogging)
console.log('[DEBUG] Control panel flag detected:', showControlPanel)

// Enable Chrome DevTools Protocol remote debugging on port 23519
// This allows debugging Property Inspectors at http://localhost:23519
// Similar to the real Stream Deck's CEF remote debugging
const REMOTE_DEBUGGING_PORT = 23519
app.commandLine.appendSwitch("remote-debugging-port", String(REMOTE_DEBUGGING_PORT))

// Chromium 94+ blocks DevTools WebSocket connections from arbitrary origins
// unless they are explicitly allowed. When you open http://localhost:23519
// in Chrome, the DevTools frontend runs with the origin http://localhost:23519
// and tries to connect back to the DevTools backend on the same port.
// Without this flag, you'll see "Rejected an incoming WebSocket connection
// from the http://localhost:23519 origin".
//
// In development it's fine to allow this specific origin. If you ever expose
// the DevTools port more broadly, consider tightening or removing this.
app.commandLine.appendSwitch(
  "remote-allow-origins",
  `http://localhost:${REMOTE_DEBUGGING_PORT}`,
)

// APP_LOG_DIR will be initialized after app is ready
let APP_LOG_DIR = null
let currentLogDate = null
let currentLogPath = null

function getAppLogDir() {
  if (!APP_LOG_DIR) {
    APP_LOG_DIR = path.join(app.getPath("userData"), "logs")
  }
  return APP_LOG_DIR
}

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
  const logDir = getAppLogDir()
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

function getDailyLogPath() {
  const today = new Date().toISOString().split("T")[0]
  if (currentLogDate !== today || currentLogPath === null) {
    currentLogDate = today
    const logDir = getAppLogDir()
    currentLogPath = path.join(logDir, `${today}.txt`)
  }

  ensureLogDirectory()
  return currentLogPath
}

function appendLog(level, message) {
  if (!enableFileLogging) {
    return
  }
  const logLine = `${new Date().toISOString()} [${level}] ${message}\n`
  try {
    fs.appendFileSync(getDailyLogPath(), logLine, "utf-8")
  } catch (error) {
    rawConsole.error("Unable to write to log file:", error)
  }
}

function hookConsole() {
  if (!enableFileLogging) {
    return
  }
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

const PLUGIN_ROOT = path.join(app.getPath("userData"), "plugins")
const ICON_LIBRARY_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "icons")
  : path.join(__dirname, "..", "icons")
const HOST_STATE_FILE = path.join(app.getPath("userData"), "host-state.json")
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json")

function broadcastHostEvent(message) {
  const windows = [setupWindow, overlayWindow]
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("host-event", message)
    }
  })
  
  // Forward relevant events to the notification window (if enabled)
  if (message?.event && config.notification?.enabled !== false) {
    const notificationEvents = ["setTitle", "setImage", "showOk", "showAlert"]
    if (notificationEvents.includes(message.event)) {
      showNotification(message)
    }
  }
}

// These will be initialized after config is loaded
let discoveredPlugins = []
let discoveredIconLibraries = []
let streamDeckHost = null

const defaultConfig = {
  rows: 3,
  cols: 5,
  buttons: [],
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

let config = { ...defaultConfig }

let setupWindow
let overlayWindow
let notificationWindow
let tray
let lastToggleTime = 0

// In packaged builds we should never try to talk to the Vite dev server.
// Use Electron's app.isPackaged flag instead of NODE_ENV, which may be unset.
const isDev = !app.isPackaged
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"

function loadRenderer(window, page) {
  try {
    if (isDev && devServerUrl) {
      window.loadURL(`${devServerUrl}/src/pages/${page}.html`)
    } else {
      // In production we load the pre-built HTML from Vite.
      // Vite outputs to dist/src/pages/*.html
      // app.getAppPath() returns the path to app.asar in packaged builds
      const appPath = app.getAppPath()
      const htmlPath = path.join(appPath, "dist", "src", "pages", `${page}.html`)
      
      // Verify the file exists (for debugging)
      if (!fs.existsSync(htmlPath)) {
        appendLog("ERROR", `HTML file not found: ${htmlPath}`)
        // Try alternative path in case of unpacked structure
        const altPath = path.join(__dirname, "..", "dist", "src", "pages", `${page}.html`)
        if (fs.existsSync(altPath)) {
          appendLog("RENDERER", `Using alternative path: ${altPath}`)
          window.loadFile(altPath)
          return
        }
        throw new Error(`HTML file not found at ${htmlPath} or ${altPath}`)
      }
      
      appendLog("RENDERER", `Loading ${page}.html from ${htmlPath}`)
      window.loadFile(htmlPath)
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

/**
 * Ensure the plugins directory exists in userData
 */
function ensurePluginsDirectory() {
  if (!fs.existsSync(PLUGIN_ROOT)) {
    fs.mkdirSync(PLUGIN_ROOT, { recursive: true })
    appendLog("CONFIG", `Created plugins directory: ${PLUGIN_ROOT}`)
  }
}

/**
 * Initialize plugins and host after config is loaded.
 * This allows us to use the configured language for plugin discovery i18n.
 */
function initializePluginsAndHost() {
  const language = config.language || "en"
  appendLog("CONFIG", `Initializing plugins with language: ${language}`)

  // Ensure plugins directory exists
  ensurePluginsDirectory()

  // Discover plugins with the configured language for i18n
  const { plugins, errors: pluginErrors } = discoverPlugins(PLUGIN_ROOT, appendLog, language)
  discoveredPlugins = plugins
  pluginErrors.forEach(({ folder, reason }) => appendLog("PLUGIN", `${folder}: ${reason}`))

  // Discover icon libraries
  const { iconLibraries, errors: iconLibraryErrors } = discoverIconLibraries(ICON_LIBRARY_ROOT, appendLog)
  discoveredIconLibraries = iconLibraries
  iconLibraryErrors.forEach(({ folder, reason }) => appendLog("ICON-LIBRARY", `${folder}: ${reason}`))

  // Create the StreamDeck host with the configured language
  streamDeckHost = new StreamDeckHost({
    plugins: discoveredPlugins,
    iconLibraries: discoveredIconLibraries,
    logger: appendLog,
    notifyRenderer: broadcastHostEvent,
    stateFile: HOST_STATE_FILE,
    language,
    enableFileLogging,
  })
}

function restorePluginContexts() {
  let changed = false
  config.buttons.forEach((button) => {
    const action = button.action
    if (action?.type === "plugin" && action.pluginUuid && action.actionUuid) {
      const context = streamDeckHost.createContext(
        action.pluginUuid,
        action.actionUuid,
        { column: button.position.col, row: button.position.row },
        action.context,
      )
      if (context && context !== action.context) {
        action.context = context
        changed = true
      }
    }
  })
  if (changed) {
    saveConfigToDisk()
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
  updateNotificationConfig()
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
        webviewTag: true,
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
    const { screen } = require("electron")
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    overlayWindow = new BrowserWindow({
      width: width,
      height: height,
      x: 0,
      y: 0,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
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
  // Notify the overlay to start the show animation
  overlayWindow.webContents.send("overlay-visibility", { visible: true })
}

function hideOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // Notify the overlay to start the hide animation, then hide the window after animation completes
    overlayWindow.webContents.send("overlay-visibility", { visible: false })
  }
}

function forceHideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

function createNotificationWindow() {
  appendLog("WINDOW", "Creating notification window")
  try {
    const { screen } = require("electron")
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize
    
    // Window needs to be large enough for expanded card stack (up to 5 cards)
    // Each card is 72px + 8px gap, plus margin
    const notificationWidth = 200
    const notificationHeight = 500
    const margin = 16

    notificationWindow = new BrowserWindow({
      width: notificationWidth,
      height: notificationHeight,
      x: width - notificationWidth - margin,
      y: height - notificationHeight - margin,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Initially click-through, but we'll toggle this when notifications are shown
    notificationWindow.setIgnoreMouseEvents(true, { forward: true })

    loadRenderer(notificationWindow, "notification")
    attachWindowLogging(notificationWindow, "NotificationWindow")
  } catch (error) {
    appendLog("ERROR", `createNotificationWindow failed: ${error.stack || error}`)
    throw error
  }

  notificationWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault()
      notificationWindow.hide()
    }
  })
}

function showNotification(message) {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    createNotificationWindow()
  }

  // Build notification data from the host event
  const { event, context, payload } = message
  
  // Get button info from config to include icon/title context
  const button = config.buttons.find(
    (btn) => btn.action?.context === context
  )
  
  const notificationData = {
    context,
    event,
    icon: payload?.image || button?.icon,
    title: payload?.title || button?.label,
    backgroundColor: button?.backgroundColor,
    textColor: button?.textColor,
    status: event === "showOk" ? "ok" : event === "showAlert" ? "alert" : undefined,
  }

  // Show the window and send the notification data
  notificationWindow.showInactive() // Show without stealing focus
  
  // Handle click-through mode based on config
  const clickThrough = config.notification?.clickThrough ?? false
  notificationWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  
  notificationWindow.webContents.send("show-notification", notificationData)
}

function updateNotificationConfig() {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send("notification-config", config.notification)
    
    // Update click-through state
    const clickThrough = config.notification?.clickThrough ?? false
    notificationWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  }
}

function hideNotification() {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.hide()
    // Re-enable click-through for when it's shown again
    notificationWindow.setIgnoreMouseEvents(true, { forward: true })
  }
}

function toggleOverlayWindow() {
  const now = Date.now()
  const debounceMs = config.shortcutDebounceMs || 300
  if (now - lastToggleTime < debounceMs) {
    appendLog("INPUT", "Toggle debounced - ignoring rapid keypress")
    return
  }
  lastToggleTime = now

  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    hideOverlayWindow()
  } else {
    showOverlayWindow()
  }
}

function resetPanelSizes() {
  config = {
    ...config,
    panelSizes: {
      leftPanel: 20,
      rightPanel: 22,
      bottomPanel: 35,
    },
  }
  saveConfigToDisk()
  broadcastConfig()
}

function createAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Reset Panel Sizes",
          click: () => resetPanelSizes(),
        },
        { type: "separator" },
        { role: "minimize" },
        { role: "close" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Stream Dork",
          click: async () => {
            const { dialog } = require("electron")
            dialog.showMessageBox({
              type: "info",
              title: "About Stream Dork",
              message: "Stream Dork",
              detail: "A virtual stream deck overlay for your desktop.\n\nVersion: 0.1.0",
            })
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createTray() {
  appendLog("APP", "Creating tray icon")
  try {
    // Use the app icon from the React public assets in dev,
    // and the copied asset from the Vite build in production.
    const trayIconPath = isDev
      ? path.join(__dirname, "..", "public", "stream-dork.png")
      : path.join(__dirname, "..", "dist", "stream-dork.png")
    const trayIcon = nativeImage.createFromPath(trayIconPath)

    tray = new Tray(trayIcon)

    const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Overlay",
      click: () => {
        toggleOverlayWindow()
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
    tray.setToolTip("Stream Dork")
    tray.on("double-click", () => {
      showSetupWindow()
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
    if (enableFileLogging) {
      const logDir = getAppLogDir()
      appendLog("DEBUG", `📝 File logging enabled - logs will be written to: ${logDir}`)
      console.log(`[File Logging] Enabled - Logs directory: ${logDir}`)
    } else {
      console.log("[File Logging] Disabled - Use --stream-dork-file-logging=1 to enable")
    }
    appendLog("DEBUG", `🔧 Chrome DevTools Protocol enabled on http://localhost:${REMOTE_DEBUGGING_PORT}`)
    appendLog("DEBUG", `📋 Use this URL to debug Property Inspectors in your browser`)
    
    // Load config first, then initialize plugins with the configured language
    loadConfigFromDisk()
    initializePluginsAndHost()
    
    createAppMenu()
    showSetupWindow()
    createOverlayWindow()
    createNotificationWindow()
    streamDeckHost.start()
    restorePluginContexts()
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
  if (streamDeckHost) {
    streamDeckHost.stop()
  }
})

app.on("activate", () => {
  logAppEvent("activate")
  if (BrowserWindow.getAllWindows().length === 0) {
    createSetupWindow()
    createOverlayWindow()
    createNotificationWindow()
  }
})

ipcMain.handle("get-config", () => {
  appendLog("IPC", "get-config requested")
  return config
})

ipcMain.handle("get-app-flags", () => {
  return {
    showControlPanel,
    fileLogging: enableFileLogging,
  }
})

ipcMain.handle("update-config", (event, updates) => {
  appendLog("IPC", `update-config with ${safeStringify(updates)}`)
  return updateConfig(updates)
})

ipcMain.handle("host:get-state", () => streamDeckHost.getState())
ipcMain.handle("host:get-visual-state", () => streamDeckHost.getVisualState())
ipcMain.handle("host:create-context", (event, { pluginUuid, actionUuid, coordinates, context } = {}) => {
  return streamDeckHost.createContext(pluginUuid, actionUuid, coordinates, context)
})
ipcMain.handle("host:send-event", (event, { context, eventName, payload } = {}) => {
  if (!context || !eventName) return
  streamDeckHost.sendToContext(context, eventName, payload)
})
ipcMain.on("host:inspector-visibility", (event, { context, visible }) => {
  if (!context) return
  const eventName = visible ? "propertyInspectorDidAppear" : "propertyInspectorDidDisappear"
  streamDeckHost.sendToContext(context, eventName)
})

ipcMain.on("show-setup", () => {
  appendLog("IPC", "show-setup requested")
  showSetupWindow()
})

ipcMain.on("close-overlay", () => {
  appendLog("IPC", "close-overlay requested")
  hideOverlayWindow()
})

ipcMain.on("force-hide-overlay", () => {
  appendLog("IPC", "force-hide-overlay requested (animation complete)")
  forceHideOverlay()
})

ipcMain.on("toggle-setup", () => {
  appendLog("IPC", "toggle-setup requested")
  if (setupWindow?.isVisible()) {
    setupWindow.hide()
  } else {
    showSetupWindow()
  }
})

ipcMain.on("open-plugin-folder", () => {
  appendLog("IPC", "open-plugin-folder requested")
  const { shell } = require("electron")
  shell.openPath(PLUGIN_ROOT)
})

ipcMain.on("hide-notification", () => {
  hideNotification()
})

ipcMain.handle("get-notification-config", () => {
  return config.notification
})

ipcMain.on("dismiss-notification", (event, { id }) => {
  // Forward the dismiss request to the notification window
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send("dismiss-notification", { id })
  }
})

// Icon file selection dialog
ipcMain.handle("select-icon-file", async () => {
  const result = await dialog.showOpenDialog(setupWindow, {
    title: "Select Icon",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp"] },
    ],
    properties: ["openFile"],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  
  // Load the file and convert to data URL
  try {
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes = {
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".gif": "image/gif",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }
    const mimeType = mimeTypes[ext] || "application/octet-stream"
    const fileData = fs.readFileSync(filePath)
    const base64 = fileData.toString("base64")
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    appendLog("ERROR", `Failed to read icon file: ${error.message}`)
    return null
  }
})

