import "@/styles/global.css"

import React from "react"
import { createRoot } from "react-dom/client"
import { OverlayButtonGrid } from "@/components/overlay-button-grid"
import { useDeckStore } from "@/lib/deck-store"
import { useEffect, useMemo, useRef, useCallback } from "react"

function OverlayPage() {
  const {
    config,
    setConfigFromMain,
    updateButtonVisualByContext,
    setButtonStatusByContext,
  } = useDeckStore()
  const statusTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  
  // Click-through handlers for transparent overlay
  const enableClickThrough = useCallback(() => {
    window.electron?.setIgnoreMouseEvents(true, true)
  }, [])
  
  const disableClickThrough = useCallback(() => {
    window.electron?.setIgnoreMouseEvents(false)
  }, [])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    if (typeof window !== "undefined") {
      // Load config first, then apply visual state overrides from the host
      window.electron?.getConfig().then(async (cfg) => {
        if (cfg) {
          setConfigFromMain(cfg)
          
          // After config is loaded, fetch and apply visual state from host
          // This ensures plugin-set images/titles/states are applied when overlay opens
          try {
            const visualState = await window.electron?.getHostVisualState()
            if (visualState) {
              Object.entries(visualState).forEach(([context, visual]) => {
                const updates: { icon?: string; label?: string; state?: number } = {}
                if (visual.image) {
                  updates.icon = visual.image
                }
                if (typeof visual.title === "string") {
                  updates.label = visual.title
                }
                if (typeof visual.state === "number") {
                  updates.state = visual.state
                }
                if (Object.keys(updates).length > 0) {
                  updateButtonVisualByContext(context, updates)
                }
              })
            }
          } catch (err) {
            console.error("Failed to load visual state:", err)
          }
        }
      })

      unsubscribe = window.electron?.onConfigUpdated((cfg) => {
        setConfigFromMain(cfg)
      })
    }

    return () => {
      unsubscribe?.()
    }
  }, [setConfigFromMain, updateButtonVisualByContext])

  useEffect(() => {
    const handleHostEvent = (message: { event: string; context: string; payload?: Record<string, unknown> }) => {
      if (!message?.context) return
      const { event, context, payload } = message
      switch (event) {
        case "setTitle":
          if (typeof payload?.title === "string") {
            updateButtonVisualByContext(context, { label: payload.title as string })
          }
          break
        case "setImage":
          if (typeof payload?.image === "string") {
            updateButtonVisualByContext(context, { icon: payload.image as string })
          }
          break
        case "setState":
          updateButtonVisualByContext(context, { state: (payload?.state as number) ?? 0 })
          break
        case "showAlert":
          updateButtonVisualByContext(context, { status: "alert" })
          clearTimeout(statusTimers.current.get(context))
          statusTimers.current.set(
            context,
            setTimeout(() => {
              setButtonStatusByContext(context, undefined)
              statusTimers.current.delete(context)
            }, 1200),
          )
          break
        case "showOk":
          updateButtonVisualByContext(context, { status: "ok" })
          clearTimeout(statusTimers.current.get(context))
          statusTimers.current.set(
            context,
            setTimeout(() => {
              setButtonStatusByContext(context, undefined)
              statusTimers.current.delete(context)
            }, 1200),
          )
          break
        default:
          break
      }
    }

    const unsubscribe = window.electron?.onHostEvent(handleHostEvent)
    return () => {
      unsubscribe?.()
      statusTimers.current.forEach((timer) => clearTimeout(timer))
      statusTimers.current.clear()
    }
  }, [updateButtonVisualByContext, setButtonStatusByContext])

  // Note: Keyboard handling is now done by OverlayButtonGrid component

  const positionStyles = useMemo((): React.CSSProperties => {
    const margin = config.overlayMargin || 20
    const position = config.overlayPosition || "bottom-right"

    // Explicitly set all position properties to avoid React inline style persistence issues
    // When switching from "center" to another position, old top/left values would persist
    const baseStyles: React.CSSProperties = {
      top: undefined,
      left: undefined,
      bottom: undefined,
      right: undefined,
      transform: undefined,
    }

    switch (position) {
      case "top-left":
        return { ...baseStyles, top: margin, left: margin }
      case "top-right":
        return { ...baseStyles, top: margin, right: margin }
      case "bottom-left":
        return { ...baseStyles, bottom: margin, left: margin }
      case "bottom-right":
        return { ...baseStyles, bottom: margin, right: margin }
      case "center":
        return {
          ...baseStyles,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }
      case "custom":
        return {
          ...baseStyles,
          top: config.overlayCustomY || 100,
          left: config.overlayCustomX || 100,
        }
      default:
        return { ...baseStyles, bottom: margin, right: margin }
    }
  }, [config.overlayPosition, config.overlayMargin, config.overlayCustomX, config.overlayCustomY])

  // Enable click-through by default when overlay becomes visible
  useEffect(() => {
    const unsubscribe = window.electron?.onOverlayVisibility(({ visible }: { visible: boolean }) => {
      if (visible) {
        // Start with click-through enabled so transparent areas don't block
        enableClickThrough()
      }
    })
    return () => unsubscribe?.()
  }, [enableClickThrough])

  return (
    <div className="h-screen w-screen relative bg-transparent">
      <div 
        className="absolute" 
        style={positionStyles}
      >
        {/* Extra wrapper with padding to include floating UI elements (scene picker, search indicator) 
            that are positioned with negative top values outside the grid bounds */}
        <div
          className="pt-24 -mt-24"
          onMouseEnter={disableClickThrough}
          onMouseLeave={enableClickThrough}
        >
          <OverlayButtonGrid />
        </div>
      </div>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<OverlayPage />)
}
