import "@/styles/global.css"

import { createRoot } from "react-dom/client"
import { useEffect, useState, useCallback, useRef } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { ButtonGrid } from "@/components/button-grid"
import { ButtonConfigPanel } from "@/components/button-config-panel"
import { GridSettings } from "@/components/grid-settings"
import { NotificationSettings } from "@/components/notification-settings"
import { HostDebugPanel } from "@/components/host-debug-panel"
import { PropertyInspectorPanel } from "@/components/property-inspector-panel"
import { UnifiedActionsPanel } from "@/components/unified-actions-panel"
import { SceneTabs } from "@/components/scene-tabs"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { Settings, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { HostState } from "@/types/electron"

function SetupPage() {
  const [draggedAction, setDraggedAction] = useState<any>(null)
  const { config, addButton, setConfigFromMain, selectedButton, setPanelSizes, updateButtonByContext, setButtonStatusByContext } = useDeckStore()
  const [hostState, setHostState] = useState<HostState | null>(null)
  const [showControlPanel, setShowControlPanel] = useState(false)
  const [actionFilter, setActionFilter] = useState("")
  const statusTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const handleDragEnd = () => {
    setDraggedAction(null)
  }

  const handleDrop = async (row: number, col: number, actionData?: { type: string; pluginUuid?: string; actionUuid?: string; name?: string; propertyInspectorPath?: string; icon?: string; id?: string }) => {
    console.log("[Setup] handleDrop called", { row, col, actionData, draggedAction })
    // Use action data from dataTransfer if available, fall back to state
    const action = actionData || draggedAction
    if (!action) return

    if (action.type === "plugin" && action.pluginUuid && action.actionUuid) {
      const context = await window.electron?.createHostContext({
        pluginUuid: action.pluginUuid,
        actionUuid: action.actionUuid,
        coordinates: { column: col, row },
      })
      const newButton = {
        id: `${Date.now()}-${Math.random()}`,
        position: { row, col },
        action: {
          id: `${action.pluginUuid}-${action.actionUuid}`,
          type: "plugin" as const,
          name: action.name || "Action",
          pluginUuid: action.pluginUuid,
          actionUuid: action.actionUuid,
          context: context || undefined,
          propertyInspectorPath: action.propertyInspectorPath,
          icon: action.icon,
          config: {},
        },
        label: action.name || "Action",
        icon: action.icon,
      }
      addButton(newButton)
      setDraggedAction(null)
      await refreshHostState()
      return
    }

    const newButton = {
      id: `${Date.now()}-${Math.random()}`,
      position: { row, col },
      action: {
        id: action.id || `${Date.now()}`,
        type: action.type as "plugin" | "hotkey" | "command",
        name: action.name || "Action",
        config: {},
      },
      label: action.name || "Action",
      icon: undefined,
    }

    addButton(newButton)
    setDraggedAction(null)
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    if (typeof window !== "undefined") {
      window.electron?.getConfig().then((cfg) => {
        if (cfg) {
          setConfigFromMain(cfg)
        }
      })

      window.electron?.getAppFlags?.().then((flags) => {
        if (flags?.showControlPanel) {
          setShowControlPanel(true)
        }
      })

      unsubscribe = window.electron?.onConfigUpdated((cfg) => {
        setConfigFromMain(cfg)
      })
      window.electron?.getHostState().then((state) => setHostState(state))
    }

    return () => {
      unsubscribe?.()
    }
  }, [setConfigFromMain])

  const refreshHostState = async () => {
    try {
      const state = await window.electron?.getHostState()
      if (state) {
        setHostState(state)
      }
    } catch (error) {
      console.error("Unable to refresh host state", error)
    }
  }

  // Refresh host state when selected button changes to get fresh settings
  useEffect(() => {
    if (selectedButton?.action?.context) {
      refreshHostState()
    }
  }, [selectedButton?.action?.context])

  // Listen for host events (setImage, setTitle, showAlert, showOk) to show visual feedback
  useEffect(() => {
    const handleHostEvent = (message: { event?: string; context?: string; payload?: { title?: string; image?: string; state?: number; settings?: Record<string, unknown> } }) => {
      if (!message?.context) return
      const { event, context, payload } = message
      switch (event) {
        case "didReceiveSettings":
          // Settings changed - refresh host state to get updated context settings
          refreshHostState()
          break
        case "setTitle":
          if (typeof payload?.title === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              label: payload.title!,
            }))
          }
          break
        case "setImage":
          if (typeof payload?.image === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              icon: payload.image!,
            }))
          }
          break
        case "setState":
          updateButtonByContext(context, (button) => ({
            ...button,
            action: button.action ? { ...button.action, state: payload?.state ?? 0 } : button.action,
          }))
          break
        case "showAlert":
          updateButtonByContext(context, (button) => ({ ...button, status: "alert" }))
          clearTimeout(statusTimers.current.get(context))
          statusTimers.current.set(
            context,
            setTimeout(() => {
              setButtonStatusByContext(context, undefined)
              statusTimers.current.delete(context)
            }, 1200),
          )
          break
        case "showOk":
          updateButtonByContext(context, (button) => ({ ...button, status: "ok" }))
          clearTimeout(statusTimers.current.get(context))
          statusTimers.current.set(
            context,
            setTimeout(() => {
              setButtonStatusByContext(context, undefined)
              statusTimers.current.delete(context)
            }, 1200),
          )
          break
        default:
          break
      }
    }

    const unsubscribe = window.electron?.onHostEvent(handleHostEvent)
    return () => {
      unsubscribe?.()
      statusTimers.current.forEach((timer) => clearTimeout(timer))
      statusTimers.current.clear()
    }
  }, [updateButtonByContext, setButtonStatusByContext])

  const handleHorizontalLayoutChange = useCallback((sizes: number[]) => {
    if (sizes.length === 3) {
      setPanelSizes({
        leftPanel: sizes[0],
        rightPanel: sizes[2],
      })
    }
  }, [setPanelSizes])

  const handleVerticalLayoutChange = useCallback((sizes: number[]) => {
    if (sizes.length === 2) {
      setPanelSizes({
        bottomPanel: sizes[1],
      })
    }
  }, [setPanelSizes])

  // Get panel sizes from config with defaults
  const leftPanelSize = config.panelSizes?.leftPanel ?? 20
  const rightPanelSize = config.panelSizes?.rightPanel ?? 22
  const bottomPanelSize = config.panelSizes?.bottomPanel ?? 35

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <Settings className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-foreground">Stream Dork Setup</h1>
              <p className="text-xs text-muted-foreground">Configure your virtual stream deck</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Resizable Panels */}
      <ResizablePanelGroup
        direction="vertical"
        className="flex-1"
        onLayout={handleVerticalLayoutChange}
      >
        {/* Top Section (Horizontal Panels) */}
        <ResizablePanel defaultSize={100 - bottomPanelSize} minSize={30}>
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={handleHorizontalLayoutChange}
          >
            {/* Left Sidebar - Grid Settings */}
            <ResizablePanel defaultSize={leftPanelSize} minSize={15} maxSize={35}>
              <aside className="h-full border-r border-border bg-card p-4 overflow-y-auto space-y-6">
                <GridSettings />
                <div className="border-t border-border pt-4">
                  <NotificationSettings />
                </div>
              </aside>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center - Button Grid */}
            <ResizablePanel defaultSize={100 - leftPanelSize - rightPanelSize} minSize={30}>
              <main className="h-full flex flex-col bg-background">
                <SceneTabs />
                <div className="flex-1 overflow-auto">
                  <ButtonGrid isSetupMode fitToViewport onButtonDrop={handleDrop} />
                </div>
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Sidebar - Available Actions */}
            <ResizablePanel defaultSize={rightPanelSize} minSize={15} maxSize={40}>
              <aside className="h-full border-l border-border bg-card p-4 overflow-y-auto flex flex-col">
                <div className="mb-3 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Filter actions..."
                      value={actionFilter}
                      onChange={(e) => setActionFilter(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div onDragEnd={handleDragEnd}>
                    <UnifiedActionsPanel
                      plugins={hostState?.plugins || []}
                      onDragStart={setDraggedAction}
                      filter={actionFilter}
                    />
                  </div>
                </div>
                {showControlPanel && (
                  <div className="flex-shrink-0 mt-4">
                    <HostDebugPanel hostState={hostState} refreshHostState={refreshHostState} />
                  </div>
                )}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Bottom Panel - Button Configuration / Property Inspector */}
        <ResizablePanel defaultSize={bottomPanelSize} minSize={15} maxSize={60}>
          <div className="h-full border-t border-border bg-card p-4 overflow-y-auto">
            {selectedButton?.action?.type === "plugin" ? (
              <PropertyInspectorPanel selectedButton={selectedButton} hostState={hostState} />
            ) : (
              <ButtonConfigPanel />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<SetupPage />)
}
