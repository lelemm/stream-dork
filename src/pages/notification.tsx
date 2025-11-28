import "@/styles/global.css"

import { useState, useEffect, useCallback, useRef, memo } from "react"
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

// Visual state stored separately from React state for double-buffering
interface VisualState {
  icon?: string
  title?: string
  backgroundColor?: string
  textColor?: string
  status?: "ok" | "alert"
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

// Memoized notification icon that uses refs for visual updates
const NotificationIcon = memo(function NotificationIcon({ 
  data, 
  index, 
  total, 
  isExpanded,
  isHovered,
  opacity,
  fanDirection,
  hoverOpacity,
  onClick,
  visualStateRef,
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
  visualStateRef: React.MutableRefObject<Map<string, VisualState>>
}) {
  const buttonSize = 72
  const radius = 14
  const innerPadding = 3
  const innerRadius = Math.max(radius - 3, 4)

  // Refs for direct DOM manipulation
  const iconImgRef = useRef<HTMLImageElement>(null)
  const iconTextRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  // Update DOM directly via RAF when visual state changes
  useEffect(() => {
    let rafId: number
    let lastState: VisualState | undefined

    const updateVisuals = () => {
      const state = visualStateRef.current.get(data.id)
      if (!state || state === lastState) {
        rafId = requestAnimationFrame(updateVisuals)
        return
      }
      lastState = state

      // Update icon
      const iconSrc = state.icon ?? data.icon
      if (iconImgRef.current && iconSrc && (iconSrc.startsWith("data:") || iconSrc.startsWith("http"))) {
        iconImgRef.current.src = iconSrc
        iconImgRef.current.style.display = "block"
        if (iconTextRef.current) iconTextRef.current.style.display = "none"
      } else if (iconTextRef.current) {
        iconTextRef.current.textContent = iconSrc || "🎮"
        iconTextRef.current.style.display = "block"
        if (iconImgRef.current) iconImgRef.current.style.display = "none"
      }

      // Update title
      if (titleRef.current) {
        const title = state.title ?? data.title
        titleRef.current.textContent = title || ""
        titleRef.current.style.display = title && (isExpanded || total === 1) ? "block" : "none"
      }

      // Update status
      if (statusRef.current) {
        const status = state.status ?? data.status
        if (status) {
          statusRef.current.style.display = "flex"
          statusRef.current.style.backgroundColor = status === "alert" ? "#f97316" : "#22c55e"
          statusRef.current.textContent = status === "alert" ? "!" : "✓"
        } else {
          statusRef.current.style.display = "none"
        }
      }

      // Update background color
      if (containerRef.current) {
        const bgColor = state.backgroundColor ?? data.backgroundColor ?? "rgba(26, 26, 26, 0.98)"
        containerRef.current.style.backgroundColor = bgColor
      }

      // Update text color
      const textColor = state.textColor ?? data.textColor ?? "#ffffff"
      if (iconTextRef.current) iconTextRef.current.style.color = textColor
      if (titleRef.current) titleRef.current.style.color = textColor

      rafId = requestAnimationFrame(updateVisuals)
    }

    rafId = requestAnimationFrame(updateVisuals)
    return () => cancelAnimationFrame(rafId)
  }, [data.id, data.icon, data.title, data.backgroundColor, data.textColor, data.status, isExpanded, total, visualStateRef])

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

  // Get initial visual state
  const initialVisual = visualStateRef.current.get(data.id) || {}
  const initialIcon = initialVisual.icon ?? data.icon
  const isImageIcon = initialIcon && (initialIcon.startsWith("data:") || initialIcon.startsWith("http"))

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
        ref={containerRef}
        className="relative flex items-center justify-center w-full h-full"
        style={{
          borderRadius: `${radius}px`,
          backgroundColor: initialVisual.backgroundColor ?? data.backgroundColor ?? "rgba(26, 26, 26, 0.98)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Inner button with bevel effect */}
        <div
          ref={innerRef}
          className="absolute flex items-center justify-center flex-col gap-0.5"
          style={{
            inset: `${innerPadding}px`,
            borderRadius: `${innerRadius}px`,
            background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.1) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.2)",
          }}
        >
          {/* Icon - image version */}
          <img
            ref={iconImgRef}
            src={isImageIcon ? initialIcon : ""}
            alt={data.title || "Button icon"}
            className="size-8 object-contain"
            style={{ display: isImageIcon ? "block" : "none" }}
          />
          
          {/* Icon - text/emoji version */}
          <div
            ref={iconTextRef}
            className="text-xl"
            style={{ 
              color: initialVisual.textColor ?? data.textColor ?? "#ffffff",
              display: isImageIcon ? "none" : "block"
            }}
          >
            {initialIcon || "🎮"}
          </div>

          {/* Title - only show when expanded or single item */}
          <p
            ref={titleRef}
            className="text-[8px] font-medium text-center line-clamp-1 px-1"
            style={{ 
              color: initialVisual.textColor ?? data.textColor ?? "#ffffff",
              display: (initialVisual.title ?? data.title) && (isExpanded || total === 1) ? "block" : "none"
            }}
          >
            {initialVisual.title ?? data.title ?? ""}
          </p>

          {/* Status indicator */}
          <span
            ref={statusRef}
            className="absolute top-0.5 right-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase animate-pulse items-center justify-center"
            style={{
              backgroundColor: (initialVisual.status ?? data.status) === "alert" ? "#f97316" : "#22c55e",
              color: "#000",
              display: (initialVisual.status ?? data.status) ? "flex" : "none",
            }}
          >
            {(initialVisual.status ?? data.status) === "alert" ? "!" : "✓"}
          </span>
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render for structural/layout changes, NOT visual updates
  return (
    prevProps.data.id === nextProps.data.id &&
    prevProps.index === nextProps.index &&
    prevProps.total === nextProps.total &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.opacity === nextProps.opacity &&
    prevProps.fanDirection === nextProps.fanDirection &&
    prevProps.hoverOpacity === nextProps.hoverOpacity
  )
})

function NotificationPage() {
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [opacities, setOpacities] = useState<Map<string, number>>(new Map())
  const [isHovered, setIsHovered] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  
  // Double-buffer: visual state stored in ref, not React state
  const visualStateRef = useRef<Map<string, VisualState>>(new Map())
  // Map context -> notification id for quick lookups
  const contextToIdRef = useRef<Map<string, string>>(new Map())
  // Track last activity time per notification (for timer calculations after hover)
  const lastActivityRef = useRef<Map<string, number>>(new Map())

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

    // Clean up visual state, context mapping, and activity tracking
    const notification = notifications.find(n => n.id === id)
    if (notification) {
      contextToIdRef.current.delete(notification.context)
    }
    visualStateRef.current.delete(id)
    lastActivityRef.current.delete(id)

    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id)
      if (next.length === 0) {
        window.electron?.hideNotification()
      }
      return next
    })
    setOpacities((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [notifications])

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

    // Update last activity time (used for remaining time calculation after hover)
    lastActivityRef.current.set(id, Date.now())

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

  // Update visual state for an existing notification (double-buffer pattern)
  const updateVisualState = useCallback((id: string, updates: Partial<VisualState>) => {
    const current = visualStateRef.current.get(id) || {}
    visualStateRef.current.set(id, { ...current, ...updates })
  }, [])

  const addOrUpdateNotification = useCallback((data: Omit<NotificationData, "id" | "createdAt">) => {
    // Check if we already have a notification for this context
    const existingId = contextToIdRef.current.get(data.context)
    
    if (existingId) {
      // UPDATE existing notification - just update visual state, no React re-render
      updateVisualState(existingId, {
        icon: data.icon,
        title: data.title,
        backgroundColor: data.backgroundColor,
        textColor: data.textColor,
        status: data.status,
      })
      
      // Restart the dismiss timer
      startTimer(existingId)
      
      return existingId
    }
    
    // CREATE new notification
    const id = `${data.context}-${Date.now()}`
    const newNotification: NotificationData = {
      ...data,
      id,
      createdAt: Date.now(),
    }

    // Set up context -> id mapping
    contextToIdRef.current.set(data.context, id)
    
    // Initialize visual state
    visualStateRef.current.set(id, {
      icon: data.icon,
      title: data.title,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      status: data.status,
    })

    setNotifications((prev) => {
      let next = [...prev, newNotification]
      
      // Limit to max notifications
      if (next.length > MAX_NOTIFICATIONS) {
        const removed = next.shift()
        if (removed) {
          const timer = timersRef.current.get(removed.id)
          if (timer) {
            clearTimeout(timer)
            timersRef.current.delete(removed.id)
          }
          contextToIdRef.current.delete(removed.context)
          visualStateRef.current.delete(removed.id)
          lastActivityRef.current.delete(removed.id)
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
  }, [startTimer, updateVisualState])

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
      addOrUpdateNotification(data)
    }

    const unsubscribe = window.electron?.onNotification?.(handleNotification)

    return () => {
      unsubscribe?.()
    }
  }, [addOrUpdateNotification])

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
      lastActivityRef.current.clear()
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
        // Clear any existing timer first
        const existingTimer = timersRef.current.get(n.id)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }
        
        // Use last activity time (updated on each setImage/setTitle) instead of createdAt
        const lastActivity = lastActivityRef.current.get(n.id) ?? n.createdAt
        const elapsed = Date.now() - lastActivity
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
            visualStateRef={visualStateRef}
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
