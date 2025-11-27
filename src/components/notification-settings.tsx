import { useState, useEffect } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Bell, BellOff, MousePointer, Timer, Layers, Eye } from "lucide-react"
import type { NotificationFanDirection } from "@/lib/types"

export function NotificationSettings() {
  const { config, setNotificationSettings } = useDeckStore()

  // Local state for form
  const [enabled, setEnabled] = useState(config.notification?.enabled ?? true)
  const [dismissOnClick, setDismissOnClick] = useState(config.notification?.dismissOnClick ?? false)
  const [autoDismissSeconds, setAutoDismissSeconds] = useState(config.notification?.autoDismissSeconds ?? 5)
  const [fanDirection, setFanDirection] = useState<NotificationFanDirection>(config.notification?.fanDirection ?? "vertical")
  const [alwaysFanOut, setAlwaysFanOut] = useState(config.notification?.alwaysFanOut ?? false)
  const [clickThrough, setClickThrough] = useState(config.notification?.clickThrough ?? false)
  const [hoverOpacity, setHoverOpacity] = useState(config.notification?.hoverOpacity ?? 100)

  // Sync with config changes
  useEffect(() => {
    setEnabled(config.notification?.enabled ?? true)
    setDismissOnClick(config.notification?.dismissOnClick ?? false)
    setAutoDismissSeconds(config.notification?.autoDismissSeconds ?? 5)
    setFanDirection(config.notification?.fanDirection ?? "vertical")
    setAlwaysFanOut(config.notification?.alwaysFanOut ?? false)
    setClickThrough(config.notification?.clickThrough ?? false)
    setHoverOpacity(config.notification?.hoverOpacity ?? 100)
  }, [config.notification])

  const handleApply = () => {
    setNotificationSettings({
      enabled,
      dismissOnClick,
      autoDismissSeconds: Math.max(1, Math.min(60, autoDismissSeconds)),
      fanDirection,
      alwaysFanOut,
      clickThrough,
      hoverOpacity: Math.max(10, Math.min(100, hoverOpacity)),
    })
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Bell className="size-4" />
        <span>Notification Settings</span>
      </div>

      {/* Enable/Disable Notifications */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="notification-enabled" className="text-xs flex items-center gap-2">
            {enabled ? <Bell className="size-3" /> : <BellOff className="size-3" />}
            Enable Notifications
          </Label>
          <Switch
            id="notification-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Show icon notifications when plugins send events
        </p>
      </div>

      {enabled && (
        <>
          {/* Auto-dismiss Timer */}
          <div className="space-y-2">
            <Label htmlFor="auto-dismiss-seconds" className="text-xs flex items-center gap-2">
              <Timer className="size-3" />
              Auto-dismiss (seconds)
            </Label>
            <Input
              id="auto-dismiss-seconds"
              type="number"
              min={1}
              max={60}
              value={autoDismissSeconds}
              onChange={(e) => setAutoDismissSeconds(Number(e.target.value))}
              className="h-8"
            />
            <p className="text-[10px] text-muted-foreground">
              How long notifications stay visible (1-60 seconds)
            </p>
          </div>

          {/* Dismiss on Click */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="dismiss-on-click" className="text-xs flex items-center gap-2">
                <MousePointer className="size-3" />
                Dismiss on Click
              </Label>
              <Switch
                id="dismiss-on-click"
                checked={dismissOnClick}
                onCheckedChange={setDismissOnClick}
                disabled={clickThrough}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click a notification to dismiss it immediately
            </p>
          </div>

          {/* Click Through */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="click-through" className="text-xs flex items-center gap-2">
                <MousePointer className="size-3" />
                Click Through
              </Label>
              <Switch
                id="click-through"
                checked={clickThrough}
                onCheckedChange={(checked) => {
                  setClickThrough(checked)
                  if (checked) {
                    setDismissOnClick(false)
                  }
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Mouse clicks pass through notifications to windows below
            </p>
          </div>

          {/* Fan Direction */}
          <div className="space-y-2">
            <Label htmlFor="fan-direction" className="text-xs flex items-center gap-2">
              <Layers className="size-3" />
              Fan Direction
            </Label>
            <Select value={fanDirection} onValueChange={(v) => setFanDirection(v as NotificationFanDirection)}>
              <SelectTrigger id="fan-direction" className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical (upward)</SelectItem>
                <SelectItem value="horizontal">Horizontal (leftward)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Direction cards fan out when expanded
            </p>
          </div>

          {/* Always Fan Out */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="always-fan-out" className="text-xs flex items-center gap-2">
                <Layers className="size-3" />
                Always Expanded
              </Label>
              <Switch
                id="always-fan-out"
                checked={alwaysFanOut}
                onCheckedChange={setAlwaysFanOut}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Show cards fanned out instead of stacked (no hover needed)
            </p>
          </div>

          {/* Hover Opacity */}
          <div className="space-y-2">
            <Label htmlFor="hover-opacity" className="text-xs flex items-center gap-2">
              <Eye className="size-3" />
              Hover Opacity: {hoverOpacity}%
            </Label>
            <Slider
              id="hover-opacity"
              min={10}
              max={100}
              step={5}
              value={[hoverOpacity]}
              onValueChange={([value]) => setHoverOpacity(value)}
              disabled={clickThrough}
            />
            <p className="text-[10px] text-muted-foreground">
              Transparency when hovering over notifications (see through to desktop)
            </p>
          </div>
        </>
      )}

      {/* Apply Button */}
      <Button onClick={handleApply} size="sm" className="w-full">
        Apply Notification Settings
      </Button>
    </div>
  )
}

