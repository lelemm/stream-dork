import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Grid3x3, Maximize2, Palette, Move, Download, Upload, Sparkles, Keyboard, Timer } from "lucide-react"
import type { OverlayPosition, AnimationDirection, AnimationStartCorner } from "@/lib/types"

export function GridSettings() {
  const {
    config,
    setGridDimensions,
    setGridSizePixels,
    setBackgroundPadding,
    setBackgroundColor,
    setBackgroundOpacity,
    setButtonRadius,
    setOverlayPosition,
    setOverlayMargin,
    setOverlayCustomPosition,
    setAnimationEnabled,
    setAnimationDuration,
    setAnimationDirection,
    setAnimationStartCorner,
    setShortcutDebounceMs,
    setAutoDismissEnabled,
    setAutoDismissDelaySeconds,
    exportConfig,
    importConfig,
  } = useDeckStore()

  const [rows, setRows] = useState(config.rows)
  const [cols, setCols] = useState(config.cols)
  const [gridSize, setGridSize] = useState(config.gridSizePixels || 400)
  const [bgPadding, setBgPadding] = useState(config.backgroundPadding || 8)
  const [bgColor, setBgColor] = useState(config.backgroundColor || "#0a0a0a")
  const [bgOpacity, setBgOpacity] = useState(config.backgroundOpacity ?? 100)
  const [btnRadius, setBtnRadius] = useState(config.buttonRadius || 16)
  const [position, setPosition] = useState<OverlayPosition>(config.overlayPosition || "bottom-right")
  const [margin, setMargin] = useState(config.overlayMargin || 20)
  const [customX, setCustomX] = useState(config.overlayCustomX || 100)
  const [customY, setCustomY] = useState(config.overlayCustomY || 100)
  // Animation settings
  const [animEnabled, setAnimEnabled] = useState(config.animationEnabled ?? true)
  const [animDuration, setAnimDuration] = useState(config.animationDuration || 250)
  const [animDirection, setAnimDirection] = useState<AnimationDirection>(config.animationDirection || "clockwise")
  const [animStartCorner, setAnimStartCorner] = useState<AnimationStartCorner>(config.animationStartCorner || "bottom-right")
  // Shortcut settings
  const [debounceMs, setDebounceMs] = useState(config.shortcutDebounceMs || 300)
  // Auto-dismiss settings
  const [autoDismiss, setAutoDismiss] = useState(config.autoDismissEnabled ?? false)
  const [dismissDelay, setDismissDelay] = useState(config.autoDismissDelaySeconds || 5)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRows(config.rows)
    setCols(config.cols)
    setGridSize(config.gridSizePixels || 400)
    setBgPadding(config.backgroundPadding || 8)
    setBgColor(config.backgroundColor || "#0a0a0a")
    setBgOpacity(config.backgroundOpacity ?? 100)
    setBtnRadius(config.buttonRadius || 16)
    setPosition(config.overlayPosition || "bottom-right")
    setMargin(config.overlayMargin || 20)
    setCustomX(config.overlayCustomX || 100)
    setCustomY(config.overlayCustomY || 100)
    setAnimEnabled(config.animationEnabled ?? true)
    setAnimDuration(config.animationDuration || 250)
    setAnimDirection(config.animationDirection || "clockwise")
    setAnimStartCorner(config.animationStartCorner || "bottom-right")
    setDebounceMs(config.shortcutDebounceMs || 300)
    setAutoDismiss(config.autoDismissEnabled ?? false)
    setDismissDelay(config.autoDismissDelaySeconds || 5)
  }, [config])

  const handleApply = () => {
    const newRows = Math.max(1, Math.min(8, rows))
    const newCols = Math.max(1, Math.min(10, cols))
    setGridDimensions(newRows, newCols)
    setGridSizePixels(Math.max(100, Math.min(2000, gridSize)))
    setBackgroundPadding(Math.max(0, Math.min(30, bgPadding)))
    setBackgroundColor(bgColor)
    setBackgroundOpacity(Math.max(0, Math.min(100, bgOpacity)))
    setButtonRadius(Math.max(0, Math.min(32, btnRadius)))
    setOverlayPosition(position)
    setOverlayMargin(Math.max(0, Math.min(200, margin)))
    setOverlayCustomPosition(customX, customY)
    // Animation settings
    setAnimationEnabled(animEnabled)
    setAnimationDuration(Math.max(50, Math.min(1000, animDuration)))
    setAnimationDirection(animDirection)
    setAnimationStartCorner(animStartCorner)
    // Shortcut settings
    setShortcutDebounceMs(Math.max(50, Math.min(1000, debounceMs)))
    // Auto-dismiss settings
    setAutoDismissEnabled(autoDismiss)
    setAutoDismissDelaySeconds(Math.max(1, Math.min(60, dismissDelay)))
  }

  const handleExport = () => {
    const json = exportConfig()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "stream-dork-config.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const json = event.target?.result as string
      const success = importConfig(json)
      if (!success) {
        alert("Invalid configuration file")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="space-y-5">
      {/* Grid Dimensions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Grid3x3 className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Grid Dimensions</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rows" className="text-xs">
              Rows
            </Label>
            <Input
              id="rows"
              type="number"
              min={1}
              max={8}
              value={rows}
              onChange={(e) => setRows(Number.parseInt(e.target.value) || 1)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cols" className="text-xs">
              Columns
            </Label>
            <Input
              id="cols"
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(e) => setCols(Number.parseInt(e.target.value) || 1)}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      {/* Grid Size */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Maximize2 className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Overlay Grid Size</h3>
        </div>
        <div>
          <Label htmlFor="gridSize" className="text-xs">
            Total Size (px)
          </Label>
          <Input
            id="gridSize"
            type="number"
            min={100}
            max={2000}
            step={50}
            value={gridSize}
            onChange={(e) => setGridSize(Number.parseInt(e.target.value) || 400)}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* Background Style */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Background Style</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="bgPadding" className="text-xs">
              Padding (px)
            </Label>
            <Input
              id="bgPadding"
              type="number"
              min={0}
              max={30}
              value={bgPadding}
              onChange={(e) => setBgPadding(Number.parseInt(e.target.value) || 0)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="btnRadius" className="text-xs">
              Button Radius (px)
            </Label>
            <Input
              id="btnRadius"
              type="number"
              min={0}
              max={32}
              value={btnRadius}
              onChange={(e) => setBtnRadius(Number.parseInt(e.target.value) || 0)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="bgColor" className="text-xs">
              Color
            </Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                id="bgColor"
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-14 h-9 p-1 cursor-pointer"
              />
              <Input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="flex-1"
                placeholder="#0a0a0a"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bgOpacity" className="text-xs">
              Opacity ({bgOpacity}%)
            </Label>
            <Input
              id="bgOpacity"
              type="range"
              min={0}
              max={100}
              value={bgOpacity}
              onChange={(e) => setBgOpacity(Number.parseInt(e.target.value))}
              className="mt-1.5 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Overlay Position */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Move className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Overlay Position</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Position Preset</Label>
            <Select value={position} onValueChange={(v) => setPosition(v as OverlayPosition)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-left">Top Left</SelectItem>
                <SelectItem value="top-right">Top Right</SelectItem>
                <SelectItem value="bottom-left">Bottom Left</SelectItem>
                <SelectItem value="bottom-right">Bottom Right</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {position !== "custom" && position !== "center" && (
            <div>
              <Label htmlFor="margin" className="text-xs">
                Margin (px)
              </Label>
              <Input
                id="margin"
                type="number"
                min={0}
                max={200}
                value={margin}
                onChange={(e) => setMargin(Number.parseInt(e.target.value) || 0)}
                className="mt-1.5"
              />
            </div>
          )}

          {position === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="customX" className="text-xs">
                  X Position (px)
                </Label>
                <Input
                  id="customX"
                  type="number"
                  min={0}
                  value={customX}
                  onChange={(e) => setCustomX(Number.parseInt(e.target.value) || 0)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="customY" className="text-xs">
                  Y Position (px)
                </Label>
                <Input
                  id="customY"
                  type="number"
                  min={0}
                  value={customY}
                  onChange={(e) => setCustomY(Number.parseInt(e.target.value) || 0)}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animation Settings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Animation</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="animEnabled" className="text-xs">
              Enable Animation
            </Label>
            <Switch
              id="animEnabled"
              checked={animEnabled}
              onCheckedChange={setAnimEnabled}
            />
          </div>

          {animEnabled && (
            <>
              <div>
                <Label htmlFor="animDuration" className="text-xs">
                  Duration (ms)
                </Label>
                <Input
                  id="animDuration"
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={animDuration}
                  onChange={(e) => setAnimDuration(Number.parseInt(e.target.value) || 250)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs">Direction</Label>
                <Select value={animDirection} onValueChange={(v) => setAnimDirection(v as AnimationDirection)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clockwise">Clockwise</SelectItem>
                    <SelectItem value="counter-clockwise">Counter-Clockwise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Start From</Label>
                <Select value={animStartCorner} onValueChange={(v) => setAnimStartCorner(v as AnimationStartCorner)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                    <SelectItem value="top-right">Top Right</SelectItem>
                    <SelectItem value="top-left">Top Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Shortcut & Behavior Settings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Shortcut & Behavior</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="debounceMs" className="text-xs">
              Shortcut Debounce (ms)
            </Label>
            <Input
              id="debounceMs"
              type="number"
              min={50}
              max={1000}
              step={50}
              value={debounceMs}
              onChange={(e) => setDebounceMs(Number.parseInt(e.target.value) || 300)}
              className="mt-1.5"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Prevents rapid toggling when holding shortcut
            </p>
          </div>
        </div>
      </div>

      {/* Auto-dismiss Settings */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Timer className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Auto-Dismiss</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="autoDismiss" className="text-xs">
              Enable Auto-Dismiss
            </Label>
            <Switch
              id="autoDismiss"
              checked={autoDismiss}
              onCheckedChange={setAutoDismiss}
            />
          </div>

          {autoDismiss && (
            <div>
              <Label htmlFor="dismissDelay" className="text-xs">
                Delay (seconds)
              </Label>
              <Input
                id="dismissDelay"
                type="number"
                min={1}
                max={60}
                value={dismissDelay}
                onChange={(e) => setDismissDelay(Number.parseInt(e.target.value) || 5)}
                className="mt-1.5"
              />
            </div>
          )}
        </div>
      </div>

      <Button onClick={handleApply} size="sm" className="w-full">
        Apply Changes
      </Button>

      {/* Import/Export */}
      <div className="pt-4 border-t border-border space-y-2">
        <Button onClick={handleExport} size="sm" variant="outline" className="w-full gap-2 bg-transparent">
          <Download className="size-4" />
          Export Config
        </Button>
        <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="outline" className="w-full gap-2">
          <Upload className="size-4" />
          Import Config
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
      </div>
    </div>
  )
}
