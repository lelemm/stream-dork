import "@/styles/global.css"

import { createRoot } from "react-dom/client"
import { useEffect, useState, useCallback } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Settings, Search, Puzzle, Sliders, FolderOpen } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { HostState } from "@/types/electron"

function SetupPage() {
  const [draggedAction, setDraggedAction] = useState<any>(null)
  const { config, addButton, setConfigFromMain, selectedButton, setPanelSizes } = useDeckStore()
  const [hostState, setHostState] = useState<HostState | null>(null)
  const [showControlPanel, setShowControlPanel] = useState(false)
  const [actionFilter, setActionFilter] = useState("")
  const [rightPanelTab, setRightPanelTab] = useState<string>("actions")

  const handleOpenPluginFolder = () => {
    window.electron?.openPluginFolder?.()
  }

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
    if (sizes.length === 2) {
      setPanelSizes({
        rightPanel: sizes[1],
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
  const rightPanelSize = config.panelSizes?.rightPanel ?? 25
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
            {/* Center - Button Grid */}
            <ResizablePanel defaultSize={100 - rightPanelSize} minSize={40}>
              <main className="h-full flex flex-col bg-background">
                <SceneTabs />
                <div className="flex-1 overflow-auto">
                  <ButtonGrid isSetupMode fitToViewport onButtonDrop={handleDrop} />
                </div>
              </main>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Sidebar - Actions & Settings Tabs */}
            <ResizablePanel defaultSize={rightPanelSize} minSize={20} maxSize={45}>
              <aside className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
                <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col h-full">
                  <div className="flex-shrink-0 border-b border-border">
                    <TabsList className="w-full justify-start rounded-none border-b-0 bg-transparent h-11 px-2">
                      <TabsTrigger 
                        value="actions" 
                        className="data-[state=active]:bg-muted rounded-md gap-1.5"
                      >
                        <Puzzle className="size-3.5" />
                        Actions
                      </TabsTrigger>
                      <TabsTrigger 
                        value="settings" 
                        className="data-[state=active]:bg-muted rounded-md gap-1.5"
                      >
                        <Sliders className="size-3.5" />
                        Settings
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="actions" className="flex-1 overflow-hidden flex flex-col m-0">
                    <div className="p-4 flex-shrink-0">
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
                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                      <UnifiedActionsPanel
                        plugins={hostState?.plugins || []}
                        onDragStart={setDraggedAction}
                        filter={actionFilter}
                      />
                    </div>
                    {showControlPanel && (
                      <div className="flex-shrink-0 p-4 border-t border-border">
                        <HostDebugPanel hostState={hostState} refreshHostState={refreshHostState} />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="settings" className="flex-1 overflow-y-auto m-0 p-4">
                    <div className="space-y-6">
                      <GridSettings />
                      <div className="border-t border-border pt-4">
                        <NotificationSettings />
                      </div>
                      <div className="border-t border-border pt-4">
                        <h3 className="font-medium text-sm mb-3">Plugins</h3>
                        <Button 
                          variant="outline" 
                          className="w-full gap-2"
                          onClick={handleOpenPluginFolder}
                        >
                          <FolderOpen className="size-4" />
                          Explore Plugin Folder
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2">
                          Place Stream Deck compatible plugins in this folder and restart the app.
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
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
