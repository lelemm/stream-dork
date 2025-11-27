const fs = require("fs")
const path = require("path")

// Common image extensions for icon packs
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

/**
 * Loads an icon file and converts it to a base64 data URL.
 */
function loadIconAsDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null

  try {
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || "application/octet-stream"
    const fileData = fs.readFileSync(filePath)
    const base64 = fileData.toString("base64")
    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    return null
  }
}

/**
 * Resolves an icon path by trying common image extensions if the file doesn't exist.
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

  return null
}

/**
 * Loads the manifest.json for an icon pack
 */
function loadManifest(iconPackDir) {
  const manifestPath = path.join(iconPackDir, "manifest.json")
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

/**
 * Loads the icons.json file for an icon pack
 */
function loadIconsJson(iconPackDir, imagesFolder) {
  const iconsJsonPath = path.join(iconPackDir, "icons.json")
  if (!fs.existsSync(iconsJsonPath)) {
    // If no icons.json, try to auto-discover icons from the images folder
    return autoDiscoverIcons(iconPackDir, imagesFolder)
  }

  try {
    const iconsData = JSON.parse(fs.readFileSync(iconsJsonPath, "utf-8"))
    if (!Array.isArray(iconsData)) {
      return { error: "icons.json must be an array" }
    }
    return { icons: iconsData }
  } catch (error) {
    return { error: `failed to parse icons.json: ${error.message}` }
  }
}

/**
 * Auto-discovers icons from the images folder if icons.json is not present
 */
function autoDiscoverIcons(iconPackDir, imagesFolder) {
  const imagesFolderPath = path.join(iconPackDir, imagesFolder || "icons")
  if (!fs.existsSync(imagesFolderPath)) {
    return { icons: [] }
  }

  try {
    const files = fs.readdirSync(imagesFolderPath)
    const icons = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase()
        return IMAGE_EXTENSIONS.includes(ext)
      })
      .map((file) => {
        const name = path.basename(file, path.extname(file))
        return {
          path: file,
          name: name,
          tags: [],
        }
      })

    return { icons }
  } catch (error) {
    return { error: `failed to read images folder: ${error.message}` }
  }
}

/**
 * Discovers all icon packs in the given root directory.
 * Icon packs follow the Stream Deck icon pack format:
 * - manifest.json with Name, Version, Description, Author, Icon, Images
 * - icons.json with array of {path, name, tags}
 * - icons folder with actual icon files
 */
function discoverIconLibraries(rootPath, logger = () => {}) {
  logger("DISCOVERY", `Starting icon library discovery in: ${rootPath}`)

  if (!fs.existsSync(rootPath)) {
    logger("DISCOVERY", `Icon library root path does not exist: ${rootPath}`)
    return { iconLibraries: [], errors: [] }
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  logger("DISCOVERY", `Found ${entries.length} entries in icon library directory`)

  const result = []
  const errors = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      logger("DISCOVERY", `Skipping non-directory entry: ${entry.name}`)
      continue
    }

    // Icon packs should end with .sdIconPack
    if (!entry.name.endsWith(".sdIconPack")) {
      logger("DISCOVERY", `Skipping non-icon-pack directory: ${entry.name}`)
      continue
    }

    const iconPackDir = path.join(rootPath, entry.name)
    logger("DISCOVERY", `Discovering icon pack in folder: ${entry.name}`)

    const { manifest, error: manifestError } = loadManifest(iconPackDir)
    if (manifestError) {
      const errorMsg = `${entry.name}: ${manifestError}`
      logger("DISCOVERY", `Error loading manifest - ${errorMsg}`)
      errors.push({ folder: entry.name, reason: manifestError })
      continue
    }

    // Validate required fields
    if (!manifest.Name) {
      const errorMsg = `${entry.name}: manifest missing required field (Name)`
      logger("DISCOVERY", `Error - ${errorMsg}`)
      errors.push({ folder: entry.name, reason: "manifest missing required field (Name)" })
      continue
    }

    const imagesFolder = manifest.Images || "icons"
    const { icons, error: iconsError } = loadIconsJson(iconPackDir, imagesFolder)

    if (iconsError) {
      const errorMsg = `${entry.name}: ${iconsError}`
      logger("DISCOVERY", `Error loading icons - ${errorMsg}`)
      errors.push({ folder: entry.name, reason: iconsError })
      continue
    }

    // Resolve icon pack's display icon
    const packIconPath = resolveIconPath(iconPackDir, manifest.Icon || "icon")
    const packIcon = loadIconAsDataUrl(packIconPath)

    // Load all icons as data URLs
    const imagesFolderPath = path.join(iconPackDir, imagesFolder)
    const loadedIcons = icons.map((iconEntry) => {
      const iconPath = path.join(imagesFolderPath, iconEntry.path)
      const dataUrl = loadIconAsDataUrl(iconPath)
      return {
        id: `${entry.name}-${iconEntry.path}`,
        path: iconEntry.path,
        name: iconEntry.name || path.basename(iconEntry.path, path.extname(iconEntry.path)),
        tags: iconEntry.tags || [],
        dataUrl,
      }
    }).filter((icon) => icon.dataUrl !== null) // Only include icons we could load

    logger(
      "DISCOVERY",
      `Successfully discovered icon pack: ${manifest.Name} (${loadedIcons.length} icons)`
    )

    const iconPackInfo = {
      id: entry.name,
      folder: entry.name,
      name: manifest.Name,
      version: manifest.Version || "1.0",
      description: manifest.Description || "",
      author: manifest.Author || "",
      url: manifest.URL || "",
      icon: packIcon,
      license: manifest.License || "",
      icons: loadedIcons,
    }

    result.push(iconPackInfo)
  }

  logger(
    "DISCOVERY",
    `Icon library discovery completed: ${result.length} icon packs discovered, ${errors.length} errors`
  )
  return { iconLibraries: result, errors }
}

module.exports = {
  discoverIconLibraries,
  loadIconAsDataUrl,
  resolveIconPath,
}

