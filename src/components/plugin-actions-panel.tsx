import type { HostActionDescriptor, HostState } from "@/types/electron"
import { Card } from "./ui/card"

interface PluginActionsPanelProps {
  hostState: HostState | null
  onDragStart: (action: {
    type: "plugin"
    pluginUuid: string
    actionUuid: string
    name: string
    icon?: string
  }) => void
}

export function PluginActionsPanel({ hostState, onDragStart }: PluginActionsPanelProps) {
  if (!hostState) {
    return (
      <div className="mt-4 rounded border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        Loading plugin actions…
      </div>
    )
  }

  const hasActions = hostState.plugins.some((plugin) => plugin.actions.length > 0)
  if (!hasActions) {
    return (
      <div className="mt-4 rounded border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        No plugins loaded yet.
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Plugin Actions
        </span>
      </div>
      <div className="space-y-2">
        {hostState.plugins.map((plugin) => (
          <div key={plugin.uuid} className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {plugin.name}
            </div>
            <div className="grid gap-2">
              {plugin.actions.map((action) => (
                <Card
                  key={action.uuid}
                  draggable
                  onDragStart={() =>
                    onDragStart({
                      type: "plugin",
                      pluginUuid: plugin.uuid,
                      actionUuid: action.uuid,
                      name: action.name,
                      icon: action.icon,
                    })
                  }
                  className="p-3 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-muted/60 text-muted-foreground">
                      {action.icon ? (
                        <img src={action.icon} alt="" className="max-h-4 max-w-4" />
                      ) : (
                        action.name?.[0] ?? "?"
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium capitalize text-foreground">{action.name}</p>
                      {action.tooltip && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {action.tooltip}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
