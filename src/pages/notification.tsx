import "@/styles/global.css"

import { useState, useEffect, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import type { NotificationSettings } from "@/lib/types"

interface NotificationData {
  id: string
  context: string
  event: "setTitle" | "setImage" | "showOk" | "showAlert"
  icon?: string
  title?: string
  backgroundColor?: string
  textColor?: string
  status?: "ok" | "alert"
  createdAt: number
}

const defaultSettings: NotificationSettings = {
  enabled: true,
  dismissOnClick: false,
  autoDismissSeconds: 5,
  fanDirection: "vertical",
  alwaysFanOut: false,
  clickThrough: false,
  hoverOpacity: 100,
}

function NotificationIcon({ 
  data, 
  index, 
  total, 
  isExpanded,
  isHovered,
  opacity,
  fanDirection,
  hoverOpacity,
  onClick,
}: { 
  data: NotificationData
  index: number
  total: number
  isExpanded: boolean
  isHovered: boolean
  opacity: number
  fanDirection: "vertical" | "horizontal"
  hoverOpacity: number
  onClick?: () => void
}) {
  const buttonSize = 72
  const radius = 14
  const innerPadding = 3
  const innerRadius = Math.max(radius - 3, 4)

  // Calculate position based on whether expanded or stacked
  const reverseIndex = total - 1 - index // 0 = newest (on top)
  
  // Stack offset calculations
  const stackOffsetX = reverseIndex * 8 // Horizontal offset when stacked
  const stackOffsetY = reverseIndex * 4 // Slight vertical offset when stacked
  
  // Expanded offset based on fan direction
  const expandedOffsetX = fanDirection === "horizontal" ? reverseIndex * (buttonSize + 8) : 0
  const expandedOffsetY = fanDirection === "vertical" ? reverseIndex * (buttonSize + 8) : 0
  
  const translateX = isExpanded ? -expandedOffsetX : -stackOffsetX
  const translateY = isExpanded ? -expandedOffsetY : -stackOffsetY
  const rotate = isExpanded ? 0 : reverseIndex * 3 // Slight rotation when stacked
  const scale = isExpanded ? 1 : Math.max(0.95 - reverseIndex * 0.03, 0.85)
  
  // Cards further back are slightly dimmer when stacked
  const stackOpacity = isExpanded ? 1 : Math.max(1 - reverseIndex * 0.15, 0.5)
  
  // Apply hover opacity (make semi-transparent when hovering)
  const finalOpacity = isHovered ? (opacity * stackOpacity * hoverOpacity / 100) : (opacity * stackOpacity)

  return (
    <div
      className="absolute bottom-0 right-0 transition-all duration-300 ease-out cursor-pointer"
      style={{
        width: buttonSize,
        height: buttonSize,
        transform: `translateX(${translateX}px) translateY(${translateY}px) rotate(${rotate}deg) scale(${scale})`,
        opacity: finalOpacity,
        zIndex: total - reverseIndex,
        transformOrigin: "bottom right",
      }}
      onClick={onClick}
    >
      <div
        className="relative flex items-center justify-center w-full h-full"
        style={{
          borderRadius: `${radius}px`,
          backgroundColor: data.backgroundColor || "rgba(26, 26, 26, 0.98)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Inner button with bevel effect */}
        <div
          className="absolute flex items-center justify-center flex-col gap-0.5"
          style={{
            inset: `${innerPadding}px`,
            borderRadius: `${innerRadius}px`,
            background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.1) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.2)",
          }}
        >
          {/* Icon */}
          {data.icon && (data.icon.startsWith("data:") || data.icon.startsWith("http")) ? (
            <img
              src={data.icon}
              alt={data.title || "Button icon"}
              className="size-8 object-contain"
            />
          ) : (
            <div
              className="text-xl"
              style={{ color: data.textColor || "#ffffff" }}
            >
              {data.icon || "🎮"}
            </div>
          )}

          {/* Title - only show when expanded or single item */}
          {data.title && (isExpanded || total === 1) && (
            <p
              className="text-[8px] font-medium text-center line-clamp-1 px-1"
              style={{ color: data.textColor || "#ffffff" }}
            >
              {data.title}
            </p>
          )}

          {/* Status indicator */}
          {data.status && (
            <span
              className="absolute top-0.5 right-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase animate-pulse"
              style={{
                backgroundColor: data.status === "alert" ? "#f97316" : "#22c55e",
                color: "#000",
              }}
            >
              {data.status === "alert" ? "!" : "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationPage() {
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [opacities, setOpacities] = useState<Map<string, number>>(new Map())
  const [isHovered, setIsHovered] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const FADE_DURATION = 300 // 300ms fade
  const MAX_NOTIFICATIONS = 5 // Maximum notifications to show

  // Computed values
  const displayDuration = (settings.autoDismissSeconds ?? 5) * 1000
  const isExpanded = settings.alwaysFanOut || isHovered
  const fanDirection = settings.fanDirection ?? "vertical"
  const hoverOpacity = settings.hoverOpacity ?? 100

  const removeNotification = useCallback((id: string) => {
    // Clear any existing timers for this notification
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    const fadeTimer = fadeTimersRef.current.get(id)
    if (fadeTimer) {
      clearTimeout(fadeTimer)
      fadeTimersRef.current.delete(id)
    }

    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id)
      if (next.length === 0) {
        window.electron?.hideNotification?.()
      }
      return next
    })
    setOpacities((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const startFadeOut = useCallback((id: string) => {
    // Start fade out
    setOpacities((prev) => {
      const next = new Map(prev)
      next.set(id, 0)
      return next
    })

    // Remove after fade completes
    const fadeTimer = setTimeout(() => {
      removeNotification(id)
    }, FADE_DURATION)
    fadeTimersRef.current.set(id, fadeTimer)
  }, [removeNotification])

  const startTimer = useCallback((id: string, duration?: number) => {
    // Clear existing timer if any
    const existingTimer = timersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Start new timer
    const timer = setTimeout(() => {
      startFadeOut(id)
    }, duration ?? displayDuration)
    timersRef.current.set(id, timer)
  }, [startFadeOut, displayDuration])

  const handleDismiss = useCallback((id: string) => {
    if (settings.dismissOnClick) {
      startFadeOut(id)
    }
  }, [settings.dismissOnClick, startFadeOut])

  const addNotification = useCallback((data: Omit<NotificationData, "id" | "createdAt">) => {
    const id = `${data.context}-${Date.now()}`
    const newNotification: NotificationData = {
      ...data,
      id,
      createdAt: Date.now(),
    }

    setNotifications((prev) => {
      // Check if we already have a notification for this context
      const existingIndex = prev.findIndex((n) => n.context === data.context)
      
      let next: NotificationData[]
      if (existingIndex >= 0) {
        // Update existing notification for this context
        const oldId = prev[existingIndex].id
        
        // Clear old timers
        const oldTimer = timersRef.current.get(oldId)
        if (oldTimer) {
          clearTimeout(oldTimer)
          timersRef.current.delete(oldId)
        }
        const oldFadeTimer = fadeTimersRef.current.get(oldId)
        if (oldFadeTimer) {
          clearTimeout(oldFadeTimer)
          fadeTimersRef.current.delete(oldId)
        }
        
        // Remove old opacity
        setOpacities((prev) => {
          const next = new Map(prev)
          next.delete(oldId)
          return next
        })
        
        // Remove old and add new at the end (newest)
        next = [...prev.filter((n) => n.context !== data.context), newNotification]
      } else {
        // Add new notification
        next = [...prev, newNotification]
      }
      
      // Limit to max notifications
      if (next.length > MAX_NOTIFICATIONS) {
        const removed = next.shift()
        if (removed) {
          const timer = timersRef.current.get(removed.id)
          if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(removed.id)
          }
        }
      }
      
      return next
    })

    // Set opacity to 1 with a slight delay for animation
    requestAnimationFrame(() => {
      setOpacities((prev) => {
        const next = new Map(prev)
        next.set(id, 1)
        return next
      })
    })

    // Start the hide timer
    startTimer(id)

    return id
  }, [startTimer])

  // Load initial config
  useEffect(() => {
    window.electron?.getNotificationConfig?.().then((config) => {
      if (config) {
        setSettings(config)
      }
    })
  }, [])

  // Listen for config updates
  useEffect(() => {
    const unsubscribe = window.electron?.onNotificationConfig?.((config) => {
      if (config) {
        setSettings(config)
      }
    })
    return () => unsubscribe?.()
  }, [])

  // Listen for notifications
  useEffect(() => {
    const handleNotification = (data: Omit<NotificationData, "id" | "createdAt">) => {
      addNotification(data)
    }

    const unsubscribe = window.electron?.onNotification?.(handleNotification)

    return () => {
      unsubscribe?.()
    }
  }, [addNotification])

  // Listen for dismiss requests
  useEffect(() => {
    const handleDismissRequest = ({ id }: { id: string }) => {
      startFadeOut(id)
    }

    const unsubscribe = window.electron?.onDismissNotification?.(handleDismissRequest)
    return () => unsubscribe?.()
  }, [startFadeOut])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
      fadeTimersRef.current.forEach((timer) => clearTimeout(timer))
      fadeTimersRef.current.clear()
    }
  }, [])

  // Pause timers when hovered (unless alwaysFanOut is true, then timers keep running)
  useEffect(() => {
    if (isHovered && !settings.alwaysFanOut) {
      // Pause all timers
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    } else if (!isHovered && !settings.alwaysFanOut) {
      // Restart timers for all notifications
      notifications.forEach((n) => {
        const elapsed = Date.now() - n.createdAt
        const remaining = Math.max(displayDuration - elapsed, 500)
        
        const timer = setTimeout(() => {
          startFadeOut(n.id)
        }, remaining)
        timersRef.current.set(n.id, timer)
      })
    }
  }, [isHovered, notifications, startFadeOut, displayDuration, settings.alwaysFanOut])

  if (notifications.length === 0) {
    return null
  }

  // Calculate container size based on whether expanded and fan direction
  const buttonSize = 72
  const margin = 16
  
  let containerWidth: number
  let containerHeight: number
  
  if (isExpanded) {
    if (fanDirection === "horizontal") {
      containerWidth = buttonSize + (notifications.length - 1) * (buttonSize + 8)
      containerHeight = buttonSize
    } else {
      containerWidth = buttonSize
      containerHeight = buttonSize + (notifications.length - 1) * (buttonSize + 8)
    }
  } else {
    containerWidth = buttonSize + (notifications.length - 1) * 8
    containerHeight = buttonSize + (notifications.length - 1) * 4
  }

  return (
    <div 
      className="h-screen w-screen flex items-end justify-end"
      style={{ 
        background: "transparent",
        padding: margin,
      }}
    >
      <div
        className="relative"
        style={{
          width: containerWidth,
          height: containerHeight,
          transition: "width 300ms ease-out, height 300ms ease-out",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {notifications.map((notification, index) => (
          <NotificationIcon
            key={notification.id}
            data={notification}
            index={index}
            total={notifications.length}
            isExpanded={isExpanded}
            isHovered={isHovered}
            opacity={opacities.get(notification.id) ?? 0}
            fanDirection={fanDirection}
            hoverOpacity={hoverOpacity}
            onClick={() => handleDismiss(notification.id)}
          />
        ))}
      </div>
    </div>
  )
}

// Mount the app
const container = document.getElementById("root")
if (container) {
  createRoot(container).render(<NotificationPage />)
}
