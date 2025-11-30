import type React from "react"
import { cn } from "@/lib/utils"
import type { GridButton as GridButtonType } from "@/lib/types"
import { Plus, X, Copy, Trash2, ClipboardPaste } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface GridButtonProps {
  button?: GridButtonType
  isSetupMode: boolean
  isSelected?: boolean
  onDrop?: (row: number, col: number) => void
  onMove?: (row: number, col: number) => void
  onClick?: () => void
  onRemove?: () => void
  onCopy?: () => void
  onPaste?: () => void
  canPaste?: boolean
  position: { row: number; col: number }
  buttonSize: number
  useFlexSize?: boolean
  radius?: number
  hasBackground?: boolean
}

export function GridButton({
  button,
  isSetupMode,
  isSelected,
  onDrop,
  onMove,
  onClick,
  onRemove,
  onCopy,
  onPaste,
  canPaste = false,
  position,
  buttonSize,
  useFlexSize = false,
  radius = 16,
  hasBackground = false,
}: GridButtonProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Determine the drop effect based on what's being dragged
    const types = e.dataTransfer.types
    if (types.includes("application/x-button-move")) {
      e.dataTransfer.dropEffect = "move"
    } else if (types.includes("application/json")) {
      e.dataTransfer.dropEffect = "copy"
    } else {
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const types = e.dataTransfer.types
    console.log("[GridButton] Drop event", { position, types: Array.from(types) })
    
    // Check if this is a move operation (existing button being dragged within grid)
    if (types.includes("application/x-button-move")) {
      console.log("[GridButton] Button move operation")
      onMove?.(position.row, position.col)
      return
    }
    
    // Check if this is a new action being dropped from the actions panel
    if (types.includes("application/json")) {
      console.log("[GridButton] New action drop operation")
      onDrop?.(position.row, position.col)
      return
    }
    
    // Fallback for other drag types
    console.log("[GridButton] Fallback drop operation")
    onDrop?.(position.row, position.col)
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (!button || !isSetupMode) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData("application/x-button-move", button.id)
    e.dataTransfer.effectAllowed = "move"
  }

  const isEmpty = !button?.action

  const sizeStyles = useFlexSize
    ? { width: "100%", height: "100%" }
    : { width: `${buttonSize}px`, height: `${buttonSize}px` }

  const innerPadding = 4

  const buttonContent = (
    <div
      draggable={isSetupMode && !isEmpty}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center flex-col transition-all",
        isSetupMode && "cursor-pointer",
        isSetupMode && isSelected && "ring-2 ring-primary ring-inset",
        isSetupMode && !isEmpty && "cursor-grab active:cursor-grabbing",
        !isSetupMode && !isEmpty && "hover:brightness-110 active:scale-95",
      )}
      style={sizeStyles}
    >
      {isEmpty ? (
        isSetupMode && (
          <div className="absolute inset-2 border-2 border-dashed border-muted-foreground/20 rounded-lg flex items-center justify-center">
            <Plus className="size-6 text-muted-foreground/40" />
          </div>
        )
      ) : (
        <>
          <div
            className="absolute flex items-center justify-center flex-col gap-1"
            style={{
              inset: `${innerPadding}px`,
              backgroundColor: button?.backgroundColor || "rgba(255,255,255,0.05)",
              borderRadius: `${Math.max(radius - 4, 4)}px`,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {isSetupMode && onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 size-5 rounded-full bg-background/80 hover:bg-background z-10"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
              >
                <X className="size-3" />
              </Button>
            )}
            {button?.icon && (button.icon.startsWith("data:") || button.icon.startsWith("http")) ? (
              <img 
                src={button.icon} 
                alt={button.label || "Button icon"} 
                className="size-10 object-contain"
              />
            ) : (
              <div className="text-2xl" style={{ color: button?.textColor || "#ffffff" }}>
                {button?.icon || "🎮"}
              </div>
            )}
            {button?.label && (
              <p
                className="text-[10px] font-medium text-center line-clamp-2 px-1"
                style={{ color: button?.textColor || "#ffffff" }}
              >
                {button.label}
              </p>
            )}
            {button?.status && (
              <span
                className="absolute top-1 right-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-background"
                style={{ backgroundColor: button.status === "alert" ? "#f97316" : "#22c55e" }}
              >
                {button.status === "alert" ? "!" : "OK"}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )

  // Only show context menu in setup mode
  if (!isSetupMode) {
    return buttonContent
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {buttonContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isEmpty ? (
          <ContextMenuItem onClick={onPaste} disabled={!canPaste}>
            <ClipboardPaste className="mr-2 size-4" />
            Paste
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem onClick={onCopy}>
              <Copy className="mr-2 size-4" />
              Copy
            </ContextMenuItem>
            <ContextMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 size-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
