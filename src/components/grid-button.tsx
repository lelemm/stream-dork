"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import type { GridButton as GridButtonType } from "@/lib/types"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GridButtonProps {
  button?: GridButtonType
  isSetupMode: boolean
  isSelected?: boolean
  onDrop?: (row: number, col: number) => void
  onClick?: () => void
  onRemove?: () => void
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
  onClick,
  onRemove,
  position,
  buttonSize,
  useFlexSize = false,
  radius = 16,
  hasBackground = false,
}: GridButtonProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onDrop?.(position.row, position.col)
  }

  const isEmpty = !button?.action

  const sizeStyles = useFlexSize
    ? { width: "100%", height: "100%" }
    : { width: `${buttonSize}px`, height: `${buttonSize}px` }

  const innerPadding = 4

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center flex-col transition-all",
        isSetupMode && "cursor-pointer",
        isSetupMode && isSelected && "ring-2 ring-primary ring-inset",
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
            <div className="text-2xl" style={{ color: button?.textColor || "#ffffff" }}>
              {button?.icon || "🎮"}
            </div>
            {button?.label && (
              <p
                className="text-[10px] font-medium text-center line-clamp-2 px-1"
                style={{ color: button?.textColor || "#ffffff" }}
              >
                {button.label}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
