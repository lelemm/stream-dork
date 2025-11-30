import { useEffect, useCallback } from "react"
import { toast } from "sonner"

/**
 * Hook for listening to save events and showing toast notifications
 */
export function useSaveNotifications() {
  const showSaveToast = useCallback((type: string) => {
    const messages: Record<string, string> = {
      "config": "Configuration saved",
      "host-state": "Plugin settings saved",
    }
    
    const message = messages[type] || `${type} saved`
    
    toast.success(message, {
      duration: 2000,
      position: "bottom-right",
    })
  }, [])

  useEffect(() => {
    const unsubscribe = window.electron?.onSaveCompleted?.((data) => {
      showSaveToast(data.type)
    })

    return () => {
      unsubscribe?.()
    }
  }, [showSaveToast])

  return {
    showSaveToast,
  }
}

