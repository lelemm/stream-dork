import { useEffect, useState } from "react"
import { useDeckStore } from "@/lib/deck-store"

/**
 * Hook for managing setup page config initialization
 */
export function useSetupConfig() {
  const { setConfigFromMain } = useDeckStore()
  const [showControlPanel, setShowControlPanel] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    if (typeof window !== "undefined") {
      // Load initial config
      window.electron?.getConfig().then((cfg) => {
        if (cfg) {
          setConfigFromMain(cfg)
        }
        setIsLoading(false)
      }).catch(() => {
        setIsLoading(false)
      })

      // Check for control panel flag
      window.electron?.getAppFlags?.().then((flags) => {
        if (flags?.showControlPanel) {
          setShowControlPanel(true)
        }
      })

      // Subscribe to config updates
      unsubscribe = window.electron?.onConfigUpdated((cfg) => {
        setConfigFromMain(cfg)
      })
    }

    return () => {
      unsubscribe?.()
    }
  }, [setConfigFromMain])

  return {
    showControlPanel,
    isLoading,
  }
}

