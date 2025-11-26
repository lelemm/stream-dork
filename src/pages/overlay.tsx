import "@/styles/global.css"

import { ButtonGrid } from "@/components/button-grid"
import { Settings } from "lucide-react"
import { useDeckStore } from "@/lib/deck-store"
import { useEffect, useMemo } from "react"

export default function OverlayPage() {
  const { config, setConfigFromMain } = useDeckStore()

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    if (typeof window !== "undefined") {
      window.electron?.getConfig().then((cfg) => {
        if (cfg) {
          setConfigFromMain(cfg)
        }
      })

      unsubscribe = window.electron?.onConfigUpdated((cfg) => {
        setConfigFromMain(cfg)
      })
    }

    return () => {
      unsubscribe?.()
    }
  }, [setConfigFromMain])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.electron?.closeOverlay()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  const positionStyles = useMemo(() => {
    const margin = config.overlayMargin || 20
    const position = config.overlayPosition || "bottom-right"

    switch (position) {
      case "top-left":
        return { top: margin, left: margin }
      case "top-right":
        return { top: margin, right: margin }
      case "bottom-left":
        return { bottom: margin, left: margin }
      case "bottom-right":
        return { bottom: margin, right: margin }
      case "center":
        return {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }
      case "custom":
        return {
          top: config.overlayCustomY || 100,
          left: config.overlayCustomX || 100,
        }
      default:
        return { bottom: margin, right: margin }
    }
  }, [config.overlayPosition, config.overlayMargin, config.overlayCustomX, config.overlayCustomY])

  return (
    <div className="h-screen w-screen relative bg-transparent">
      {/* Minimal floating settings button */}
      <button
        className="absolute top-4 right-4 z-50 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-foreground backdrop-blur-sm transition hover:border-primary"
        onClick={() => window.electron?.showSetup()}
      >
        <div className="flex items-center gap-2">
          <Settings className="size-3" />
          <span>Setup</span>
        </div>
      </button>

      {/* Button Grid positioned according to settings */}
      <div className="absolute" style={positionStyles}>
        <ButtonGrid isSetupMode={false} />
      </div>
    </div>
  )
}
