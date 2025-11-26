import { useState, useEffect } from "react"
import { useDeckStore } from "@/lib/deck-store"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Paintbrush, Settings, Trash2 } from "lucide-react"

export function ButtonConfigPanel() {
  const { selectedButton, updateButton, removeButton } = useDeckStore()
  const [label, setLabel] = useState("")
  const [icon, setIcon] = useState("")
  const [bgColor, setBgColor] = useState("#1f1f1f")
  const [textColor, setTextColor] = useState("#ffffff")
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    if (selectedButton) {
      setLabel(selectedButton.label || "")
      setIcon(selectedButton.icon || "")
      setBgColor(selectedButton.backgroundColor || "#1f1f1f")
      setTextColor(selectedButton.textColor || "#ffffff")
      setActionConfig(selectedButton.action?.config || {})
    }
  }, [selectedButton])

  if (!selectedButton) {
    return (
      <Card className="p-6 h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Settings className="size-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a button to configure</p>
        </div>
      </Card>
    )
  }

  const handleSave = () => {
    updateButton(selectedButton.id, {
      label,
      icon,
      backgroundColor: bgColor,
      textColor,
      action: selectedButton.action ? { ...selectedButton.action, config: actionConfig } : undefined,
    })
  }

  const handleDelete = () => {
    removeButton(selectedButton.id)
  }

  const getActionFields = () => {
    switch (selectedButton.action?.type) {
      case "hotkey":
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="keys" className="text-xs">
                Keyboard Shortcut
              </Label>
              <Input
                id="keys"
                placeholder="Ctrl+C"
                value={actionConfig.keys || ""}
                onChange={(e) => setActionConfig({ ...actionConfig, keys: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
        )
      case "open-url":
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="url" className="text-xs">
                URL
              </Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={actionConfig.url || ""}
                onChange={(e) => setActionConfig({ ...actionConfig, url: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
        )
      case "run-command":
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="command" className="text-xs">
                Command
              </Label>
              <Input
                id="command"
                placeholder="npm run dev"
                value={actionConfig.command || ""}
                onChange={(e) => setActionConfig({ ...actionConfig, command: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Button Configuration</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          className="size-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="appearance" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="appearance" className="text-xs">
            <Paintbrush className="size-3 mr-1.5" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="action" className="text-xs">
            <Settings className="size-3 mr-1.5" />
            Action
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="flex-1 space-y-4">
          <div>
            <Label htmlFor="icon" className="text-xs">
              Icon (Emoji)
            </Label>
            <Input
              id="icon"
              placeholder="🎮"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="label" className="text-xs">
              Label
            </Label>
            <Input
              id="label"
              placeholder="Button Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bgColor" className="text-xs">
                Background
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="bgColor"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="textColor" className="text-xs">
                Text Color
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  id="textColor"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-12 h-9 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="flex-1 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="action" className="flex-1 space-y-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs font-medium mb-1">Action Type</p>
            <p className="text-sm text-primary capitalize">{selectedButton.action?.type || "None"}</p>
          </div>

          {getActionFields()}
        </TabsContent>
      </Tabs>

      <Button onClick={handleSave} className="w-full mt-4">
        Save Changes
      </Button>
    </Card>
  )
}
