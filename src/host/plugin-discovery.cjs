const fs = require("fs")
const path = require("path")

// Common image extensions used by Stream Deck plugins
const IMAGE_EXTENSIONS = [".png", ".svg", ".gif", ".jpg", ".jpeg", ".webp"]

// MIME types for image extensions
const MIME_TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

function normalizePath(base, value) {
  if (!value) return null
  if (path.isAbsolute(value)) return value
  return path.join(base, value)
}

/**
 * Resolves an icon path by trying common image extensions.
 * Stream Deck manifests specify icons without extensions (e.g., "assets/icon")
 * and the actual file might be "assets/icon.png", "assets/icon.svg", etc.
 * Returns the resolved file path or null if not found.
 */
function resolveIconPath(base, value) {
  if (!value) return null
  
  const basePath = path.isAbsolute(value) ? value : path.join(base, value)
  
  // First check if the path already has an extension and exists
  if (fs.existsSync(basePath)) {
    return basePath
  }
  
  // Try common image extensions
  for (const ext of IMAGE_EXTENSIONS) {
    const pathWithExt = basePath + ext
    if (fs.existsSync(pathWithExt)) {
      return pathWithExt
    }
  }
  
  // Also try @2x variants (high DPI icons)
  for (const ext of IMAGE_EXTENSIONS) {
    const pathWithExt = basePath + "@2x" + ext
    if (fs.existsSync(pathWithExt)) {
      return pathWithExt
    }
  }
  
  return null
}

/**
 * Loads an icon file and converts it to a base64 data URL.
 * This is necessary because Electron's renderer process cannot load file:// URLs
 * for security reasons.
 */
function loadIconAsDataUrl(base, value) {
  const filePath = resolveIconPath(base, value)
  if (!filePath) return null
  
  try {
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || "application/octet-stream"
    const fileData = fs.readFileSync(filePath)
    const base64 = fileData.toString("base64")
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    // If we can't read the file, return null
    return null
  }
}

function loadManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    return { error: "manifest.json missing" }
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    return { manifest }
  } catch (error) {
    return { error: `failed to parse manifest: ${error.message}` }
  }
}

function ensureArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function ensureWindowsReady(osEntries) {
  if (!Array.isArray(osEntries)) return false
  return osEntries.some((entry) => {
    const platform = String(entry?.Platform || "").toLowerCase()
    return platform === "windows"
  })
}

/**
 * Loads a localization file for the specified language from the plugin directory.
 * Per Stream Deck SDK, localization files are named like "en.json", "zh_CN.json", etc.
 * and placed next to manifest.json.
 * 
 * Structure:
 * {
 *   "Name": "Localized Plugin Name",
 *   "Description": "Localized Description",
 *   "Category": "Localized Category",
 *   "com.plugin.action.uuid": {
 *     "Name": "Localized Action Name",
 *     "Tooltip": "Localized Tooltip"
 *   },
 *   "Localization": { ... custom strings ... }
 * }
 */
function loadLocalization(pluginDir, language) {
  if (!language) return null
  
  const localizationPath = path.join(pluginDir, `${language}.json`)
  if (!fs.existsSync(localizationPath)) {
    return null
  }

  try {
    const localization = JSON.parse(fs.readFileSync(localizationPath, "utf-8"))
    return localization
  } catch (error) {
    // If we can't parse the localization file, return null and use manifest values
    return null
  }
}

/**
 * Applies localization to plugin info.
 * Overrides plugin name, description, and action names/tooltips with localized values.
 */
function applyLocalization(pluginInfo, localization) {
  if (!localization) return pluginInfo
  
  // Apply top-level localizations
  if (localization.Name) {
    pluginInfo.name = localization.Name
  }
  if (localization.Description) {
    pluginInfo.description = localization.Description
  }
  if (localization.Category) {
    pluginInfo.category = localization.Category
  }
  
  // Apply action-specific localizations
  // Each action can have its own localization keyed by UUID
  pluginInfo.actions = pluginInfo.actions.map((action) => {
    const actionLocalization = localization[action.uuid]
    if (actionLocalization) {
      return {
        ...action,
        name: actionLocalization.Name || action.name,
        tooltip: actionLocalization.Tooltip || action.tooltip,
      }
    }
    return action
  })
  
  return pluginInfo
}

function discoverPlugins(rootPath, logger = () => {}, language = "en") {
  logger("DISCOVERY", `Starting plugin discovery in: ${rootPath} (language: ${language})`)
  
  if (!fs.existsSync(rootPath)) {
    logger("DISCOVERY", `Plugin root path does not exist: ${rootPath}`)
    return { plugins: [], errors: [] }
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  logger("DISCOVERY", `Found ${entries.length} entries in plugin directory`)
  
  const result = []
  const errors = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      logger("DISCOVERY", `Skipping non-directory entry: ${entry.name}`)
      continue
    }

    const pluginRoot = path.join(rootPath, entry.name)
    logger("DISCOVERY", `Discovering plugin in folder: ${entry.name}`)
    
    const { manifest, error } = loadManifest(pluginRoot)
    if (error) {
      const errorMsg = `${entry.name}: ${error}`
      logger("DISCOVERY", `Error loading manifest - ${errorMsg}`)
      errors.push({ folder: entry.name, reason: error })
      continue
    }

    const actions = ensureArray(manifest.Actions)
    if (actions.length === 0) {
      const errorMsg = `${entry.name}: manifest missing Actions array`
      logger("DISCOVERY", `Error - ${errorMsg}`)
      errors.push({ folder: entry.name, reason: "manifest missing Actions array" })
      continue
    }

    if (!manifest.Name || !manifest.Version || !manifest.SDKVersion) {
      const errorMsg = `${entry.name}: manifest missing required fields (Name, Version, SDKVersion)`
      logger("DISCOVERY", `Error - ${errorMsg}`)
      errors.push({
        folder: entry.name,
        reason: "manifest missing required fields (Name, Version, SDKVersion)",
      })
      continue
    }

    if (!ensureWindowsReady(manifest.OS)) {
      const errorMsg = `${entry.name}: manifest does not declare Windows compatibility in OS entries`
      logger("DISCOVERY", `Error - ${errorMsg}`)
      errors.push({
        folder: entry.name,
        reason: "manifest does not declare Windows compatibility in OS entries",
      })
      continue
    }

    const applicationsToMonitor = manifest.ApplicationsToMonitor ?? {}
    const windowsMonitoring = ensureArray(applicationsToMonitor.windows)

    const pluginUuid = manifest.UUID || `plugin.${entry.name}`
    
    // Load localization file for the specified language
    const localization = loadLocalization(pluginRoot, language)
    if (localization) {
      logger("DISCOVERY", `Loaded ${language}.json localization for plugin: ${entry.name}`)
    }
    
    logger("DISCOVERY", `Successfully discovered plugin: ${manifest.Name} (UUID: ${pluginUuid}, Version: ${manifest.Version}, Actions: ${actions.length})`)

    let pluginInfo = {
      folder: entry.name,
      manifestPath: path.join(pluginRoot, "manifest.json"),
      name: manifest.Name,
      uuid: pluginUuid,
      description: manifest.Description || "",
      version: manifest.Version,
      sdkVersion: manifest.SDKVersion,
      author: manifest.Author || "",
      icon: loadIconAsDataUrl(pluginRoot, manifest.Icon),
      codePath: normalizePath(pluginRoot, manifest.CodePathWin || manifest.CodePath),
      propertyInspectorPath: normalizePath(pluginRoot, manifest.PropertyInspectorPath),
      os: ensureArray(manifest.OS),
      software: manifest.Software ?? null,
      nodejs: manifest.Nodejs ?? null,
      applicationsToMonitor: manifest.ApplicationsToMonitor ?? null,
      globalSettings: {},
      actions: actions.map((action, index) => ({
        name: action.Name || `Action ${index + 1}`,
        uuid: action.UUID || `${manifest.UUID}.action.${index}`,
        tooltip: action.Tooltip || "",
        icon: loadIconAsDataUrl(pluginRoot, action.Icon),
        controllers: ensureArray(action.Controllers),
        supportedInMultiActions: !!action.SupportedInMultiActions,
        propertyInspectorPath: normalizePath(pluginRoot, action.PropertyInspectorPath),
        userTitleEnabled: action.UserTitleEnabled !== false,
        states: ensureArray(action.States).map((state, idx) => ({
          image: loadIconAsDataUrl(pluginRoot, state.Image ?? action.Image),
          title: state.Title || "",
          fontSize: state.FontSize || "",
          fontStyle: state.FontStyle || "",
          titleAlignment: state.TitleAlignment || "",
          titleColor: state.TitleColor || "",
          showTitle: state.ShowTitle ?? true,
          fontUnderline: state.FontUnderline ?? false,
        })),
        settings: action.Settings ?? {},
      })),
      monitoredApps: windowsMonitoring.map((name) => String(name).toLowerCase()),
    }

    // Apply localization overrides if available
    pluginInfo = applyLocalization(pluginInfo, localization)

    result.push(pluginInfo)
  }

  logger("DISCOVERY", `Plugin discovery completed: ${result.length} plugins discovered, ${errors.length} errors`)
  return { plugins: result, errors }
}

module.exports = {
  discoverPlugins,
  loadManifest,
}

