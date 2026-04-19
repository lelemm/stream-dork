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

// Windows API for forcing window to stay on top (above Teams screen sharing, etc.)
let setWindowTopmost = null
if (process.platform === "win32") {
  try {
    const koffi = require("koffi")
    const user32 = koffi.load("user32.dll")
    
    // SetWindowPos constants
    const HWND_TOPMOST = -1
    const SWP_NOSIZE = 0x0001
    const SWP_NOMOVE = 0x0002
    const SWP_NOACTIVATE = 0x0010
    const SWP_SHOWWINDOW = 0x0040
    
    // Define SetWindowPos: BOOL SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, UINT uFlags)
    // Note: hWndInsertAfter is passed as int since HWND_TOPMOST is -1
    const SetWindowPos = user32.func("SetWindowPos", "bool", ["pointer", "int", "int", "int", "int", "int", "uint"])
    
    setWindowTopmost = (browserWindow) => {
      if (!browserWindow || browserWindow.isDestroyed()) return false
      try {
        const hwnd = browserWindow.getNativeWindowHandle()
        return SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW)
      } catch (err) {
        console.error("SetWindowPos failed:", err)
        return false
      }
    }
    console.log("[Windows API] koffi loaded successfully for native window positioning")
  } catch (err) {
    console.warn("[Windows API] Failed to load koffi, falling back to Electron alwaysOnTop:", err.message)
  }
}

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
  overlayShortcut: "Control+Alt+Space",
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
let currentRegisteredShortcut = null

// Do Not Disturb state
let doNotDisturb = false

// Snoozed contexts: Map<context, expiryTimestamp>
const snoozedContexts = new Map()

// Function to register or re-register the overlay shortcut
function registerOverlayShortcut() {
  const shortcut = config.overlayShortcut || "Control+Alt+Space"
  
  // Unregister previous shortcut if it changed
  if (currentRegisteredShortcut && currentRegisteredShortcut !== shortcut) {
    try {
      globalShortcut.unregister(currentRegisteredShortcut)
      appendLog("INPUT", `Unregistered previous shortcut: ${currentRegisteredShortcut}`)
    } catch (error) {
      appendLog("ERROR", `Failed to unregister shortcut ${currentRegisteredShortcut}: ${error}`)
    }
    currentRegisteredShortcut = null
  }
  
  // Skip if already registered with same shortcut
  if (currentRegisteredShortcut === shortcut) {
    appendLog("INPUT", `Shortcut already registered: ${shortcut}`)
    return { success: true, shortcut }
  }
  
  // Register the new shortcut
  try {
    const success = globalShortcut.register(shortcut, () => {
      appendLog("INPUT", `${shortcut} shortcut triggered`)
      toggleOverlayWindow()
    })
    
    if (success) {
      currentRegisteredShortcut = shortcut
      appendLog("INPUT", `Registered overlay shortcut: ${shortcut}`)
      return { success: true, shortcut }
    } else {
      appendLog("ERROR", `Failed to register shortcut: ${shortcut} (already in use or invalid)`)
      return { success: false, shortcut, error: "Shortcut may already be in use by another application or is invalid" }
    }
  } catch (error) {
    appendLog("ERROR", `Error registering shortcut ${shortcut}: ${error}`)
    return { success: false, shortcut, error: String(error) }
  }
}

// Test if a shortcut is valid without permanently registering it
function testShortcut(shortcut) {
  try {
    // Try to register temporarily
    const success = globalShortcut.register(shortcut, () => {})
    if (success) {
      globalShortcut.unregister(shortcut)
      return { valid: true }
    }
    return { valid: false, error: "Shortcut may already be in use" }
  } catch (error) {
    return { valid: false, error: String(error) }
  }
}

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

/**
 * Validate config structure - returns true if config is valid for current version
 */
function isConfigValid(parsed) {
  // Config must have buttons as a flat array (not in scenes)
  if (!Array.isArray(parsed.buttons)) {
    return false
  }
  
  // If scenes exist, they should NOT have a buttons property (old format)
  if (parsed.scenes && Array.isArray(parsed.scenes)) {
    for (const scene of parsed.scenes) {
      if (scene.buttons && Array.isArray(scene.buttons) && scene.buttons.length > 0) {
        // Old format with buttons inside scenes - invalid
        return false
      }
    }
  }
  
  return true
}

function loadConfigFromDisk() {
  appendLog("CONFIG", "Loading configuration from disk")
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8")
      const parsed = JSON.parse(raw)
      
      // Validate config structure - if invalid, delete and start fresh
      if (!isConfigValid(parsed)) {
        appendLog("CONFIG", "Invalid config format detected (old scene-based structure), deleting and starting fresh")
        fs.unlinkSync(CONFIG_FILE)
        config = { ...defaultConfig }
        return
      }
      
      config = { ...defaultConfig, ...parsed }
    }
  } catch (error) {
    appendLog("ERROR", `loadConfigFromDisk failed: ${error.stack || error}`)
    // If config is corrupted, delete it and start fresh
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE)
        appendLog("CONFIG", "Deleted corrupted config file, starting fresh")
      }
    } catch (deleteError) {
      appendLog("ERROR", `Failed to delete corrupted config: ${deleteError}`)
    }
    config = { ...defaultConfig }
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

// Track HTML/JS plugin windows so we can clean them up
const pluginWindows = new Map()

/**
 * Launch an HTML-based plugin in a hidden BrowserWindow.
 * The Stream Deck SDK expects the host to call connectElgatoStreamDeckSocket after the page loads.
 */
function launchHtmlPluginWindow(plugin, port, info) {
  appendLog("PLUGIN", `Launching HTML plugin: ${plugin.name}`)
  
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      // Allow loading local resources from the plugin directory
      webSecurity: false,
    },
  })
  
  pluginWindows.set(plugin.uuid, win)
  
  // Load the HTML file
  const htmlPath = plugin.codePath
  win.loadFile(htmlPath).then(() => {
    appendLog("PLUGIN", `HTML plugin loaded: ${plugin.name}`)
    
    // Call the Stream Deck SDK initialization function
    // The SDK expects: connectElgatoStreamDeckSocket(port, uuid, registerEvent, info)
    const infoJson = JSON.stringify(info).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
    const script = `
      if (typeof connectElgatoStreamDeckSocket === 'function') {
        connectElgatoStreamDeckSocket(${port}, '${plugin.uuid}', 'registerPlugin', '${infoJson}');
      } else if (window.connectElgatoStreamDeckSocket) {
        window.connectElgatoStreamDeckSocket(${port}, '${plugin.uuid}', 'registerPlugin', '${infoJson}');
      } else {
        console.error('Stream Deck SDK not found - connectElgatoStreamDeckSocket is not defined');
      }
    `
    win.webContents.executeJavaScript(script).catch((err) => {
      appendLog("PLUGIN", `Failed to initialize HTML plugin ${plugin.name}: ${err.message}`)
    })
  }).catch((err) => {
    appendLog("PLUGIN", `Failed to load HTML plugin ${plugin.name}: ${err.message}`)
    pluginWindows.delete(plugin.uuid)
    win.destroy()
  })
  
  win.webContents.on("console-message", (event, level, message, line, sourceId) => {
    const levelNames = ["LOG", "WARN", "ERROR", "DEBUG"]
    const levelName = levelNames[level] || "LOG"
    appendLog(`PLUGIN-${levelName}`, `[${plugin.name}] ${message}`)
  })
  
  win.on("closed", () => {
    appendLog("PLUGIN", `HTML plugin window closed: ${plugin.name}`)
    pluginWindows.delete(plugin.uuid)
  })
}

/**
 * Launch a JavaScript-based plugin in a hidden BrowserWindow with Node.js integration.
 * This allows running JS plugins without requiring Node.js to be installed separately.
 */
function launchJsPluginWindow(plugin, port, info) {
  appendLog("PLUGIN", `Launching JS plugin: ${plugin.name}`)
  
  const pluginDir = path.dirname(plugin.codePath)
  
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Allow require() and other Node.js APIs
      webSecurity: false,
    },
  })
  
  pluginWindows.set(plugin.uuid, win)
  
  // Create a minimal HTML that loads the JS plugin
  const jsPath = plugin.codePath.replace(/\\/g, "/")
  const infoJson = JSON.stringify(info).replace(/\\/g, "\\\\").replace(/`/g, "\\`")
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${plugin.name}</title>
    </head>
    <body>
      <script>
        // Set up the global connection function that Stream Deck plugins expect
        window.connectElgatoStreamDeckSocket = function(port, uuid, registerEvent, info) {
          // Plugin's own code will handle this
        };
        
        // Provide connection parameters as globals (some plugins read these)
        window.$SD = window.$SD || {};
        window.$SD.port = ${port};
        window.$SD.uuid = '${plugin.uuid}';
        window.$SD.registerEvent = 'registerPlugin';
        window.$SD.info = ${infoJson};
        
        // Load the plugin
        try {
          require('${jsPath}');
        } catch (err) {
          console.error('Failed to load plugin:', err);
        }
      </script>
    </body>
    </html>
  `
  
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
    appendLog("PLUGIN", `Failed to load JS plugin ${plugin.name}: ${err.message}`)
    pluginWindows.delete(plugin.uuid)
    win.destroy()
  })
  
  win.webContents.on("console-message", (event, level, message, line, sourceId) => {
    const levelNames = ["LOG", "WARN", "ERROR", "DEBUG"]
    const levelName = levelNames[level] || "LOG"
    appendLog(`PLUGIN-${levelName}`, `[${plugin.name}] ${message}`)
  })
  
  win.on("closed", () => {
    appendLog("PLUGIN", `JS plugin window closed: ${plugin.name}`)
    pluginWindows.delete(plugin.uuid)
  })
}

/**
 * Close all plugin windows (called on app quit)
 */
function closeAllPluginWindows() {
  for (const [uuid, win] of pluginWindows.entries()) {
    try {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    } catch (err) {
      appendLog("PLUGIN", `Error closing plugin window ${uuid}: ${err.message}`)
    }
  }
  pluginWindows.clear()
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

  // Register HTML plugin launcher - runs in a hidden BrowserWindow
  streamDeckHost.onLaunchHtmlPlugin = (plugin, port, info) => {
    launchHtmlPluginWindow(plugin, port, info)
  }

  // Register JS plugin launcher - runs in a hidden BrowserWindow with nodeIntegration
  streamDeckHost.onLaunchJsPlugin = (plugin, port, info) => {
    launchJsPluginWindow(plugin, port, info)
  }
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
  const previousShortcut = config.overlayShortcut
  config = { ...config, ...partial }
  saveConfigToDisk()
  broadcastConfig()
  updateNotificationConfig()
  
  // Re-register shortcut if it changed
  if (partial.overlayShortcut !== undefined && partial.overlayShortcut !== previousShortcut) {
    registerOverlayShortcut()
  }
  
  // Clean up orphaned contexts when buttons change
  if (partial.buttons !== undefined && streamDeckHost) {
    cleanupOrphanedHostContexts()
  }
  
  return config
}

/**
 * Clean up host contexts that no longer have corresponding buttons in the config.
 * This prevents host-state.json from accumulating data from removed actions.
 */
function cleanupOrphanedHostContexts() {
  if (!streamDeckHost) return
  
  // Get all active contexts from current config
  const activeContexts = config.buttons
    .filter((btn) => btn.action?.context)
    .map((btn) => btn.action.context)
  
  streamDeckHost.cleanupOrphanedContexts(activeContexts)
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

// Interval reference for aggressive alwaysOnTop polling
let overlayAlwaysOnTopInterval = null
// Burst timers to repeatedly reassert topmost status after show/blur events
let overlayTopmostBurstTimeouts = []
const OVERLAY_TOPMOST_INTERVAL_MS = 200

function clearOverlayTopmostBurst() {
  overlayTopmostBurstTimeouts.forEach(clearTimeout)
  overlayTopmostBurstTimeouts = []
}

function reassertOverlayTopmost(reason = "") {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  try {
    if (setWindowTopmost) {
      setWindowTopmost(overlayWindow)
    }
    overlayWindow.setAlwaysOnTop(true, "screen-saver")
  } catch (error) {
    appendLog("ERROR", `reassertOverlayTopmost failed${reason ? ` (${reason})` : ""}: ${error.stack || error}`)
  }
}

function scheduleOverlayTopmostBurst(reason = "") {
  clearOverlayTopmostBurst()
  const delays = [0, 75, 200, 400, 800]
  delays.forEach((delay) => {
    overlayTopmostBurstTimeouts.push(
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
          reassertOverlayTopmost(reason)
        }
      }, delay)
    )
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

  // Re-assert alwaysOnTop when window loses focus (combats Teams screen sharing)
  overlayWindow.on("blur", () => {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      scheduleOverlayTopmostBurst("blur")
    }
  })

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

  // Move and resize the overlay window so it covers the display
  // where the mouse cursor is currently located. This ensures
  // multi-monitor setups behave correctly and we respect the
  // target monitor's resolution and work area.
  try {
    const { screen } = require("electron")
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)

    if (display && overlayWindow && !overlayWindow.isDestroyed()) {
      const { x, y, width, height } = display.workArea
      overlayWindow.setBounds({ x, y, width, height })
    }
  } catch (error) {
    appendLog("ERROR", `showOverlayWindow positioning failed: ${error.stack || error}`)
  }

  // Reassert topmost status immediately before showing
  reassertOverlayTopmost("pre-show")
  overlayWindow.show()
  overlayWindow.focus()
  // Fire a burst of reassertions after show/focus to fight apps (Teams screen sharing) that steal z-order
  scheduleOverlayTopmostBurst("post-show")

  // Start aggressive alwaysOnTop polling to combat apps like Teams that steal z-order
  // This re-asserts the window's position every few hundred ms while visible
  if (overlayAlwaysOnTopInterval) {
    clearInterval(overlayAlwaysOnTopInterval)
  }
  overlayAlwaysOnTopInterval = setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      reassertOverlayTopmost("interval")
    } else {
      clearInterval(overlayAlwaysOnTopInterval)
      overlayAlwaysOnTopInterval = null
      clearOverlayTopmostBurst()
    }
  }, OVERLAY_TOPMOST_INTERVAL_MS)

  // Notify the overlay to start the show animation
  overlayWindow.webContents.send("overlay-visibility", { visible: true })
}

function hideOverlayWindow() {
  // Stop the alwaysOnTop polling interval
  if (overlayAlwaysOnTopInterval) {
    clearInterval(overlayAlwaysOnTopInterval)
    overlayAlwaysOnTopInterval = null
  }
  clearOverlayTopmostBurst()
  
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // Notify the overlay to start the hide animation, then hide the window after animation completes
    overlayWindow.webContents.send("overlay-visibility", { visible: false })
  }
}

function forceHideOverlay() {
  // Stop the alwaysOnTop polling interval
  if (overlayAlwaysOnTopInterval) {
    clearInterval(overlayAlwaysOnTopInterval)
    overlayAlwaysOnTopInterval = null
  }
  clearOverlayTopmostBurst()
  
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

// Track pending notifications while window is loading
let pendingNotification = null
let notificationWindowReady = false

function createNotificationWindow() {
  appendLog("WINDOW", "Creating notification window")
  notificationWindowReady = false
  try {
    const { screen } = require("electron")
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize
    
    // Make window full height of viewport so notifications don't get clipped
    // Width is wide enough for horizontal fan-out (5 cards * ~80px each)
    const notificationWidth = 500
    const notificationHeight = height

    notificationWindow = new BrowserWindow({
      width: notificationWidth,
      height: notificationHeight,
      x: width - notificationWidth,
      y: 0,
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

    // Wait for the page to finish loading before sending notifications
    notificationWindow.webContents.on("did-finish-load", () => {
      appendLog("WINDOW", "Notification window finished loading")
      notificationWindowReady = true
      // Send any pending notification
      if (pendingNotification) {
        sendNotificationToWindow(pendingNotification)
        pendingNotification = null
      }
    })

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

  notificationWindow.on("closed", () => {
    notificationWindowReady = false
    notificationWindow = null
  })
}

function sendNotificationToWindow(notificationData) {
  if (!notificationWindow || notificationWindow.isDestroyed()) return
  
  // Show the window and send the notification data
  notificationWindow.showInactive() // Show without stealing focus

  notificationWindow.webContents.send("show-notification", notificationData)
}

function showNotification(message) {
  // Check Do Not Disturb mode
  if (doNotDisturb) {
    appendLog("NOTIFICATION", "Notification blocked - Do Not Disturb is enabled")
    return
  }

  const { event, context, payload } = message

  // Check if this context is snoozed
  const snoozeExpiry = snoozedContexts.get(context)
  if (snoozeExpiry) {
    if (Date.now() < snoozeExpiry) {
      appendLog("NOTIFICATION", `Notification blocked - context ${context} is snoozed until ${new Date(snoozeExpiry).toISOString()}`)
      return
    } else {
      // Snooze expired, remove it
      snoozedContexts.delete(context)
      updateTrayMenu()
    }
  }

  // Get button info from config to include icon/title context
  const button = config.buttons.find(
    (btn) => btn.action?.context === context
  )
  
  // Get current visual state from host (plugin-set image/title takes precedence over config)
  const visualState = streamDeckHost?.getVisualState()?.[context]
  
  const notificationData = {
    context,
    event,
    // Priority: payload (from current event) > visual state (from host) > config
    icon: payload?.image || visualState?.image || button?.icon,
    title: payload?.title || visualState?.title || button?.label,
    backgroundColor: button?.backgroundColor,
    textColor: button?.textColor,
    status: event === "showOk" ? "ok" : event === "showAlert" ? "alert" : undefined,
  }

  // Create window if needed
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    createNotificationWindow()
  }

  // If window is ready, send immediately; otherwise queue it
  if (notificationWindowReady) {
    sendNotificationToWindow(notificationData)
  } else {
    // Queue the notification - only keep the latest for this context
    pendingNotification = notificationData
    appendLog("NOTIFICATION", `Queued notification for ${context} (window loading)`)
  }
}

function updateNotificationConfig() {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send("notification-config", config.notification)
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

function buildTrayMenuTemplate() {
  const template = [
    {
      label: "Open Overlay",
      click: () => {
        toggleOverlayWindow()
      },
    },
    { type: "separator" },
    {
      label: "Do Not Disturb",
      type: "checkbox",
      checked: doNotDisturb,
      click: () => {
        doNotDisturb = !doNotDisturb
        appendLog("NOTIFICATION", `Do Not Disturb ${doNotDisturb ? "enabled" : "disabled"}`)
        updateTrayMenu()
      },
    },
  ]

  // Add "Wake all action notifications" if there are snoozed contexts
  if (snoozedContexts.size > 0) {
    template.push({
      label: `Wake all action notifications (${snoozedContexts.size})`,
      click: () => {
        snoozedContexts.clear()
        appendLog("NOTIFICATION", "All snoozed notifications have been woken")
        updateTrayMenu()
      },
    })
  }

  template.push(
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true
        app.quit()
      },
    }
  )

  return template
}

function updateTrayMenu() {
  if (tray && !tray.isDestroyed()) {
    const contextMenu = Menu.buildFromTemplate(buildTrayMenuTemplate())
    tray.setContextMenu(contextMenu)
  }
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
    updateTrayMenu()
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

    registerOverlayShortcut()
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
  closeAllPluginWindows()
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

ipcMain.handle("test-shortcut", (event, shortcut) => {
  appendLog("IPC", `test-shortcut: ${shortcut}`)
  return testShortcut(shortcut)
})

ipcMain.handle("register-overlay-shortcut", () => {
  appendLog("IPC", "register-overlay-shortcut")
  return registerOverlayShortcut()
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

ipcMain.on("set-ignore-mouse-events", (event, { ignore, forward }) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: forward ?? true })
  }
})

ipcMain.on("set-notification-ignore-mouse-events", (event, { ignore, forward }) => {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.setIgnoreMouseEvents(ignore, { forward: forward ?? true })
  }
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

ipcMain.on("dismiss-notification", (event, { context }) => {
  // Forward the dismiss request to the notification window
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send("dismiss-notification", { context })
  }
})

// Snooze a specific context for a given duration (in minutes)
ipcMain.handle("snooze-notification", (event, { context, minutes }) => {
  const expiryTime = Date.now() + minutes * 60 * 1000
  snoozedContexts.set(context, expiryTime)
  appendLog("NOTIFICATION", `Snoozed context ${context} for ${minutes} minutes until ${new Date(expiryTime).toISOString()}`)
  updateTrayMenu()
  return { success: true, expiryTime }
})

// Wake (unsnooze) a specific context
ipcMain.handle("wake-notification", (event, { context }) => {
  const wasSnozed = snoozedContexts.has(context)
  snoozedContexts.delete(context)
  if (wasSnozed) {
    appendLog("NOTIFICATION", `Woke context ${context}`)
    updateTrayMenu()
  }
  return { success: true, wasSnozed }
})

// Get all snoozed contexts
ipcMain.handle("get-snoozed-contexts", () => {
  const result = {}
  snoozedContexts.forEach((expiry, context) => {
    result[context] = expiry
  })
  return result
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

