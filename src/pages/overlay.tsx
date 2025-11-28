import "@/styles/global.css"

import React from "react"
import { createRoot } from "react-dom/client"
import { OverlayButtonGrid } from "@/components/overlay-button-grid"
import { useDeckStore } from "@/lib/deck-store"
import { useEffect, useMemo, useRef, useCallback } from "react"

// Visual state stored separately from React state for double-buffering
export interface ContextVisualState {
  icon?: string
  title?: string
  status?: "ok" | "alert"
  state?: number
}

// Export for use in overlay-button-grid
export type VisualStateRef = React.MutableRefObject<Map<string, ContextVisualState>>

function OverlayPage() {
  const {
    config,
    setConfigFromMain,
  } = useDeckStore()
  
  // Double-buffer: visual state stored in ref, not React state
  // This prevents React re-renders on every setImage/setTitle event
  const visualStateRef = useRef<Map<string, ContextVisualState>>(new Map())
  
  // Refs for status timers (clear status after timeout)
  const statusTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Update visual state without triggering React re-render
  const updateVisualState = useCallback((context: string, updates: Partial<ContextVisualState>) => {
    const current = visualStateRef.current.get(context) || {}
    visualStateRef.current.set(context, { ...current, ...updates })
  }, [])

  // Clear status after timeout
  const setStatusWithTimeout = useCallback((context: string, status: "ok" | "alert") => {
    updateVisualState(context, { status })
    
    // Clear existing timer
    clearTimeout(statusTimers.current.get(context))
    
    // Set new timer to clear status
    statusTimers.current.set(
      context,
      setTimeout(() => {
        updateVisualState(context, { status: undefined })
        statusTimers.current.delete(context)
      }, 1200)
    )
  }, [updateVisualState])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    if (typeof window !== "undefined") {
      // Load config first, then apply visual state overrides from the host
      window.electron?.getConfig().then(async (cfg) => {
        if (cfg) {
          setConfigFromMain(cfg)
          
          // If allScenesAlwaysActive is enabled, send willAppear for all scenes' buttons on startup
          if (cfg.notification?.allScenesAlwaysActive && cfg.scenes) {
            cfg.scenes.forEach((scene) => {
              scene.buttons.forEach((btn) => {
                if (btn.action?.context) {
                  window.electron?.sendHostEvent({ context: btn.action.context, eventName: "willAppear" })
                }
              })
            })
          }
          
          // After config is loaded, fetch and apply visual state from host
          // This ensures plugin-set images/titles/states are applied when overlay opens
          try {
            const hostVisualState = await window.electron?.getHostVisualState()
            if (hostVisualState) {
              Object.entries(hostVisualState).forEach(([context, visual]) => {
                const updates: Partial<ContextVisualState> = {}
                if (visual.image) {
                  updates.icon = visual.image
                }
                if (typeof visual.title === "string") {
                  updates.title = visual.title
                }
                if (typeof visual.state === "number") {
                  updates.state = visual.state
                }
                if (Object.keys(updates).length > 0) {
                  updateVisualState(context, updates)
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
  }, [setConfigFromMain, updateVisualState])

  // Handle host events using double-buffer pattern
  useEffect(() => {
    const handleHostEvent = (message: { event?: string; context?: string; payload?: { title?: string; image?: string; state?: number } }) => {
      if (!message?.context) return
      const { event, context, payload } = message
      
      switch (event) {
        case "setTitle":
          if (typeof payload?.title === "string") {
            updateVisualState(context, { title: payload.title })
          }
          break
        case "setImage":
          if (typeof payload?.image === "string") {
            updateVisualState(context, { icon: payload.image })
          }
          break
        case "setState":
          updateVisualState(context, { state: payload?.state ?? 0 })
          break
        case "showAlert":
          setStatusWithTimeout(context, "alert")
          break
        case "showOk":
          setStatusWithTimeout(context, "ok")
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
  }, [updateVisualState, setStatusWithTimeout])

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

  return (
    <div className="h-screen w-screen relative bg-transparent">
      <div className="absolute" style={positionStyles}>
        <OverlayButtonGrid visualStateRef={visualStateRef} />
      </div>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<OverlayPage />)
}
