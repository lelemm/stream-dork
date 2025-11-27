# Agent Instructions for Stream Dork

This document provides guidance for AI agents working on the Stream Dork codebase.

## Project Overview

Stream Dork is a virtual stream deck overlay for Windows built with Electron. It provides a button grid overlay that floats on top of applications and supports Stream Deck SDK-compatible plugins.

## Architecture

### Process Model

Stream Dork follows Electron's multi-process architecture:

1. **Main Process** (`src/main.cjs`) — Manages windows, system tray, global shortcuts, and the plugin host
2. **Renderer Processes** — React applications for UI:
   - `setup.tsx` — Configuration window with button grid editor
   - `overlay.tsx` — Transparent overlay with animated button grid
3. **Preload Script** (`src/preload.js`) — Exposes IPC APIs to renderers via `window.electron`

### Plugin Host

The `StreamDeckHost` class (`src/host/streamdeck-host.cjs`) implements a WebSocket server that:
- Launches plugin executables with SDK-compatible arguments
- Routes messages between plugins and Property Inspectors
- Manages contexts (button instances), settings, and global settings
- Persists state to `host-state.json`

### State Management

- **Main Process**: Configuration stored in `config.json` via Electron's `userData` path
- **Renderer**: Zustand store (`src/lib/deck-store.ts`) synced with main via IPC

## Key Files

| File | Purpose |
|------|---------|
| `src/main.cjs` | Electron main process entry point |
| `src/host/streamdeck-host.cjs` | WebSocket server for plugin communication |
| `src/host/plugin-discovery.cjs` | Loads and validates plugin manifests |
| `src/lib/deck-store.ts` | Zustand store for UI state |
| `src/pages/setup.tsx` | Setup window React app |
| `src/pages/overlay.tsx` | Overlay window React app |
| `src/components/overlay-button-grid.tsx` | Animated button grid with spiral animations |
| `src/components/property-inspector-panel.tsx` | Webview container for plugin Property Inspectors |
| `vite.config.js` | Vite build configuration |
| `electron-builder.yml` | Electron Builder packaging configuration |

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build renderer assets only
npm run build

# Build Windows executable (requires Windows or Wine)
npm run build-electron

# Build using Docker (cross-compile from Linux)
./build-docker.sh

# Lint the codebase
npm run lint
```

## Common Tasks

### Adding a New IPC Handler

1. Add the handler in `src/main.cjs`:
   ```javascript
   ipcMain.handle("my-new-handler", (event, args) => {
     // Implementation
     return result
   })
   ```

2. Expose it in `src/preload.js`:
   ```javascript
   myNewHandler: (args) => ipcRenderer.invoke("my-new-handler", args),
   ```

3. Add TypeScript types in `src/types/electron.d.ts`

### Adding a New Component

1. Create the component in `src/components/`
2. Use existing UI primitives from `src/components/ui/` (shadcn/ui)
3. Follow the existing patterns for styling with Tailwind

### Modifying Plugin Communication

The plugin host follows the Stream Deck SDK protocol. When modifying:
1. Check the [Stream Deck SDK documentation](https://docs.elgato.com/sdk)
2. Update `streamdeck-host.cjs` for host-side changes
3. Test with actual plugins to ensure compatibility

### Adding Configuration Options

1. Add the default value in `defaultConfig` in `src/main.cjs`
2. Add the field to the config type in `src/lib/types.ts`
3. Update the Zustand store if needed
4. Add UI controls in `src/components/grid-settings.tsx`

## Code Style Guidelines

- **Main Process**: CommonJS (`.cjs`) for Electron compatibility
- **Renderer**: TypeScript with React, ES modules
- **Formatting**: Follow existing patterns, 2-space indentation
- **Components**: Functional components with hooks
- **State**: Use Zustand for shared state, local `useState` for component state
- **Styling**: Tailwind CSS with `cn()` utility for conditional classes

## Testing

Currently there are no automated tests. When testing changes:

1. Run `npm run dev` to start the development server
2. Test both the setup window and overlay
3. Test with actual Stream Deck plugins if modifying the host
4. Check the debug panel (`--stream-dork-control-panel` flag) for plugin status

## Debugging Tips

### Logs Location

- Application logs: `%APPDATA%/stream-dork/logs/YYYY-MM-DD.txt`
- Communication logs: `%APPDATA%/stream-dork/comm_YYYY-MM-DD.txt`

### Remote Debugging

Property Inspectors can be debugged via Chrome DevTools Protocol:
- Navigate to `http://localhost:23519` in Chrome

### Common Issues

1. **Plugin not connecting**: Check that the plugin's `manifest.json` declares Windows in the `OS` array
2. **Property Inspector not loading**: Verify the path in the manifest and check DevTools for errors
3. **Overlay not appearing**: Check global shortcut conflicts with other applications

## Build & Packaging

### Development Build

`npm run dev` starts Vite in dev mode and Electron pointing to the dev server.

### Production Build

1. `npm run build` — Compiles React/Vite assets to `dist/`
2. `npm run build-electron` — Packages with Electron Builder to `dist-electron/`

### Docker Build (Linux/WSL)

The `build-docker.sh` script uses Wine to cross-compile for Windows:
1. Builds renderer assets locally
2. Runs Docker container with Electron Builder
3. Outputs to `dist-electron/`

## Important Considerations

- **Windows Only**: Stream Dork currently only targets Windows due to plugin compatibility
- **Plugin Compatibility**: Not all Stream Deck plugins will work; those requiring macOS-specific features or certain SDK features may not function
- **Security**: Plugins are executed as child processes with full system access; only use trusted plugins
- **No Installer**: The build produces a portable directory, not an installer

## Resources

- [Stream Deck SDK Documentation](https://docs.elgato.com/sdk)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev/)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)

