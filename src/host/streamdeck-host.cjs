const { WebSocketServer } = require("ws")
const { shell } = require("electron")
const crypto = require("crypto")
const { exec, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

const DEFAULT_DEVICE_ID = "fake-device-0"

function safeUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

class StreamDeckHost {
  constructor({ plugins = [], logger = () => {}, notifyRenderer = () => {}, stateFile }) {
    this.plugins = plugins
    this.logger = logger
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
        language: "en",
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
          name: "Fake Stream Deck",
          size: { columns: 5, rows: 3 },
          type: 0
        }
      ]
    }

    const args = [
      "-port", String(this.port),
      "-pluginUUID", plugin.uuid,
      "-registerEvent", "registerPlugin",
      "-info", JSON.stringify(info)
    ]

    this.log("HOST", `Launching plugin: ${plugin.name} (${plugin.codePath})`)
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
        lines.forEach((line) => this.log("PLUGIN-STDOUT", `[${plugin.name}] ${line}`))
      })

      proc.stderr.on("data", (data) => {
        const lines = data.toString().split("\n").filter(Boolean)
        lines.forEach((line) => this.log("PLUGIN-STDERR", `[${plugin.name}] ${line}`))
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
      this.inspectorByContext.set(message.context, socket)
      meta.context = message.context
      this.send(socket, {
        event: "didReceiveSettings",
        action: message.action,
        context: message.context,
        device: DEFAULT_DEVICE_ID,
        payload: {
          settings: this.contextSettings.get(message.context) || {},
          coordinates: { column: 0, row: 0 },
          isInMultiAction: false,
        },
      })
      if (meta.pluginUuid) {
        this.send(meta.pluginUuid, {
          event: "propertyInspectorDidAppear",
          action: message.action,
          context: message.context,
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
    const context = message.context
    switch (message.event) {
      case "setSettings":
        this.contextSettings.set(context, message.payload || {})
        this.log("PLUGINS", `setSettings for ${context}`)
        this.sendSettingsUpdate(pluginUuid, context, true)
        break
      case "getSettings":
        this.log("PLUGINS", `getSettings from ${context}`)
        this.sendSettingsUpdate(pluginUuid, context)
        break
      case "setGlobalSettings":
        this.globalSettings.set(pluginUuid, message.payload || {})
        this.log("PLUGINS", `setGlobalSettings (${pluginUuid})`)
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
    const pluginUuid =
      meta.pluginUuid || this.contextRegistry.get(message.context)?.pluginUuid
    switch (message.event) {
      case "setSettings":
        this.contextSettings.set(message.context, message.payload || {})
        this.sendSettingsUpdate(pluginUuid, message.context, true)
        break
      case "getSettings":
        this.sendSettingsUpdate(pluginUuid, message.context)
        break
      case "setGlobalSettings":
        if (pluginUuid) {
          this.globalSettings.set(pluginUuid, message.payload || {})
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
        this.forwardToPlugin(message.context, message)
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

    const payloadMessage = {
      action: entry.action,
      event: "didReceiveSettings",
      context,
      device: entry.device,
      payload: {
        settings: this.contextSettings.get(context) || {},
        coordinates: entry.coordinates,
        isInMultiAction: false,
      },
    }
    this.send(pluginUuid, payloadMessage)

    const inspector = this.inspectorByContext.get(context)
    if (inspector) {
      this.send(inspector, payloadMessage)
    }
  }

  emitHostVisualEvent(eventName, context, payload) {
    if (!this.notifyRenderer) return
    const entry = this.contextRegistry.get(context)
    if (!entry) return
    const message = {
      event: eventName,
      action: entry.action,
      context,
      device: entry.device,
      payload: payload || {},
    }
    this.notifyRenderer(message)
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
    const message = {
      event: "willAppear",
      action: entry.action,
      context: entry.context,
      device: entry.device,
      payload: {
        coordinates: entry.coordinates,
        settings: entry.settings,
        controller: entry.controller,
        state: entry.state,
        isInMultiAction: false,
      },
    }

    if (socket && socket.readyState === socket.OPEN) {
      this.send(socket, message)
      entry.pendingWillAppear = false
      this.sendSettingsUpdate(entry.pluginUuid, entry.context)
    } else {
      entry.pendingWillAppear = true
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
    this.send(entry.pluginUuid, {
      event: eventName,
      action: entry.action,
      context,
      device: entry.device,
      payload,
    })
  }

  replayPendingContexts(pluginUuid) {
    this.contextRegistry.forEach((entry) => {
      if (entry.pluginUuid === pluginUuid && entry.pendingWillAppear) {
        this.emitWillAppear(entry)
      }
    })
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
        Object.entries(parsed.contextSettings || {}).forEach(([key, value]) => {
          this.contextSettings.set(key, value)
        })
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
    }
  }

  log(source, message) {
    const line = `${new Date().toISOString()} [${source}] ${message}`
    this.logs.push(line)
    this.logger(source, message)
  }
}

module.exports = { StreamDeckHost }

