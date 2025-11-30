import { useRef, useCallback } from "react"
import { useDeckStore } from "@/lib/deck-store"

export interface PluginAction {
  type: "plugin"
  pluginUuid: string
  actionUuid: string
  name: string
  pluginName?: string
  tooltip?: string
  propertyInspectorPath?: string
  icon?: string
}

export interface BuiltInAction {
  id: string
  type: "hotkey" | "open-url" | "run-command" | "multi-action" | "folder"
  name: string
  icon?: string
}

export type DraggedAction = PluginAction | BuiltInAction

/**
 * Hook for managing drag and drop in the setup page
 * Uses a ref to store the dragged action to avoid re-renders during drag
 */
export function useSetupDragDrop(onActionDropped?: () => void) {
  const { addButton } = useDeckStore()
  const draggedActionRef = useRef<DraggedAction | null>(null)

  const handleDragStart = useCallback((action: DraggedAction) => {
    console.log("[useSetupDragDrop] Drag start", action)
    draggedActionRef.current = action
  }, [])

  const handleDrop = useCallback(async (row: number, col: number) => {
    const draggedAction = draggedActionRef.current
    console.log("[useSetupDragDrop] handleDrop called", { row, col, draggedAction })
    
    if (!draggedAction) {
      console.log("[useSetupDragDrop] handleDrop: no draggedAction, ignoring")
      return
    }

    if (draggedAction.type === "plugin" && "pluginUuid" in draggedAction && "actionUuid" in draggedAction) {
      console.log("[useSetupDragDrop] handleDrop: plugin action detected", {
        pluginUuid: draggedAction.pluginUuid,
        actionUuid: draggedAction.actionUuid,
      })
      
      const context = await window.electron?.createHostContext({
        pluginUuid: draggedAction.pluginUuid,
        actionUuid: draggedAction.actionUuid,
        coordinates: { column: col, row },
      })
      
      console.log("[useSetupDragDrop] handleDrop: createHostContext returned", context)
      
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
      
      console.log("[useSetupDragDrop] handleDrop: adding new plugin button", newButton)
      addButton(newButton)
      draggedActionRef.current = null
      onActionDropped?.()
      return
    }

    // Built-in action
    const newButton = {
      id: `${Date.now()}-${Math.random()}`,
      position: { row, col },
      action: {
        id: (draggedAction as BuiltInAction).id,
        type: draggedAction.type as "hotkey" | "open-url" | "run-command" | "multi-action" | "folder",
        name: draggedAction.name,
        config: {},
      },
      label: draggedAction.name,
      icon: undefined,
    }

    console.log("[useSetupDragDrop] handleDrop: adding new non-plugin button", newButton)
    addButton(newButton)
    draggedActionRef.current = null
    onActionDropped?.()
  }, [addButton, onActionDropped])

  const clearDraggedAction = useCallback(() => {
    draggedActionRef.current = null
  }, [])

  const getDraggedAction = useCallback(() => {
    return draggedActionRef.current
  }, [])

  return {
    handleDragStart,
    handleDrop,
    clearDraggedAction,
    getDraggedAction,
  }
}

