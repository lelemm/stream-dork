import "@/styles/global.css"

import { createRoot } from "react-dom/client"
import { useEffect, useState, useCallback } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { ButtonGrid } from "@/components/button-grid"
import { ButtonConfigPanel } from "@/components/button-config-panel"
import { GridSettings } from "@/components/grid-settings"
import { HostDebugPanel } from "@/components/host-debug-panel"
import { PropertyInspectorPanel } from "@/components/property-inspector-panel"
import { UnifiedActionsPanel } from "@/components/unified-actions-panel"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { Settings } from "lucide-react"
import type { HostState } from "@/types/electron"

function SetupPage() {
  const [draggedAction, setDraggedAction] = useState<any>(null)
  const { config, addButton, setConfigFromMain, selectedButton, setPanelSizes } = useDeckStore()
  const [hostState, setHostState] = useState<HostState | null>(null)
  const [showControlPanel, setShowControlPanel] = useState(false)

  const handleDrop = async (row: number, col: number) => {
    if (!draggedAction) return

    if (draggedAction.type === "plugin" && draggedAction.pluginUuid && draggedAction.actionUuid) {
      const context = await window.electron?.createHostContext({
        pluginUuid: draggedAction.pluginUuid,
        actionUuid: draggedAction.actionUuid,
        coordinates: { column: col, row },
      })
      const newButton = {
        id: `${Date.now()}-${Math.random()}`,
        position: { row, col },
        action: {
          id: `${draggedAction.pluginUuid}-${draggedAction.actionUuid}`,
          type: "plugin" as const,
          name: draggedAction.name,
          pluginUuid: draggedAction.pluginUuid,
          actionUuid: draggedAction.actionUuid,
          context: context || undefined,
          propertyInspectorPath: draggedAction.propertyInspectorPath,
          icon: draggedAction.icon,
          config: {},
        },
        label: draggedAction.name,
        icon: draggedAction.icon,
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
        id: draggedAction.id,
        type: draggedAction.type,
        name: draggedAction.name,
        config: {},
      },
      label: draggedAction.name,
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
              <aside className="h-full border-r border-border bg-card p-4 overflow-y-auto">
                <GridSettings />
              </aside>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Center - Button Grid */}
            <ResizablePanel defaultSize={100 - leftPanelSize - rightPanelSize} minSize={30}>
              <main className="h-full overflow-auto bg-background">
                <ButtonGrid isSetupMode fitToViewport onButtonDrop={handleDrop} />
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Sidebar - Available Actions */}
            <ResizablePanel defaultSize={rightPanelSize} minSize={15} maxSize={40}>
              <aside className="h-full border-l border-border bg-card p-4 overflow-y-auto">
                <UnifiedActionsPanel plugins={hostState?.plugins || []} onDragStart={setDraggedAction} />
                {showControlPanel && (
                  <HostDebugPanel hostState={hostState} refreshHostState={refreshHostState} />
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
