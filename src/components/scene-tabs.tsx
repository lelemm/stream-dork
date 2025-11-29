import { useState, useRef, useEffect } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X, Plus, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Scene } from "@/lib/types"

interface SceneWithHint extends Scene {
  filterHint: string
}

// Generate filter hints for scenes (same algorithm as button hints)
function generateSceneHints(scenes: Scene[]): SceneWithHint[] {
  const letterGroups = new Map<string, Scene[]>()

  scenes.forEach((scene) => {
    const label = scene.name || ""
    const firstLetter = label.charAt(0).toUpperCase() || "?"
    if (!letterGroups.has(firstLetter)) {
      letterGroups.set(firstLetter, [])
    }
    letterGroups.get(firstLetter)!.push(scene)
  })

  const result: SceneWithHint[] = []

  letterGroups.forEach((scenesInGroup, letter) => {
    scenesInGroup.forEach((scene, index) => {
      let hint: string

      if (scenesInGroup.length === 1) {
        hint = letter
      } else if (scenesInGroup.length <= 10) {
        const num = index < 9 ? (index + 1).toString() : "0"
        hint = `${letter}${num}`
      } else {
        if (index < 10) {
          const num = index < 9 ? (index + 1).toString() : "0"
          hint = `${letter}${num}`
        } else {
          const extIndex = index - 10
          const num = extIndex < 9 ? (extIndex + 1).toString() : "0"
          hint = `${letter}O${num}`
        }
      }

      result.push({
        ...scene,
        filterHint: hint,
      })
    })
  })

  return result
}

export function SceneTabs() {
  const {
    config,
    setActiveScene,
    addScene,
    removeScene,
    renameScene,
    reorderScenes,
  } = useDeckStore()

  const scenes = config.scenes || []
  
  // Compute activeScene from config
  const activeScene = scenes.find((s) => s.id === config.activeSceneId) || scenes[0] || null
  const scenesWithHints = scenes.length > 0 ? generateSceneHints(scenes) : []
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (editingSceneId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingSceneId])

  const handleDoubleClick = (scene: Scene) => {
    setEditingSceneId(scene.id)
    setEditName(scene.name)
  }

  const handleEditSubmit = () => {
    if (editingSceneId && editName.trim()) {
      renameScene(editingSceneId, editName.trim())
    }
    setEditingSceneId(null)
    setEditName("")
  }

  const handleEditCancel = () => {
    setEditingSceneId(null)
    setEditName("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit()
    } else if (e.key === "Escape") {
      handleEditCancel()
    }
  }

  const handleAddScene = () => {
    const sceneCount = scenes.length + 1
    const newSceneId = addScene(`Scene ${sceneCount}`)
    setActiveScene(newSceneId)
  }

  const handleRemoveScene = (sceneId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const scene = scenes.find((s) => s.id === sceneId)
    if (!scene) return

    // Confirm if scene has buttons
    if (scene.buttons.length > 0) {
      if (!confirm(`Delete "${scene.name}"? This scene has ${scene.buttons.length} button(s).`)) {
        return
      }
    }

    removeScene(sceneId)
  }

  const handleDragStart = (e: React.DragEvent, sceneId: string) => {
    console.log("[Setup] SceneTabs dragStart", sceneId)
    setDraggedSceneId(sceneId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("application/x-scene-id", sceneId)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    // Debug: track which index we're dragging over
    if (dragOverIndex !== index) {
      console.log("[Setup] SceneTabs dragOver index", index)
    }
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)

    // Read scene ID from dataTransfer (more reliable than React state)
    const sceneId = e.dataTransfer.getData("application/x-scene-id") || draggedSceneId
    console.log("[Setup] SceneTabs drop at index", targetIndex, "sceneId:", sceneId)
    if (!sceneId) return

    const currentOrder = scenes.map((s) => s.id)
    const draggedIndex = currentOrder.indexOf(sceneId)

    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedSceneId(null)
      return
    }

    // Reorder
    const newOrder = [...currentOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, sceneId)

    reorderScenes(newOrder)
    setDraggedSceneId(null)
  }

  const handleDragEnd = () => {
    setDraggedSceneId(null)
    setDragOverIndex(null)
  }

  // Ensure we have at least one scene
  if (scenes.length === 0) {
    return (
      <div className="border-b border-border bg-card px-2 py-1">
        <div className="text-xs text-muted-foreground">No scenes available</div>
      </div>
    )
  }

  return (
    <div className="border-b border-border bg-card flex-shrink-0 z-10">
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto min-h-[42px]">
        {scenesWithHints.map((scene, index) => {
          const isActive = activeScene?.id === scene.id
          const isEditing = editingSceneId === scene.id
          const isDragging = draggedSceneId === scene.id
          const isDragOver = dragOverIndex === index

          return (
            <div
              key={scene.id}
              draggable
              onDragStart={(e) => handleDragStart(e, scene.id)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-t-md cursor-pointer transition-colors",
                "hover:bg-accent/50",
                isActive && "bg-background border-b-2 border-b-primary",
                isDragging && "opacity-50",
                isDragOver && "ring-2 ring-primary ring-offset-2"
              )}
              onClick={() => !isEditing && setActiveScene(scene.id)}
              onDoubleClick={() => handleDoubleClick(scene)}
            >
              <GripVertical className="size-3 text-muted-foreground cursor-grab active:cursor-grabbing" />
              
              {isEditing ? (
                <Input
                  ref={editInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleEditSubmit}
                  onKeyDown={handleKeyDown}
                  className="h-6 px-1.5 text-xs min-w-[80px] max-w-[200px]"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="text-sm font-medium whitespace-nowrap">{scene.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono opacity-60">
                    {scene.filterHint}
                  </span>
                </>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => handleRemoveScene(scene.id, e)}
                disabled={scenes.length <= 1}
              >
                <X className="size-3" />
              </Button>
            </div>
          )
        })}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground"
          onClick={handleAddScene}
        >
          <Plus className="size-4 mr-1" />
          <span className="text-xs">Add Scene</span>
        </Button>
      </div>
    </div>
  )
}

