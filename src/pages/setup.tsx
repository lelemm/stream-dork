import "@/styles/global.css"

import { useEffect, useState } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { AvailableActions } from "@/components/available-actions"
import { ButtonGrid } from "@/components/button-grid"
import { ButtonConfigPanel } from "@/components/button-config-panel"
import { GridSettings } from "@/components/grid-settings"
import { Settings } from "lucide-react"

export default function SetupPage() {
  const [draggedAction, setDraggedAction] = useState<any>(null)
  const { addButton, setConfigFromMain } = useDeckStore()

  const handleDrop = (row: number, col: number) => {
    if (!draggedAction) return

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
    }

    return () => {
      unsubscribe?.()
    }
  }, [setConfigFromMain])

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
          <AvailableActions onDragStart={setDraggedAction} />
        </aside>
      </div>

      {/* Bottom Panel - Button Configuration */}
      <div className="h-80 border-t border-border bg-card">
        <ButtonConfigPanel />
      </div>
    </div>
  )
}
