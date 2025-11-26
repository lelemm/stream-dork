import { useCallback, useEffect, useMemo, useRef } from "react"
import type { GridButton } from "@/lib/types"
import type { HostState, HostActionDescriptor, HostPluginDescriptor } from "@/types/electron"

type WebviewTag = (HTMLElement & { executeJavaScript: (code: string) => Promise<any> }) | null

const DEFAULT_DEVICE_ID = "fake-device-0"

interface PropertyInspectorPanelProps {
  selectedButton: GridButton | null
  hostState: HostState | null
}

function buildInspectorInfo(plugin: HostPluginDescriptor | undefined) {
  return {
    application: {
      font: "Segoe UI",
      language: navigator.language || "en",
      platform: "windows",
      platformVersion: navigator.userAgent,
      version: "fake-stream-deck",
    },
    colors: {
      buttonMouseOverBackgroundColor: "#464646FF",
      buttonPressedBackgroundColor: "#303030FF",
      buttonPressedBorderColor: "#646464FF",
      buttonPressedTextColor: "#969696FF",
      highlightColor: "#0078FFFF",
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    devices: [
      {
        id: DEFAULT_DEVICE_ID,
        name: "Fake Stream Deck",
        size: {
          columns: 5,
          rows: 3,
        },
        type: 0,
      },
    ],
    plugin: {
      uuid: plugin?.uuid,
      version: plugin?.version,
    },
  }
}

function buildActionInfo(
  context: string | undefined,
  entry:
    | {
        device?: string
        coordinates?: { column: number; row: number }
        controller?: string
        state?: number
        settings?: Record<string, unknown>
      }
    | undefined,
  actionDescriptor: HostActionDescriptor | undefined,
) {
  return {
    action: actionDescriptor?.uuid,
    context,
    device: entry?.device || DEFAULT_DEVICE_ID,
    payload: {
      settings: entry?.settings || {},
      coordinates: entry?.coordinates || { column: 0, row: 0 },
      controller: entry?.controller || "Keypad",
      state: entry?.state ?? 0,
      isInMultiAction: false,
      title: "",
      titleParameters: {},
    },
  }
}

export function PropertyInspectorPanel({ selectedButton, hostState }: PropertyInspectorPanelProps) {
  const webviewRef = useRef<WebviewTag>(null)
  const lastHandshakeId = useRef<string | null>(null)
  const isWebviewReadyRef = useRef<boolean>(false)

  const pluginUuid = selectedButton?.action?.pluginUuid
  const actionUuid = selectedButton?.action?.actionUuid
  const context = selectedButton?.action?.context

  const plugin = useMemo(
    () => hostState?.plugins.find((entry) => entry.uuid === pluginUuid),
    [hostState, pluginUuid],
  )

  const actionDescriptor = useMemo(
    () =>
      plugin?.actions.find((action) => action.uuid === actionUuid),
    [plugin, actionUuid],
  )

  const propertyInspectorPath = actionDescriptor?.propertyInspectorPath || plugin?.propertyInspectorPath
  
  // Create a stable URL without context param to avoid webview recreation
  // Context is passed via injected JavaScript instead
  const inspectorUrl = useMemo(() => {
    if (!propertyInspectorPath) return null
    const normalized = propertyInspectorPath.replace(/\\/g, "/")
    try {
      return new URL(`file://${normalized}`).href
    } catch {
      return null
    }
  }, [propertyInspectorPath])
  
  // Stable key based on plugin/action to prevent webview recreation during debugging
  const webviewKey = useMemo(() => {
    if (!pluginUuid || !actionUuid) return null
    return `${pluginUuid}-${actionUuid}`
  }, [pluginUuid, actionUuid])

  const contextEntry = useMemo(
    () => hostState?.contexts.find((ctx) => ctx.context === context),
    [hostState, context],
  )

  // Store connection parameters in refs to avoid recreating callback
  const connectionParamsRef = useRef<{
    port: number
    context: string
    pluginUuid: string
    actionUuid: string
    inspectorUUID: string
    info: any
    actionInfo: any
  } | null>(null)
  

  // Update connection params when they change
  useEffect(() => {
    if (!hostState?.port || !context || !pluginUuid || !actionUuid) {
      connectionParamsRef.current = null
      return
    }

    const inspectorUUID = `${context}-pi`
    const info = buildInspectorInfo(plugin)
    const actionInfo = buildActionInfo(context, contextEntry, actionDescriptor)

    connectionParamsRef.current = {
      port: hostState.port,
      context,
      pluginUuid,
      actionUuid,
      inspectorUUID,
      info,
      actionInfo,
    }
  }, [hostState?.port, context, pluginUuid, actionUuid, plugin, contextEntry, actionDescriptor])

  const handleDomReady = useCallback(() => {
    const webview = webviewRef.current
    if (!webview || !connectionParamsRef.current) return

    const params = connectionParamsRef.current
    const handshakeId = `${params.context}-${params.port}`
    
    // Prevent duplicate connections
    if (lastHandshakeId.current === handshakeId) {
      return
    }

    lastHandshakeId.current = handshakeId

    // Inject connection script
    const script = `
      (function() {
        if (typeof window.connectElgatoStreamDeckSocket === "function") {
          // Close existing connection if any
          if (window.__streamDeckWebSocket) {
            try {
              window.__streamDeckWebSocket.close();
            } catch(e) {}
          }
          
          window.connectElgatoStreamDeckSocket(
            ${params.port},
            "${params.inspectorUUID}",
            "registerPropertyInspector",
            ${JSON.stringify(JSON.stringify(params.info))},
            ${JSON.stringify(JSON.stringify(params.actionInfo))}
          );
        }
      })();
    `

    webview.executeJavaScript(script).catch((err) => {
      console.error("Failed to inject connection script:", err)
    })
  }, []) // Empty deps - uses refs instead

  // Reset handshake when context/port changes to force reconnection
  useEffect(() => {
    lastHandshakeId.current = null
    
    // Only try to reconnect if webview is ready (dom-ready has fired)
    if (webviewRef.current && connectionParamsRef.current && isWebviewReadyRef.current) {
      const webview = webviewRef.current
      const params = connectionParamsRef.current
      const handshakeId = `${params.context}-${params.port}`
      lastHandshakeId.current = handshakeId

      const script = `
        (function() {
          if (typeof window.connectElgatoStreamDeckSocket === "function") {
            if (window.__streamDeckWebSocket) {
              try {
                window.__streamDeckWebSocket.close();
              } catch(e) {}
            }
            window.connectElgatoStreamDeckSocket(
              ${params.port},
              "${params.inspectorUUID}",
              "registerPropertyInspector",
              ${JSON.stringify(JSON.stringify(params.info))},
              ${JSON.stringify(JSON.stringify(params.actionInfo))}
            );
          }
        })();
      `
      
      // Only execute if webview is ready
      try {
        webview.executeJavaScript(script).catch((err) => {
          console.error("Failed to reconnect Property Inspector:", err)
        })
      } catch (err) {
        console.error("Webview not ready for reconnection:", err)
      }
    }
  }, [context, webviewKey, hostState?.port])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    // Handle DOM ready - initial connection
    const handleReady = () => {
      isWebviewReadyRef.current = true
      // Small delay to ensure webview is fully initialized
      setTimeout(handleDomReady, 100)
    }

    // Handle navigation - reconnect if page reloads
    const handleDidFinishLoad = () => {
      isWebviewReadyRef.current = true
      if (connectionParamsRef.current) {
        setTimeout(handleDomReady, 100)
      }
    }

    // Handle webview being destroyed
    const handleDestroyed = () => {
      isWebviewReadyRef.current = false
    }

    webview.addEventListener("dom-ready", handleReady)
    webview.addEventListener("did-finish-load", handleDidFinishLoad)
    webview.addEventListener("destroyed", handleDestroyed)

    return () => {
      isWebviewReadyRef.current = false
      webview.removeEventListener("dom-ready", handleReady)
      webview.removeEventListener("did-finish-load", handleDidFinishLoad)
      webview.removeEventListener("destroyed", handleDestroyed)
    }
  }, [handleDomReady, webviewKey])

  const previousContextRef = useRef<string | null>(null)
  useEffect(() => {
    const previousContext = previousContextRef.current
    if (previousContext && previousContext !== context) {
      window.electron?.notifyInspectorVisibility({ context: previousContext, visible: false })
    }

    if (context) {
      window.electron?.notifyInspectorVisibility({ context, visible: true })
    }

    previousContextRef.current = context ?? null

    return () => {
      if (context) {
        window.electron?.notifyInspectorVisibility({ context, visible: false })
      }
    }
  }, [context])

  if (!selectedButton) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a button to load its property inspector.
      </div>
    )
  }

  if (!propertyInspectorPath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        This action has no property inspector configured.
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden rounded border border-border bg-muted/50">
      {inspectorUrl && webviewKey ? (
        <div className="h-full w-full">
          <webview 
            key={webviewKey}
            ref={webviewRef} 
            src={inspectorUrl} 
            className="h-full w-full"
            webpreferences="devTools=yes, nodeIntegration=no, contextIsolation=yes, backgroundThrottling=no"
            partition="persist:property-inspector"
            {...({ allowpopups: "true" } as React.HTMLAttributes<HTMLElement>)}
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Unable to load property inspector.
        </div>
      )}
    </div>
  )
}
