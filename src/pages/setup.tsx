import "@/styles/global.css"

import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { AvailableActions } from "@/components/available-actions"
import { ButtonGrid } from "@/components/button-grid"
import { ButtonConfigPanel } from "@/components/button-config-panel"
import { GridSettings } from "@/components/grid-settings"
import { HostDebugPanel } from "@/components/host-debug-panel"
import { PluginActionsPanel } from "@/components/plugin-actions-panel"
import { PropertyInspectorPanel } from "@/components/property-inspector-panel"
import { Settings } from "lucide-react"
import type { HostState } from "@/types/electron"

function SetupPage() {
  const [draggedAction, setDraggedAction] = useState<any>(null)
  const { addButton, setConfigFromMain, selectedButton } = useDeckStore()
  const [hostState, setHostState] = useState<HostState | null>(null)

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

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <Settings className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-foreground">Stream Deck Setup</h1>
              <p className="text-xs text-muted-foreground">Configure your virtual stream deck</p>
            </div>
          </div>

        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Grid Settings */}
        <aside className="w-72 border-r border-border bg-card p-4 overflow-y-auto">
          <GridSettings />
        </aside>

        {/* Center - Button Grid */}
        <main className="flex-1 overflow-auto bg-background">
          <ButtonGrid isSetupMode fitToViewport onButtonDrop={handleDrop} />
        </main>

        {/* Right Sidebar - Available Actions */}
        <aside className="w-80 border-l border-border bg-card p-4 overflow-y-auto">
          <AvailableActions plugins={hostState?.plugins || []} onDragStart={setDraggedAction} />
          <PluginActionsPanel hostState={hostState} onDragStart={setDraggedAction} />
          <HostDebugPanel hostState={hostState} refreshHostState={refreshHostState} />
        </aside>
      </div>

      {/* Bottom Panel - Button Configuration / Property Inspector */}
      <div className="h-[360px] border-t border-border bg-card p-4">
        {selectedButton?.action?.type === "plugin" ? (
          <PropertyInspectorPanel selectedButton={selectedButton} hostState={hostState} />
        ) : (
          <ButtonConfigPanel />
        )}
      </div>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<SetupPage />)
}
