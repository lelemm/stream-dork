import React from "react"
import { ChevronDown, Grip } from "lucide-react"
import { Card } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { HostPluginDescriptor } from "@/types/electron"

interface PluginAction {
  type: "plugin"
  pluginUuid: string
  actionUuid: string
  name: string
  pluginName: string
  tooltip?: string
  propertyInspectorPath?: string
  icon?: string
}

interface UnifiedActionsPanelProps {
  plugins: HostPluginDescriptor[]
  onDragStart: (action: PluginAction) => void
  filter?: string
}

export function UnifiedActionsPanel({ plugins, onDragStart, filter = "" }: UnifiedActionsPanelProps) {
  const [openPlugins, setOpenPlugins] = React.useState<Record<string, boolean>>({})

  // Initialize all plugins as open by default
  React.useEffect(() => {
    const initialState: Record<string, boolean> = {}
    plugins.forEach((plugin) => {
      if (openPlugins[plugin.uuid] === undefined) {
        initialState[plugin.uuid] = true
      }
    })
    if (Object.keys(initialState).length > 0) {
      setOpenPlugins((prev) => ({ ...prev, ...initialState }))
    }
  }, [plugins])

  const togglePlugin = (uuid: string) => {
    setOpenPlugins((prev) => ({ ...prev, [uuid]: !prev[uuid] }))
  }

  // Filter plugins and actions based on filter text
  const filterLower = filter.toLowerCase().trim()
  const filteredPlugins = React.useMemo(() => {
    if (!filterLower) return plugins

    return plugins
      .map((plugin) => {
        const filteredActions = plugin.actions.filter(
          (action) =>
            action.name.toLowerCase().includes(filterLower) ||
            action.tooltip?.toLowerCase().includes(filterLower) ||
            plugin.name.toLowerCase().includes(filterLower)
        )
        return { ...plugin, actions: filteredActions }
      })
      .filter((plugin) => plugin.actions.length > 0)
  }, [plugins, filterLower])

  if (plugins.length === 0) {
    return (
      <div className="rounded border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        No plugins loaded yet. Add plugins to your plugins folder.
      </div>
    )
  }

  if (filteredPlugins.length === 0 && filterLower) {
    return (
      <div className="rounded border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        No actions match &quot;{filter}&quot;.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h3 className="font-semibold text-sm text-foreground">Available Actions</h3>
      </div>
      
      <div className="flex flex-col gap-2">
        {filteredPlugins.map((plugin) => (
          <Collapsible
            key={plugin.uuid}
            open={openPlugins[plugin.uuid] ?? true}
            onOpenChange={() => togglePlugin(plugin.uuid)}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                <div className="flex items-center justify-center size-6 rounded bg-primary/10 flex-shrink-0">
                  {plugin.icon ? (
                    <img src={plugin.icon} alt={`${plugin.name} icon`} className="size-4" />
                  ) : (
                    <span className="text-xs font-semibold text-primary">
                      {plugin.name?.[0] ?? "?"}
                    </span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-foreground">{plugin.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {plugin.actions.length} action{plugin.actions.length !== 1 ? "s" : ""}
                    {plugin.connected ? " · connected" : " · disconnected"}
                  </p>
                </div>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform duration-200 ${
                    openPlugins[plugin.uuid] ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="flex flex-col gap-1.5 pl-4 pt-2">
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
                        pluginName: plugin.name,
                        tooltip: action.tooltip,
                        icon: action.icon || plugin.icon,
                        propertyInspectorPath: action.propertyInspectorPath || plugin.propertyInspectorPath,
                      })
                    }
                    className="p-2.5 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex items-center justify-center size-7 rounded bg-primary/10 text-primary flex-shrink-0">
                        {action.icon || plugin.icon ? (
                          <img
                            src={action.icon || plugin.icon}
                            alt={`${action.name} icon`}
                            className="size-4"
                          />
                        ) : (
                          <span className="text-xs font-semibold">{action.name?.[0] ?? "?"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-foreground">{action.name}</p>
                          <Grip className="size-3 text-muted-foreground ml-auto flex-shrink-0" />
                        </div>
                        {action.tooltip && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                            {action.tooltip}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  )
}

