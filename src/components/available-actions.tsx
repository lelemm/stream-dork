"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Keyboard, Link2, Terminal, Layers, Folder, Grip } from "lucide-react"
import type { ActionType } from "@/lib/types"

interface AvailableAction {
  id: string
  type: ActionType
  name: string
  icon: React.ReactNode
  description: string
}

const availableActions: AvailableAction[] = [
  {
    id: "hotkey",
    type: "hotkey",
    name: "Hotkey",
    icon: <Keyboard className="size-5" />,
    description: "Press keyboard shortcuts",
  },
  {
    id: "open-url",
    type: "open-url",
    name: "Open URL",
    icon: <Link2 className="size-5" />,
    description: "Open a website",
  },
  {
    id: "run-command",
    type: "run-command",
    name: "Run Command",
    icon: <Terminal className="size-5" />,
    description: "Execute a system command",
  },
  {
    id: "multi-action",
    type: "multi-action",
    name: "Multi Action",
    icon: <Layers className="size-5" />,
    description: "Chain multiple actions",
  },
  {
    id: "folder",
    type: "folder",
    name: "Folder",
    icon: <Folder className="size-5" />,
    description: "Navigate to sub-actions",
  },
]

interface AvailableActionsProps {
  onDragStart: (action: AvailableAction) => void
}

export function AvailableActions({ onDragStart }: AvailableActionsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h3 className="font-semibold text-sm text-foreground">Available Actions</h3>
      </div>
      <div className="flex flex-col gap-2">
        {availableActions.map((action) => (
          <Card
            key={action.id}
            draggable
            onDragStart={() => onDragStart(action)}
            className="p-3 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary flex-shrink-0">
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-foreground">{action.name}</p>
                  <Grip className="size-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
