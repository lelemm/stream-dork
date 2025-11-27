import "@/styles/global.css"

import React from "react"
import { createRoot } from "react-dom/client"
import { OverlayButtonGrid } from "@/components/overlay-button-grid"
import { useDeckStore } from "@/lib/deck-store"
import { useEffect, useMemo, useRef } from "react"

function OverlayPage() {
  const {
    config,
    setConfigFromMain,
    updateButtonByContext,
    setButtonStatusByContext,
  } = useDeckStore()
  const statusTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

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
    const handleHostEvent = (message) => {
      if (!message?.context) return
      const { event, context, payload } = message
      switch (event) {
        case "setTitle":
          if (typeof payload?.title === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              label: payload.title,
            }))
          }
          break
        case "setImage":
          if (typeof payload?.image === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              icon: payload.image,
            }))
          }
          break
        case "setState":
          updateButtonByContext(context, (button) => ({
            ...button,
            action: button.action ? { ...button.action, state: payload?.state ?? 0 } : button.action,
          }))
          break
        case "showAlert":
          updateButtonByContext(context, (button) => ({ ...button, status: "alert" }))
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
          updateButtonByContext(context, (button) => ({ ...button, status: "ok" }))
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
  }, [updateButtonByContext, setButtonStatusByContext])

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
        <OverlayButtonGrid />
      </div>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<OverlayPage />)
}
