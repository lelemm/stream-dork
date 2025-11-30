import { useState, useEffect, useCallback, useRef } from "react"
import { useDeckStore } from "@/lib/deck-store"
import type { HostState } from "@/types/electron"

/**
 * Hook for managing host state and events in the setup page
 */
export function useHostState() {
  const { selectedButton, updateButtonByContext, setButtonStatusByContext } = useDeckStore()
  const [hostState, setHostState] = useState<HostState | null>(null)
  const statusTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const refreshHostState = useCallback(async () => {
    try {
      const state = await window.electron?.getHostState()
      if (state) {
        console.log("[useHostState] refreshHostState(): received state", {
          pluginCount: state.plugins?.length ?? 0,
          contextCount: state.contexts?.length ?? 0,
        })
        setHostState(state)
      }
    } catch (error) {
      console.error("Unable to refresh host state", error)
    }
  }, [])

  // Initial load
  useEffect(() => {
    window.electron?.getHostState().then((state) => {
      console.log("[useHostState] initial getHostState()", {
        hasState: !!state,
        pluginCount: state?.plugins?.length ?? 0,
      })
      setHostState(state)
    })
  }, [])

  // Refresh host state when selected button changes to get fresh settings
  useEffect(() => {
    if (selectedButton?.action?.context) {
      refreshHostState()
    }
  }, [selectedButton?.action?.context, refreshHostState])

  // Listen for host events
  useEffect(() => {
    const handleHostEvent = (message: {
      event?: string
      context?: string
      payload?: {
        title?: string
        image?: string
        state?: number
        settings?: Record<string, unknown>
      }
    }) => {
      if (!message?.context) return
      const { event, context, payload } = message
      
      switch (event) {
        case "didReceiveSettings":
          // Settings changed - refresh host state to get updated context settings
          refreshHostState()
          break
        case "setTitle":
          if (typeof payload?.title === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              label: payload.title!,
            }))
          }
          break
        case "setImage":
          if (typeof payload?.image === "string") {
            updateButtonByContext(context, (button) => ({
              ...button,
              icon: payload.image!,
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
  }, [updateButtonByContext, setButtonStatusByContext, refreshHostState])

  return {
    hostState,
    refreshHostState,
  }
}

