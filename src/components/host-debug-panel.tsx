import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { HostState } from "@/types/electron"

const EVENT_OPTIONS = [
  "keyDown",
  "keyUp",
  "deviceDidConnect",
  "deviceDidDisconnect",
  "titleParametersDidChange",
  "propertyInspectorDidAppear",
  "propertyInspectorDidDisappear",
]

interface HostDebugPanelProps {
  hostState: HostState | null
  refreshHostState: () => Promise<void>
}

export function HostDebugPanel({ hostState, refreshHostState }: HostDebugPanelProps) {
  const [selectedPlugin, setSelectedPlugin] = useState<string | undefined>()
  const [selectedAction, setSelectedAction] = useState<string | undefined>()
  const [selectedContext, setSelectedContext] = useState<string | undefined>()
  const [eventName, setEventName] = useState(EVENT_OPTIONS[0])

  useEffect(() => {
    if (hostState && !selectedPlugin) {
      setSelectedPlugin(hostState.plugins[0]?.uuid)
    }
  }, [hostState, selectedPlugin])

  useEffect(() => {
    if (selectedPlugin && hostState) {
      const plugin = hostState.plugins.find((entry) => entry.uuid === selectedPlugin)
      setSelectedAction(plugin?.actions?.[0]?.uuid)
    }
  }, [hostState, selectedPlugin])

  useEffect(() => {
    if (hostState && !selectedContext) {
      setSelectedContext(hostState.contexts[0]?.context)
    }
  }, [hostState, selectedContext])

  const pluginOptions = useMemo(() => hostState?.plugins ?? [], [hostState])
  const contextOptions = useMemo(() => hostState?.contexts ?? [], [hostState])

  const handleCreateContext = async () => {
    if (!selectedPlugin || !selectedAction) {
      return
    }
    await window.electron?.createHostContext({
      pluginUuid: selectedPlugin,
      actionUuid: selectedAction,
      coordinates: { column: 0, row: 0 },
    })
    await refreshHostState()
  }

  const handleSendEvent = async () => {
    if (!selectedContext) {
      return
    }
    await window.electron?.sendHostEvent({
      context: selectedContext,
      eventName,
      payload: {},
    })
    await refreshHostState()
  }

  return (
    <Card className="mt-6 p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Host Control Panel</h3>
        <Button variant="outline" size="sm" onClick={refreshHostState}>
          Refresh
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Port: {hostState?.port ?? "waiting..."}</p>
        <p>Plugins loaded: {pluginOptions.length}</p>
        <p>Contexts active: {contextOptions.length}</p>
      </div>

      <div className="space-y-2 text-xs">
        <label className="font-medium">Plugin</label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={selectedPlugin}
          onChange={(event) => setSelectedPlugin(event.target.value)}
        >
          {pluginOptions.map((plugin) => (
            <option key={plugin.uuid} value={plugin.uuid}>
              {plugin.name} {plugin.connected ? "· connected" : "· disconnected"}
            </option>
          ))}
        </select>
        <label className="font-medium">Action</label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={selectedAction}
          onChange={(event) => setSelectedAction(event.target.value)}
        >
          {pluginOptions
            .find((plugin) => plugin.uuid === selectedPlugin)
            ?.actions.map((action) => (
              <option key={action.uuid} value={action.uuid}>
                {action.name}
              </option>
            ))}
        </select>
        <Button onClick={handleCreateContext} className="w-full">
          Create Context
        </Button>
      </div>

      <div className="space-y-2 text-xs">
        <label className="font-medium">Context</label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={selectedContext}
          onChange={(event) => setSelectedContext(event.target.value)}
        >
          {contextOptions.map((ctx) => (
            <option key={ctx.context} value={ctx.context}>
              {ctx.context} · {ctx.action}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 text-xs">
        <label className="font-medium">Event</label>
        <select
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          value={eventName}
          onChange={(event) => setEventName(event.target.value)}
        >
          {EVENT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button onClick={handleSendEvent} className="w-full">
          Send Event
        </Button>
      </div>

      <div className="space-y-1 text-[0.65rem] text-muted-foreground">
        <p className="font-medium text-xs">Recent logs</p>
        <div className="max-h-20 overflow-y-auto rounded border border-border bg-muted/30 px-2 py-1">
          {hostState?.logs.slice(-6).map((logLine) => (
            <p key={logLine}>{logLine}</p>
          ))}
        </div>
      </div>
    </Card>
  )
}
