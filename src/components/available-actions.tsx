import React from "react"

import { Card } from "@/components/ui/card"
import { Grip } from "lucide-react"
import type { HostPluginDescriptor } from "@/types/electron"

interface AvailableAction {
  type: "plugin"
  pluginUuid: string
  actionUuid: string
  name: string
  pluginName: string
  tooltip?: string
  propertyInspectorPath?: string
  icon?: string
}

interface AvailableActionsProps {
  plugins: HostPluginDescriptor[]
  onDragStart: (action: AvailableAction) => void
}

export function AvailableActions({ plugins, onDragStart }: AvailableActionsProps) {
  const availableActions = React.useMemo(() => {
    return plugins.flatMap((plugin) =>
      plugin.actions.map((action) => ({
        type: "plugin" as const,
        pluginUuid: plugin.uuid,
        actionUuid: action.uuid,
        name: action.name,
        pluginName: plugin.name,
        tooltip: action.tooltip,
        icon: action.icon || plugin.icon,
        propertyInspectorPath: action.propertyInspectorPath || plugin.propertyInspectorPath,
      })),
    )
  }, [plugins])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h3 className="font-semibold text-sm text-foreground">Available Actions</h3>
      </div>
      <div className="flex flex-col gap-2">
        {availableActions.map((action) => (
          <Card
            key={`${action.pluginUuid}-${action.actionUuid}`}
            draggable
            onDragStart={() => onDragStart(action)}
            className="p-3 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary flex-shrink-0">
                {action.icon ? (
                  <img src={action.icon} alt={`${action.pluginName} icon`} className="size-5" />
                ) : (
                  <span className="size-5 font-semibold text-primary">?</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-foreground">{action.name}</p>
                  <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {action.pluginName}
                  </span>
                  <Grip className="size-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{action.tooltip || "No description"}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
