const { WebSocketServer } = require("ws")
const { shell } = require("electron")
const crypto = require("crypto")
const { exec, spawn, fork } = require("child_process")
const fs = require("fs")
const path = require("path")

const DEFAULT_DEVICE_ID = "stream-dork-host"

function safeUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

/**
 * Strip ANSI escape codes from a string (color codes, cursor movements, etc.)
 * @param {string} str - The string to strip
 * @returns {string} The string without ANSI codes
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
}

class StreamDeckHost {
  constructor({ plugins = [], iconLibraries = [], logger = () => {}, notifyRenderer = () => {}, stateFile, language = "en", enableFileLogging = false }) {
    this.plugins = plugins
    this.iconLibraries = iconLibraries
    this.logger = logger
    this.language = language // Configured language for plugin i18n
    this.enableFileLogging = enableFileLogging
    this.port = 0
    this.server = null
    this.connectionMeta = new Map()
    this.pluginSockets = new Map()
    this.pluginProcesses = new Map() // Track spawned plugin processes
    this.inspectorSockets = new Set()
    this.contextRegistry = new Map()
    this.contextSettings = new Map()
    this.globalSettings = new Map()
    this.inspectorByContext = new Map()
    this.logs = []
    this.actionLookup = new Map()
    this.notifyRenderer = notifyRenderer
    this.stateFile = stateFile
    // Track visual state (image, title, state) per context for runtime overrides from plugins
    // This allows the overlay to get the current visual state when it opens
    this.visualState = new Map()
    this.monitoredApps = new Map()
    this.monitoredState = new Map()
    this.appMonitorInterval = null
    this.plugins.forEach((plugin) => {
      plugin.actions.forEach((action) => {
        this.actionLookup.set(action.uuid, plugin.uuid)
      })
    })
    this.plugins.forEach((plugin) => {
      this.monitoredApps.set(plugin.uuid, plugin.monitoredApps || [])
    })
    this.loadState()
    // Communication log (per-day file: comm_<date>.txt next to stateFile)
    this.commLogDate = null
    this.commLogPath = null
    // Track last sent settings to avoid flooding with duplicate didReceiveSettings
    // Key: context, Value: JSON string of last sent settings
    this.lastSentSettingsToPlugin = new Map()
    this.lastSentSettingsToInspector = new Map()
  }

  getCommLogPath() {
    if (!this.stateFile) return null
    const today = new Date().toISOString().split("T")[0]
    if (this.commLogDate !== today || this.commLogPath === null) {
      this.commLogDate = today
      const dir = path.dirname(this.stateFile)
      this.commLogPath = path.join(dir, `comm_${today}.txt`)
    }
    return this.commLogPath
  }

  logComm(kind, details, payload) {
    if (!this.enableFileLogging) {
      return
    }
    const filePath = this.getCommLogPath()
    if (!filePath) return
    const line = `${new Date().toISOString()} [${kind}] ${details}${
      payload ? ` ${JSON.stringify(payload)}` : ""
    }\n`
    try {
      fs.appendFileSync(filePath, line, "utf-8")
    } catch {
      // Communication logging should never crash the host; ignore errors.
    }
  }

  start() {
    if (this.server) {
      return
    }

    this.server = new WebSocketServer({ port: 0 })
    this.server.on("listening", () => {
      this.port = this.server.address().port
      this.log("HOST", `WebSocket server listening on port ${this.port}`)
      // Launch all discovered plugins after server is ready
      this.launchPlugins()
    })

    this.server.on("connection", (socket) => {
      const meta = { id: safeUUID(), socket, type: "unknown" }
      this.connectionMeta.set(socket, meta)
      socket.on("message", (raw) => this.handleMessage(socket, raw))
      socket.on("close", () => this.cleanupConnection(socket))
      socket.on("error", (error) => this.log("HOST", `connection error: ${error.message}`))
    })

    this.server.on("error", (error) => {
      this.log("HOST", `WebSocket server error: ${error.message}`)
    })
    this.startApplicationWatcher()
  }

  stop() {
    if (!this.server) return
    this.terminatePlugins()
    this.server.close()
    this.server = null
    this.port = 0
    this.stopApplicationWatcher()
  }

  launchPlugins() {
    for (const plugin of this.plugins) {
      this.launchPlugin(plugin)
    }
  }

  launchPlugin(plugin) {
    if (!plugin.codePath) {
      this.log("HOST", `Plugin ${plugin.name} has no codePath, skipping launch`)
      return
    }

    if (!fs.existsSync(plugin.codePath)) {
      this.log("HOST", `Plugin executable not found: ${plugin.codePath}`)
      return
    }

    // Build the info object that Stream Deck passes to plugins
    const info = {
      application: {
        font: "Segoe UI",
        language: this.language, // Use configured language for plugin i18n
        platform: "windows",
        platformVersion: "10.0",
        version: "6.0.0"
      },
      plugin: {
        uuid: plugin.uuid,
        version: plugin.version
      },
      devicePixelRatio: 2,
      colors: {
        buttonPressedBackgroundColor: "#303030FF",
        buttonPressedBorderColor: "#646464FF",
        buttonPressedTextColor: "#969696FF",
        disabledColor: "#F7821B59",
        highlightColor: "#F7821BFF",
        mouseDownColor: "#CF6304FF"
      },
      devices: [
        {
          id: DEFAULT_DEVICE_ID,
          name: "Stream Dork",
          size: { columns: 5, rows: 3 },
          type: 0
        }
      ]
    }

    const ext = path.extname(plugin.codePath).toLowerCase()
    this.log("HOST", `Launching plugin: ${plugin.name} (${plugin.codePath}) [type: ${ext}]`)

    // Handle different plugin types
    if (ext === ".html" || ext === ".htm") {
      // HTML-based plugins run in a hidden BrowserWindow
      this.launchHtmlPlugin(plugin, info)
    } else if (ext === ".js") {
      // JavaScript plugins run with Node.js
      this.launchNodePlugin(plugin, info)
    } else {
      // Native executables (.exe, etc.) spawn directly
      this.launchNativePlugin(plugin, info)
    }
  }

  launchHtmlPlugin(plugin, info) {
    // HTML plugins need to be launched in Electron's main process
    // We'll use a callback to notify the main process to create a hidden BrowserWindow
    if (this.onLaunchHtmlPlugin) {
      this.onLaunchHtmlPlugin(plugin, this.port, info)
      this.log("HOST", `Requested HTML plugin launch: ${plugin.name}`)
    } else {
      this.log("HOST", `Cannot launch HTML plugin ${plugin.name}: no HTML plugin launcher registered`)
    }
  }

  launchNodePlugin(plugin, info) {
    // For JS plugins, we can use Electron's BrowserWindow with nodeIntegration
    // This allows running JS plugins without requiring Node.js to be installed separately
    // The plugin will run in a hidden renderer process with Node.js APIs available
    if (this.onLaunchJsPlugin) {
      this.onLaunchJsPlugin(plugin, this.port, info)
      this.log("HOST", `Requested JS plugin launch via Electron: ${plugin.name}`)
      return
    }
    
    // Fallback: try to spawn with Node.js from PATH (if available)
    const args = [
      plugin.codePath,
      "-port", String(this.port),
      "-pluginUUID", plugin.uuid,
      "-registerEvent", "registerPlugin",
      "-info", JSON.stringify(info)
    ]

    this.log("HOST", `Plugin args: node ${args.join(" ")}`)

    try {
      const pluginDir = path.dirname(plugin.codePath)
      const nodeCmd = process.platform === "win32" ? "node.exe" : "node"
      const proc = spawn(nodeCmd, args, {
        cwd: pluginDir,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true,
        shell: true // Use shell to find node in PATH
      })

      this.pluginProcesses.set(plugin.uuid, proc)

      proc.stdout.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean)
        lines.forEach((line) => this.log("PLUGIN-STDOUT", `[${plugin.name}] ${stripAnsi(line)}`))
      })

      proc.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean)
        lines.forEach((line) => this.log("PLUGIN-STDERR", `[${plugin.name}] ${stripAnsi(line)}`))
      })

      proc.on("error", (error) => {
        this.log("HOST", `Plugin ${plugin.name} (Node) failed to start: ${error.message}`)
        this.pluginProcesses.delete(plugin.uuid)
      })

      proc.on("exit", (code, signal) => {
        this.log("HOST", `Plugin ${plugin.name} exited (code=${code}, signal=${signal})`)
        this.pluginProcesses.delete(plugin.uuid)
        this.pluginSockets.delete(plugin.uuid)
      })

      this.log("HOST", `Plugin ${plugin.name} launched with Node.js, PID ${proc.pid}`)
    } catch (error) {
      this.log("HOST", `Failed to spawn Node plugin ${plugin.name}: ${error.message}`)
    }
  }

  launchNativePlugin(plugin, info) {
    const args = [
      "-port", String(this.port),
      "-pluginUUID", plugin.uuid,
      "-registerEvent", "registerPlugin",
      "-info", JSON.stringify(info)
    ]

    this.log("HOST", `Plugin args: ${args.join(" ")}`)

    try {
      const pluginDir = path.dirname(plugin.codePath)
      const proc = spawn(plugin.codePath, args, {
        cwd: pluginDir,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true
      })

      this.pluginProcesses.set(plugin.uuid, proc)

      proc.stdout.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean)
        lines.forEach((line) => this.log("PLUGIN-STDOUT", `[${plugin.name}] ${stripAnsi(line)}`))
      })

      proc.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean)
        lines.forEach((line) => this.log("PLUGIN-STDERR", `[${plugin.name}] ${stripAnsi(line)}`))
      })

      proc.on("error", (error) => {
        this.log("HOST", `Plugin ${plugin.name} failed to start: ${error.message}`)
        this.pluginProcesses.delete(plugin.uuid)
      })

      proc.on("exit", (code, signal) => {
        this.log("HOST", `Plugin ${plugin.name} exited (code=${code}, signal=${signal})`)
        this.pluginProcesses.delete(plugin.uuid)
        this.pluginSockets.delete(plugin.uuid)
      })

      this.log("HOST", `Plugin ${plugin.name} launched with PID ${proc.pid}`)
    } catch (error) {
      this.log("HOST", `Failed to spawn plugin ${plugin.name}: ${error.message}`)
    }
  }

  terminatePlugins() {
    for (const [uuid, proc] of this.pluginProcesses.entries()) {
      this.log("HOST", `Terminating plugin process: ${uuid}`)
      try {
        proc.kill("SIGTERM")
      } catch (error) {
        this.log("HOST", `Failed to terminate plugin ${uuid}: ${error.message}`)
      }
    }
    this.pluginProcesses.clear()
  }

  handleMessage(socket, raw) {
    let meta = this.connectionMeta.get(socket)
    if (!meta) return

    let message
    try {
      message = JSON.parse(raw.toString())
    } catch (error) {
      this.log("HOST", `Invalid JSON from ${meta.type}: ${error.message}`)
      return
    }

    // Log every incoming WebSocket message
    const sourceType = meta.type || "unknown"
    const sourceId =
      sourceType === "plugin"
        ? meta.pluginUuid || "unregistered"
        : sourceType === "inspector"
          ? meta.inspectorUuid || "unregistered"
          : "unregistered"
    this.logComm("RECV", `${sourceType}:${sourceId}`, {
      event: message.event,
      context: message.context,
      action: message.action,
    })

    const { event } = message
    if (!event) return

    if (event === "registerPlugin") {
      this.registerPlugin(socket, message)
      return
    }

    if (event === "registerPropertyInspector") {
      this.registerInspector(socket, message)
      return
    }

    if (meta.type === "plugin") {
      this.handlePluginEvent(meta, message)
    } else if (meta.type === "inspector") {
      this.handleInspectorEvent(meta, message)
    }
  }

  registerPlugin(socket, message) {
    const meta = this.connectionMeta.get(socket)
    if (!meta) {
      this.log("REGISTRATION", "Registration attempt failed: socket metadata not found")
      return
    }

    const pluginUuid = message.uuid
    this.log("REGISTRATION", `Registration request received for plugin UUID: ${pluginUuid}`)
    
    const plugin = this.plugins.find((entry) => entry.uuid === pluginUuid)
    if (!plugin) {
      this.log("REGISTRATION", `Registration failed: Unknown plugin UUID ${pluginUuid}`)
      return
    }

    this.log("REGISTRATION", `Registering plugin: ${plugin.name} (UUID: ${pluginUuid}, Version: ${plugin.version})`)
    
    meta.type = "plugin"
    meta.pluginUuid = pluginUuid
    this.pluginSockets.set(pluginUuid, socket)

    this.log("REGISTRATION", `Plugin successfully registered: ${plugin.name} (UUID: ${pluginUuid})`)
    this.send(socket, { event: "registration", uuid: pluginUuid })
    this.send(socket, {
      event: "didReceiveGlobalSettings",
      payload: { settings: this.globalSettings.get(pluginUuid) || {} },
    })
    this.replayPendingContexts(pluginUuid)
    this.log("REGISTRATION", `Registration complete for plugin: ${pluginUuid}`)
  }

  registerInspector(socket, message) {
    const meta = this.connectionMeta.get(socket)
    if (!meta) return

    meta.type = "inspector"
    meta.inspectorUuid = message.uuid
    this.inspectorSockets.add(socket)

    const pluginUuidFromAction = this.resolvePluginForAction(message?.action)
    if (pluginUuidFromAction) {
      meta.pluginUuid = pluginUuidFromAction
    }

    this.log("HOST", `Property inspector registered (${meta.inspectorUuid})`)
    this.send(socket, {
      event: "didReceiveGlobalSettings",
      payload: { settings: this.globalSettings.get(meta.pluginUuid) || {} },
    })

    if (typeof message?.context === "string") {
      // Resolve the actual button context - some SDKs send the inspector UUID (with -pi suffix)
      // as the context instead of the actual button context
      let resolvedContext = message.context
      if (!this.contextRegistry.has(resolvedContext) && resolvedContext.endsWith("-pi")) {
        const strippedContext = resolvedContext.slice(0, -3)
        if (this.contextRegistry.has(strippedContext)) {
          resolvedContext = strippedContext
          this.log("HOST", `Resolved inspector registration context ${message.context} -> ${resolvedContext}`)
        }
      }
      
      // Store the resolved context for use in handleInspectorEvent
      meta.context = resolvedContext
      this.inspectorByContext.set(resolvedContext, socket)
      
      // Get coordinates from contextRegistry if available
      const entry = this.contextRegistry.get(resolvedContext)
      const coordinates = entry?.coordinates || { column: 0, row: 0 }
      
      this.send(socket, {
        event: "didReceiveSettings",
        action: message.action,
        context: resolvedContext,
        device: DEFAULT_DEVICE_ID,
        payload: {
          settings: this.contextSettings.get(resolvedContext) || {},
          coordinates,
          isInMultiAction: false,
        },
      })
      if (meta.pluginUuid) {
        this.send(meta.pluginUuid, {
          event: "propertyInspectorDidAppear",
          action: message.action,
          context: resolvedContext,
          device: DEFAULT_DEVICE_ID,
        })
      }
    }
  }

  resolvePluginForAction(actionUuid) {
    if (!actionUuid) return null
    return this.actionLookup.get(actionUuid) || null
  }

  handlePluginEvent(meta, message) {
    const pluginUuid = meta.pluginUuid
    const rawContext = message.context
    
    // Resolve context - handle case where context might have -pi suffix
    // (some plugins might incorrectly use the inspector context)
    let context = rawContext
    if (rawContext && !this.contextRegistry.has(rawContext) && rawContext.endsWith("-pi")) {
      const strippedContext = rawContext.slice(0, -3)
      if (this.contextRegistry.has(strippedContext)) {
        context = strippedContext
        this.log("PLUGINS", `Resolved plugin context ${rawContext} -> ${context}`)
      }
    }
    
    switch (message.event) {
      case "setSettings":
        this.contextSettings.set(context, message.payload || {})
        // Keep contextRegistry entry in sync so getState() returns correct settings
        if (this.contextRegistry.has(context)) {
          this.contextRegistry.get(context).settings = message.payload || {}
        }
        this.log("PLUGINS", `setSettings for ${context}`)
        this.saveState()
        // Update the plugin's last sent cache (plugin just set these, don't send back)
        this.lastSentSettingsToPlugin.set(context, JSON.stringify(message.payload || {}))
        // Only notify the inspector (if open), NOT the plugin that just set the settings
        // This prevents an infinite loop where plugin sets settings -> host sends didReceiveSettings -> plugin sets settings again
        this.sendSettingsToInspector(context)
        // Notify renderer so it can refresh host state for property inspector
        this.notifySettingsChange(context)
        break
      case "getSettings":
        this.log("PLUGINS", `getSettings from ${context}`)
        this.sendSettingsUpdate(pluginUuid, context)
        break
      case "setGlobalSettings":
        this.globalSettings.set(pluginUuid, message.payload || {})
        this.log("PLUGINS", `setGlobalSettings (${pluginUuid})`)
        this.saveState()
        this.broadcastGlobalSettings(pluginUuid)
        break
      case "getGlobalSettings":
        this.log("PLUGINS", `getGlobalSettings (${pluginUuid})`)
        this.send(pluginUuid, {
          event: "didReceiveGlobalSettings",
          payload: { settings: this.globalSettings.get(pluginUuid) || {} },
        })
        break
      case "setTitle":
        this.emitHostVisualEvent("setTitle", context, message.payload)
        break
      case "setImage":
        this.emitHostVisualEvent("setImage", context, message.payload)
        break
      case "setState":
        if (this.contextRegistry.has(context)) {
          this.contextRegistry.get(context).state = message.payload?.state ?? 0
        }
        this.emitHostVisualEvent("setState", context, message.payload)
        break
      case "showAlert":
        this.emitHostVisualEvent("showAlert", context, {})
        break
      case "showOk":
        this.emitHostVisualEvent("showOk", context, {})
        break
      case "sendToPropertyInspector":
        this.forwardToInspector(context, message)
        break
      case "openUrl":
        this.log("HOST", `openUrl request: ${message.payload?.url}`)
        if (message.payload?.url) {
          shell.openExternal(message.payload.url)
        }
        break
      case "logMessage":
        this.log("PLUGIN-LOG", message.payload?.message || "")
        break
      default:
        this.log("HOST", `Unhandled plugin event ${message.event}`)
    }
  }

  handleInspectorEvent(meta, message) {
    // Some Property Inspector SDKs incorrectly use the inspector UUID (which has -pi suffix)
    // as the context for setSettings. We need to resolve the actual button context.
    const rawContext = message.context
    // Try to find the actual context - first check if rawContext exists in registry,
    // if not, try stripping the -pi suffix
    let resolvedContext = rawContext
    if (rawContext && !this.contextRegistry.has(rawContext) && rawContext.endsWith("-pi")) {
      const strippedContext = rawContext.slice(0, -3)
      if (this.contextRegistry.has(strippedContext)) {
        resolvedContext = strippedContext
        this.log("HOST", `Resolved inspector context ${rawContext} -> ${resolvedContext}`)
      }
    }
    // Also check meta.context which might have the correct context from registration
    if (!this.contextRegistry.has(resolvedContext) && meta.context && this.contextRegistry.has(meta.context)) {
      resolvedContext = meta.context
    }
    
    // Associate this inspector socket with the context if not already done
    // This is needed because the SDK spec doesn't require context in registration message,
    // but subsequent calls (getSettings, setSettings) need to find the inspector socket
    if (resolvedContext && this.contextRegistry.has(resolvedContext)) {
      const currentInspector = this.inspectorByContext.get(resolvedContext)
      if (!currentInspector || currentInspector !== meta.socket) {
        this.inspectorByContext.set(resolvedContext, meta.socket)
        meta.context = resolvedContext
        this.log("HOST", `Associated inspector socket with context: ${resolvedContext}`)
      }
      // Also ensure meta.pluginUuid is set for future messages
      if (!meta.pluginUuid) {
        const entryPluginUuid = this.contextRegistry.get(resolvedContext)?.pluginUuid
        if (entryPluginUuid) {
          meta.pluginUuid = entryPluginUuid
        }
      }
    }
    
    const pluginUuid =
      meta.pluginUuid || this.contextRegistry.get(resolvedContext)?.pluginUuid
    switch (message.event) {
      case "setSettings":
        this.log("HOST", `Inspector setSettings for context: ${resolvedContext}`)
        this.contextSettings.set(resolvedContext, message.payload || {})
        // Keep contextRegistry entry in sync so getState() returns correct settings
        if (this.contextRegistry.has(resolvedContext)) {
          this.contextRegistry.get(resolvedContext).settings = message.payload || {}
        }
        this.saveState()
        // When inspector sets settings, notify the plugin (it needs to know)
        // The inspector already knows the settings it just sent
        if (pluginUuid) {
          const entry = this.contextRegistry.get(resolvedContext)
          if (entry) {
            const settings = this.contextSettings.get(resolvedContext) || {}
            const settingsJson = JSON.stringify(settings)
            
            // Only send if settings have changed from what we last sent to plugin
            const lastSent = this.lastSentSettingsToPlugin.get(resolvedContext)
            if (lastSent !== settingsJson) {
              this.send(pluginUuid, {
                action: entry.action,
                event: "didReceiveSettings",
                context: resolvedContext,
                device: entry.device,
                payload: {
                  settings,
                  coordinates: entry.coordinates,
                  isInMultiAction: false,
                },
              })
              this.lastSentSettingsToPlugin.set(resolvedContext, settingsJson)
              this.log("HOST", `Sent didReceiveSettings to plugin ${pluginUuid} for context: ${resolvedContext}`)
            }
          }
        } else {
          this.log("HOST", `Warning: Cannot notify plugin - pluginUuid not resolved for context: ${resolvedContext}`)
        }
        // Update the inspector's last sent cache too (inspector just sent these)
        this.lastSentSettingsToInspector.set(resolvedContext, JSON.stringify(message.payload || {}))
        // Notify renderer so it can refresh host state for property inspector
        this.notifySettingsChange(resolvedContext)
        break
      case "getSettings":
        // Send settings directly to the requesting inspector
        // This ensures the inspector gets a response even if pluginUuid isn't resolved
        {
          const entry = this.contextRegistry.get(resolvedContext)
          if (entry) {
            const settings = this.contextSettings.get(resolvedContext) || {}
            this.send(meta.socket, {
              action: entry.action,
              event: "didReceiveSettings",
              context: resolvedContext,
              device: entry.device,
              payload: {
                settings,
                coordinates: entry.coordinates,
                isInMultiAction: false,
              },
            })
            this.lastSentSettingsToInspector.set(resolvedContext, JSON.stringify(settings))
            this.log("HOST", `Sent settings to inspector for context: ${resolvedContext}`)
          } else {
            this.log("HOST", `getSettings: context ${resolvedContext} not found in registry`)
          }
        }
        break
      case "setGlobalSettings":
        if (pluginUuid) {
          this.globalSettings.set(pluginUuid, message.payload || {})
          this.saveState()
          this.broadcastGlobalSettings(pluginUuid)
        }
        break
      case "getGlobalSettings":
        if (pluginUuid) {
          this.send(meta.socket, {
            event: "didReceiveGlobalSettings",
            payload: { settings: this.globalSettings.get(pluginUuid) || {} },
          })
        }
        break
      case "sendToPlugin":
        this.forwardToPlugin(resolvedContext, message)
        break
      case "openUrl":
        if (message.payload?.url) {
          shell.openExternal(message.payload.url)
        }
        break
      case "logMessage":
        this.log("INSPECTOR-LOG", message.payload?.message || "")
        break
      default:
        this.log("HOST", `Unhandled inspector event ${message.event}`)
    }
  }

  sendSettingsUpdate(pluginUuid, context, includePayload = false) {
    if (!pluginUuid) return
    const entry = this.contextRegistry.get(context)
    if (!entry) {
      this.log("HOST", `sendSettingsUpdate missing context ${context}`)
      return
    }

    const settings = this.contextSettings.get(context) || {}
    const settingsJson = JSON.stringify(settings)

    const payloadMessage = {
      action: entry.action,
      event: "didReceiveSettings",
      context,
      device: entry.device,
      payload: {
        settings,
        coordinates: entry.coordinates,
        isInMultiAction: false,
      },
    }

    // Only send to plugin if settings have changed
    const lastSentToPlugin = this.lastSentSettingsToPlugin.get(context)
    if (lastSentToPlugin !== settingsJson) {
      this.send(pluginUuid, payloadMessage)
      this.lastSentSettingsToPlugin.set(context, settingsJson)
    }

    // Only send to inspector if settings have changed
    const inspector = this.inspectorByContext.get(context)
    if (inspector) {
      const lastSentToInspector = this.lastSentSettingsToInspector.get(context)
      if (lastSentToInspector !== settingsJson) {
        this.send(inspector, payloadMessage)
        this.lastSentSettingsToInspector.set(context, settingsJson)
      }
    }
  }

  /**
   * Send settings update only to the property inspector (not the plugin).
   * Used when the plugin itself called setSettings - it already knows what it set.
   */
  sendSettingsToInspector(context) {
    const entry = this.contextRegistry.get(context)
    if (!entry) {
      this.log("HOST", `sendSettingsToInspector: no entry for context ${context}`)
      return
    }

    const inspector = this.inspectorByContext.get(context)
    if (inspector) {
      const settings = this.contextSettings.get(context) || {}
      const settingsJson = JSON.stringify(settings)

      // Only send if settings have changed from what we last sent to inspector
      const lastSent = this.lastSentSettingsToInspector.get(context)
      if (lastSent === settingsJson) {
        this.log("HOST", `sendSettingsToInspector: skipped (unchanged) for context ${context}`)
        return // Skip, settings unchanged
      }

      const payloadMessage = {
        action: entry.action,
        event: "didReceiveSettings",
        context,
        device: entry.device,
        payload: {
          settings,
          coordinates: entry.coordinates,
          isInMultiAction: false,
        },
      }
      this.send(inspector, payloadMessage)
      this.lastSentSettingsToInspector.set(context, settingsJson)
      this.log("HOST", `Sent didReceiveSettings to inspector for context: ${context}`)
    } else {
      this.log("HOST", `sendSettingsToInspector: no inspector socket found for context ${context}`)
    }
  }

  emitHostVisualEvent(eventName, context, payload) {
    const entry = this.contextRegistry.get(context)
    if (!entry) return
    
    // Store visual state for later retrieval (when overlay opens)
    const currentVisual = this.visualState.get(context) || {}
    if (eventName === "setImage" && payload?.image) {
      currentVisual.image = payload.image
    } else if (eventName === "setTitle" && typeof payload?.title === "string") {
      currentVisual.title = payload.title
    } else if (eventName === "setState" && typeof payload?.state === "number") {
      currentVisual.state = payload.state
    }
    if (Object.keys(currentVisual).length > 0) {
      this.visualState.set(context, currentVisual)
    }
    
    // Notify renderer if available
    if (!this.notifyRenderer) return
    const message = {
      event: eventName,
      action: entry.action,
      context,
      device: entry.device,
      payload: payload || {},
    }
    this.notifyRenderer(message)
  }

  /**
   * Notify renderer that settings have changed for a context.
   * This allows the setup UI to refresh host state when settings are updated.
   */
  notifySettingsChange(context) {
    if (!this.notifyRenderer) return
    const entry = this.contextRegistry.get(context)
    if (!entry) return
    
    const settings = this.contextSettings.get(context) || {}
    this.notifyRenderer({
      event: "didReceiveSettings",
      action: entry.action,
      context,
      device: entry.device,
      payload: { settings },
    })
  }

  broadcastGlobalSettings(pluginUuid) {
    const payload = {
      event: "didReceiveGlobalSettings",
      payload: { settings: this.globalSettings.get(pluginUuid) || {} },
    }
    const pluginSocket = this.pluginSockets.get(pluginUuid)
    if (pluginSocket) {
      this.send(pluginSocket, payload)
    }

    for (const socket of this.inspectorSockets) {
      const meta = this.connectionMeta.get(socket)
      if (meta?.pluginUuid === pluginUuid) {
        this.send(socket, payload)
      }
    }
  }

  forwardToInspector(context, message) {
    const socket = this.inspectorByContext.get(context)
    if (socket) {
      this.logComm("FWD", `context:${context} host->inspector`, {
        event: message.event,
        action: this.contextRegistry.get(context)?.action,
      })
      this.send(socket, {
        ...message,
        action: this.contextRegistry.get(context)?.action,
        device: this.contextRegistry.get(context)?.device,
      })
    }
  }

  forwardToPlugin(context, message) {
    const entry = this.contextRegistry.get(context)

    if (entry) {
      // Normal path – we know exactly which plugin/context this belongs to
      this.logComm("FWD", `context:${context} inspector->plugin:${entry.pluginUuid}`, {
        event: message.event,
        action: entry.action,
      })
      this.log(
        "INSPECTOR",
        `Forwarding sendToPlugin for context ${context} to plugin ${entry.pluginUuid}`,
      )
      this.send(entry.pluginUuid, {
        ...message,
        action: entry.action,
        device: entry.device,
      })
      return
    }

    // Fallback: context is unknown (for example, if the inspector sent its own
    // UUID instead of the button context). In the real Stream Deck protocol
    // sendToPlugin does not strictly require a known context, so try to route
    // based on the action UUID instead of dropping the message on the floor.
    const pluginUuid = this.resolvePluginForAction(message.action)
    if (pluginUuid) {
      this.logComm(
        "FWD",
        `context:${context || "unknown"} inspector->plugin:${pluginUuid} (by action)`,
        { event: message.event, action: message.action },
      )
      this.log(
        "INSPECTOR",
        `forwardToPlugin: context ${context} not found, routing by action ${message.action} to plugin ${pluginUuid}`,
      )
      this.send(pluginUuid, message)
    } else {
      this.log(
        "HOST",
        `forwardToPlugin: unable to resolve plugin for sendToPlugin (context=${context}, action=${message.action})`,
      )
    }
  }

  emitWillAppear(entry) {
    const socket = this.pluginSockets.get(entry.pluginUuid)
    // Always use contextSettings for the latest settings, not the potentially stale entry.settings
    const currentSettings = this.contextSettings.get(entry.context) || {}
    const message = {
      event: "willAppear",
      action: entry.action,
      context: entry.context,
      device: entry.device,
      payload: {
        coordinates: entry.coordinates,
        settings: currentSettings,
        controller: entry.controller,
        state: entry.state,
        isInMultiAction: false,
      },
    }

    if (socket && socket.readyState === socket.OPEN) {
      this.send(socket, message)
      entry.pendingWillAppear = false
      // Note: willAppear already includes settings in payload, so we don't need
      // to send a separate didReceiveSettings. Some plugins (like ScriptDeck)
      // register handlers for every event and sending duplicate settings causes issues.
    } else {
      entry.pendingWillAppear = true
    }
  }

  emitWillDisappear(context) {
    const entry = this.contextRegistry.get(context)
    if (!entry) return

    const socket = this.pluginSockets.get(entry.pluginUuid)
    const currentSettings = this.contextSettings.get(entry.context) || {}
    const message = {
      event: "willDisappear",
      action: entry.action,
      context: entry.context,
      device: entry.device,
      payload: {
        coordinates: entry.coordinates,
        settings: currentSettings,
        controller: entry.controller,
        state: entry.state,
        isInMultiAction: false,
      },
    }

    if (socket && socket.readyState === socket.OPEN) {
      this.send(socket, message)
    }
  }

  createContext(
    pluginUuid,
    actionUuid,
    coordinates = { column: 0, row: 0 },
    preferredContext,
  ) {
    const context =
      preferredContext && !this.contextRegistry.has(preferredContext)
        ? preferredContext
        : safeUUID()
    const entry = {
      context,
      pluginUuid,
      action: actionUuid,
      device: DEFAULT_DEVICE_ID,
      coordinates,
      controller: "Keypad",
      state: 0,
      settings: this.contextSettings.get(context) || {},
      pendingWillAppear: true,
    }
    this.contextRegistry.set(context, entry)
    this.emitWillAppear(entry)
    return context
  }

  sendToContext(context, eventName, payload = {}) {
    const entry = this.contextRegistry.get(context)
    if (!entry) return
    
    // For key events (keyDown, keyUp), include settings and coordinates as per Stream Deck SDK
    const isKeyEvent = eventName === "keyDown" || eventName === "keyUp"
    const fullPayload = isKeyEvent
      ? {
          settings: this.contextSettings.get(context) || {},
          coordinates: entry.coordinates,
          state: entry.state ?? 0,
          userDesiredState: 0,
          isInMultiAction: false,
          ...payload,
        }
      : payload

    this.send(entry.pluginUuid, {
      event: eventName,
      action: entry.action,
      context,
      device: entry.device,
      payload: fullPayload,
    })
  }

  replayPendingContexts(pluginUuid) {
    // Delay willAppear events to give the plugin time to initialize its event handlers.
    // On real Stream Deck hardware, willAppear only fires when the user navigates to a page,
    // giving plugins time to set up. Here we simulate that delay after registration.
    setTimeout(() => {
      this.contextRegistry.forEach((entry) => {
        if (entry.pluginUuid === pluginUuid && entry.pendingWillAppear) {
          this.emitWillAppear(entry)
        }
      })
    }, 1000)
  }

  send(recipient, message) {
    const socket = typeof recipient === "string" ? this.pluginSockets.get(recipient) : recipient
    if (!socket || socket.readyState !== socket.OPEN) {
      return
    }
    try {
      // Log every outgoing WebSocket message
      let targetType = "unknown"
      let targetId = "unregistered"
      if (typeof recipient === "string") {
        targetType = "plugin"
        targetId = recipient
      } else {
        const meta = this.connectionMeta.get(recipient)
        if (meta) {
          targetType = meta.type || "unknown"
          targetId =
            meta.type === "plugin"
              ? meta.pluginUuid || "unregistered"
              : meta.type === "inspector"
                ? meta.inspectorUuid || "unregistered"
                : "unregistered"
        }
      }
      this.logComm("SEND", `${targetType}:${targetId}`, {
        event: message.event,
        context: message.context,
        action: message.action,
      })

      socket.send(JSON.stringify(message))
    } catch (error) {
      this.log("HOST", `Failed to send message: ${error.message}`)
    }
  }

  cleanupConnection(socket) {
    const meta = this.connectionMeta.get(socket)
    if (!meta) return

    if (meta.type === "plugin" && meta.pluginUuid) {
      this.pluginSockets.delete(meta.pluginUuid)
      this.log("HOST", `Plugin socket disconnected: ${meta.pluginUuid}`)
    }
    if (meta.type === "inspector") {
      this.inspectorSockets.delete(socket)
      for (const [context, inspector] of this.inspectorByContext.entries()) {
        if (inspector === socket) {
          this.inspectorByContext.delete(context)
        }
      }
      if (meta.context && meta.pluginUuid) {
        this.send(meta.pluginUuid, {
          event: "propertyInspectorDidDisappear",
          action: this.contextRegistry.get(meta.context)?.action,
          context: meta.context,
          device: DEFAULT_DEVICE_ID,
        })
      }
      this.log("HOST", "Inspector disconnected")
    }

    this.connectionMeta.delete(socket)
  }

  loadState() {
    if (!this.stateFile) return
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, "utf-8")
        const parsed = JSON.parse(raw)
        Object.entries(parsed.globalSettings || {}).forEach(([key, value]) => {
          this.globalSettings.set(key, value)
        })
        
        // Load context settings with migration for -pi suffix issue
        // Some Property Inspector SDKs incorrectly saved settings with -pi suffix on context
        const contextSettings = parsed.contextSettings || {}
        let needsSave = false
        
        Object.entries(contextSettings).forEach(([key, value]) => {
          // Check if this is a -pi suffixed key with non-empty settings
          if (key.endsWith("-pi") && value && Object.keys(value).length > 0) {
            const baseContext = key.slice(0, -3)
            const baseSettings = contextSettings[baseContext]
            
            // If the base context has empty settings but -pi has settings, migrate them
            if (!baseSettings || Object.keys(baseSettings).length === 0) {
              this.contextSettings.set(baseContext, value)
              this.log("HOST", `Migrated settings from ${key} to ${baseContext}`)
              needsSave = true
            }
          }
          // Always load the original key too (for backwards compatibility)
          this.contextSettings.set(key, value)
        })
        
        // Save the migrated state if needed
        if (needsSave) {
          // Defer save to avoid issues during initialization
          setTimeout(() => this.saveState(), 1000)
        }
      }
    } catch (error) {
      this.log("HOST", `loadState failed: ${error.message}`)
    }
  }

  saveState() {
    if (!this.stateFile) return
    try {
      const payload = {
        globalSettings: Object.fromEntries(this.globalSettings),
        contextSettings: Object.fromEntries(this.contextSettings),
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(payload), "utf-8")
    } catch (error) {
      this.log("HOST", `saveState failed: ${error.message}`)
    }
  }

  startApplicationWatcher() {
    if (process.platform !== "win32") return
    if (this.appMonitorInterval) return
    this.appMonitorInterval = setInterval(() => this.checkApplications(), 5000)
  }

  stopApplicationWatcher() {
    if (this.appMonitorInterval) {
      clearInterval(this.appMonitorInterval)
      this.appMonitorInterval = null
    }
  }

  checkApplications() {
    const allApps = new Set()
    for (const apps of this.monitoredApps.values()) {
      apps.forEach((app) => allApps.add(app))
    }
    if (allApps.size === 0) return

    exec("tasklist /NH /FO CSV", (error, stdout) => {
      if (error) return
      const running = new Set()
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const match = line.match(/^"([^"]+)"/)
          if (match) {
            running.add(match[1].toLowerCase())
          }
        })

      for (const [pluginUuid, apps] of this.monitoredApps.entries()) {
        let state = this.monitoredState.get(pluginUuid)
        if (!state) {
          state = new Map()
          this.monitoredState.set(pluginUuid, state)
        }
        apps.forEach((appName) => {
          const normalized = String(appName).toLowerCase()
          const isRunning = running.has(normalized)
          const previous = state.get(normalized) || false
          if (isRunning && !previous) {
            this.send(pluginUuid, {
              event: "applicationDidLaunch",
              payload: { application: normalized },
            })
          } else if (!isRunning && previous) {
            this.send(pluginUuid, {
              event: "applicationDidTerminate",
              payload: { application: normalized },
            })
          }
          state.set(normalized, isRunning)
        })
      }
    })
  }

  getState() {
    const pluginStates = this.plugins.map((plugin) => ({
      uuid: plugin.uuid,
      name: plugin.name,
      version: plugin.version,
      icon: plugin.icon,
      connected: this.pluginSockets.has(plugin.uuid),
      propertyInspectorPath: plugin.propertyInspectorPath,
      actions: plugin.actions.map((action) => ({
        uuid: action.uuid,
        name: action.name,
        tooltip: action.tooltip,
        propertyInspectorPath: action.propertyInspectorPath || plugin.propertyInspectorPath,
        icon: action.icon || plugin.icon,
      })),
    }))

    return {
      port: this.port,
      plugins: pluginStates,
      contexts: Array.from(this.contextRegistry.values()),
      logs: this.logs.slice(-200),
      iconLibraries: this.iconLibraries || [],
      language: this.language, // Configured language for plugin i18n
    }
  }

  /**
   * Get current visual state for all contexts.
   * Returns a map of context -> { image?, title?, state? }
   * This allows the overlay to apply plugin-set visuals when it opens.
   */
  getVisualState() {
    return Object.fromEntries(this.visualState)
  }

  log(source, message) {
    const line = `${new Date().toISOString()} [${source}] ${message}`
    this.logs.push(line)
    this.logger(source, message)
  }
}

module.exports = { StreamDeckHost }

