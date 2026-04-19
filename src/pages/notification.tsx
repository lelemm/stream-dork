import "@/styles/global.css"

import { useEffect, useCallback, useRef, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { create } from "zustand"
import { shallow } from "zustand/shallow"
import type { NotificationSettings } from "@/lib/types"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"

// Generate initials from a title string (up to 2-3 characters)
function getInitials(title: string | undefined, maxChars: number = 2): string {
  if (!title) return "?"
  
  // Split by common separators and get first letter of each word
  const words = title.split(/[\s\-_/\\|]+/).filter(w => w.length > 0)
  
  if (words.length === 0) return "?"
  
  if (words.length === 1) {
    // Single word: take first 2-3 characters
    return words[0].substring(0, maxChars).toUpperCase()
  }
  
  // Multiple words: take first letter of first N words
  return words
    .slice(0, maxChars)
    .map(w => w[0])
    .join("")
    .toUpperCase()
}

interface NotificationContent {
  context: string
  event: "setTitle" | "setImage" | "showOk" | "showAlert"
  icon?: string
  title?: string
  backgroundColor?: string
  textColor?: string
  status?: "ok" | "alert"
}

interface NotificationMeta {
  context: string
  createdAt: number
  opacity: number
}

const defaultSettings: NotificationSettings = {
  enabled: true,
  dismissOnClick: false,
  autoDismissSeconds: 5,
  fanDirection: "vertical",
  alwaysFanOut: false,
  clickThrough: false,
  hoverOpacity: 100,
  iconSize: 72,
}

const MAX_NOTIFICATIONS = 5
const FADE_DURATION = 300

// Timer refs stored outside React to avoid re-renders
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()
const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface NotificationStore {
  // Content indexed by context - using plain object for reliable updates
  contentByContext: Record<string, NotificationContent>
  // Ordered list of active notification contexts with metadata
  notificationOrder: NotificationMeta[]
  // Settings
  settings: NotificationSettings
  isHovered: boolean
  
  // Actions
  setSettings: (settings: NotificationSettings) => void
  setHovered: (hovered: boolean) => void
  addOrUpdateNotification: (data: NotificationContent) => { isNew: boolean; context: string }
  updateOpacity: (context: string, opacity: number) => void
  removeNotification: (context: string) => void
}

const useNotificationStore = create<NotificationStore>((set, get) => ({
  contentByContext: {},
  notificationOrder: [],
  settings: defaultSettings,
  isHovered: false,

  setSettings: (settings) => set({ settings }),
  
  setHovered: (hovered) => set({ isHovered: hovered }),
  
  addOrUpdateNotification: (data) => {
    const state = get()
    const existingIndex = state.notificationOrder.findIndex(n => n.context === data.context)
    
    // Update content
    const newContent = { ...state.contentByContext, [data.context]: data }
    
    if (existingIndex >= 0) {
      // Update existing - keep position, just update createdAt for timer reset
      const newOrder = [...state.notificationOrder]
      newOrder[existingIndex] = {
        ...newOrder[existingIndex],
        createdAt: Date.now(),
        opacity: 1, // Ensure visible (in case was fading)
      }
      set({ contentByContext: newContent, notificationOrder: newOrder })
      return { isNew: false, context: data.context }
    } else {
      // New notification
      let newOrder = [...state.notificationOrder, {
        context: data.context,
        createdAt: Date.now(),
        opacity: 0, // Start at 0 for fade-in
      }]
      
      // Limit to max
      while (newOrder.length > MAX_NOTIFICATIONS) {
        const removed = newOrder.shift()
        if (removed) {
          delete newContent[removed.context]
          clearTimersForContext(removed.context)
        }
      }
      
      set({ contentByContext: newContent, notificationOrder: newOrder })
      return { isNew: true, context: data.context }
    }
  },
  
  updateOpacity: (context, opacity) => {
    set((state) => {
      const index = state.notificationOrder.findIndex(n => n.context === context)
      if (index < 0) return state
      
      const newOrder = [...state.notificationOrder]
      newOrder[index] = { ...newOrder[index], opacity }
      return { notificationOrder: newOrder }
    })
  },
  
  removeNotification: (context) => {
    set((state) => {
      const { [context]: _, ...newContent } = state.contentByContext
      const newOrder = state.notificationOrder.filter(n => n.context !== context)
      
      if (newOrder.length === 0) {
        window.electron?.hideNotification?.()
      }
      
      return { contentByContext: newContent, notificationOrder: newOrder }
    })
  },
}))

function clearTimersForContext(context: string) {
  const timer = dismissTimers.get(context)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(context)
  }
  const fadeTimer = fadeTimers.get(context)
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimers.delete(context)
  }
}

// Inner content component - reads directly from store, only re-renders when its own content changes
function NotificationIconContent({ 
  context,
  buttonSize,
  isExpanded,
  total,
}: { 
  context: string
  buttonSize: number
  isExpanded: boolean
  total: number
}) {
  // Subscribe only to this specific context's content
  const content = useNotificationStore(
    useCallback((state) => state.contentByContext[context], [context])
  )
  
  if (!content) return null
  
  const innerPadding = Math.max(Math.floor(buttonSize * 0.04), 2)
  const innerRadius = Math.max(Math.max(Math.floor(buttonSize * 0.19), 8) - 3, 4)
  
  // Check if we have a real image icon
  const hasImageIcon = content.icon && (content.icon.startsWith("data:") || content.icon.startsWith("http"))
  
  // Calculate whether we should show title
  const shouldShowTitle = content.title && (isExpanded || total === 1)
  
  // Calculate icon size - smaller when we need to show a title
  const baseIconSize = Math.floor(buttonSize * 0.44)
  const smallIconSize = Math.floor(buttonSize * 0.32)
  const iconSize = shouldShowTitle ? smallIconSize : baseIconSize
  
  // Calculate font sizes proportionally
  const labelSize = Math.max(Math.floor(buttonSize * 0.10), 8)
  const initialsSize = Math.floor(iconSize * 0.55)
  
  const initials = useMemo(() => getInitials(content.title, 2), [content.title])

  return (
    <>
      <div
        className="relative flex items-center justify-center w-full h-full"
        style={{
          borderRadius: `${Math.max(Math.floor(buttonSize * 0.19), 8)}px`,
          backgroundColor: content.backgroundColor || "rgba(26, 26, 26, 0.98)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        }}
      >
        {/* Inner button with bevel effect */}
        <div
          className="absolute flex items-center justify-center flex-col overflow-hidden"
          style={{
            inset: `${innerPadding}px`,
            borderRadius: `${innerRadius}px`,
            background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.1) 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.2)",
            padding: `${Math.floor(buttonSize * 0.04)}px`,
            gap: `${Math.floor(buttonSize * 0.02)}px`,
          }}
        >
          {/* Icon */}
          <div 
            className="flex items-center justify-center flex-shrink-0"
            style={{ 
              width: iconSize, 
              height: iconSize,
              minHeight: iconSize,
            }}
          >
            {hasImageIcon ? (
              <img
                src={content.icon}
                alt={content.title || "Button icon"}
                className="object-contain w-full h-full"
              />
            ) : (
              <div
                className="flex items-center justify-center w-full h-full rounded-md"
                style={{ 
                  backgroundColor: content.backgroundColor ? "rgba(255,255,255,0.1)" : "rgba(99, 102, 241, 0.3)",
                  color: content.textColor || "#ffffff",
                  fontSize: initialsSize,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {initials}
              </div>
            )}
          </div>

          {/* Title - show when expanded or single item */}
          {shouldShowTitle && (
            <p
              className="font-medium text-center leading-tight w-full"
              style={{ 
                color: content.textColor || "#ffffff",
                fontSize: labelSize,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {content.title}
            </p>
          )}

          {/* Status indicator */}
          {content.status && (
            <span
              className="absolute top-0.5 right-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase animate-pulse"
              style={{
                backgroundColor: content.status === "alert" ? "#f97316" : "#22c55e",
                color: "#000",
              }}
            >
              {content.status === "alert" ? "!" : "✓"}
            </span>
          )}
        </div>
      </div>
    </>
  )
}

// Outer wrapper - handles positioning and opacity, minimal re-renders
function NotificationIcon({ 
  meta,
  index, 
  total, 
  isExpanded,
  isHovered,
  fanDirection,
  hoverOpacity,
  buttonSize,
  onClick,
  onSnooze,
  onMenuOpenChange,
}: { 
  meta: NotificationMeta
  index: number
  total: number
  isExpanded: boolean
  isHovered: boolean
  fanDirection: "vertical" | "horizontal"
  hoverOpacity: number
  buttonSize: number
  onClick?: () => void
  onSnooze?: (context: string, minutes: number) => void
  onMenuOpenChange?: (open: boolean) => void
}) {
  // Calculate position based on whether expanded or stacked
  const reverseIndex = total - 1 - index // 0 = newest (on top)
  
  // Stack offset calculations (proportional to button size)
  const stackOffsetX = reverseIndex * Math.floor(buttonSize * 0.11)
  const stackOffsetY = reverseIndex * Math.floor(buttonSize * 0.055)
  const gap = Math.floor(buttonSize * 0.11)
  
  // Expanded offset based on fan direction
  const expandedOffsetX = fanDirection === "horizontal" ? reverseIndex * (buttonSize + gap) : 0
  const expandedOffsetY = fanDirection === "vertical" ? reverseIndex * (buttonSize + gap) : 0
  
  const translateX = isExpanded ? -expandedOffsetX : -stackOffsetX
  const translateY = isExpanded ? -expandedOffsetY : -stackOffsetY
  const rotate = isExpanded ? 0 : reverseIndex * 3
  const scale = isExpanded ? 1 : Math.max(0.95 - reverseIndex * 0.03, 0.85)
  
  // Cards further back are slightly dimmer when stacked
  const stackOpacity = isExpanded ? 1 : Math.max(1 - reverseIndex * 0.15, 0.5)
  
  // Apply hover opacity
  const finalOpacity = isHovered ? (meta.opacity * stackOpacity * hoverOpacity / 100) : (meta.opacity * stackOpacity)

  const snoozeOptions = [
    { label: "5 minutes", minutes: 5 },
    { label: "10 minutes", minutes: 10 },
    { label: "30 minutes", minutes: 30 },
    { label: "60 minutes", minutes: 60 },
  ]

  const buttonWrapper = (
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
      <NotificationIconContent 
        context={meta.context}
        buttonSize={buttonSize}
        isExpanded={isExpanded}
        total={total}
      />
    </div>
  )

  return (
    <ContextMenu onOpenChange={onMenuOpenChange}>
      <ContextMenuTrigger asChild>
        {buttonWrapper}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none">
              !
            </span>
            Snooze for...
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            {snoozeOptions.map((option) => (
              <ContextMenuItem
                key={option.minutes}
                onClick={() => onSnooze?.(meta.context, option.minutes)}
              >
                <span className="mr-2 inline-block text-xs">⏱</span>
                {option.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function NotificationPage() {
  const notificationOrder = useNotificationStore((state) => state.notificationOrder)
  const settings = useNotificationStore((state) => state.settings)
  const isHovered = useNotificationStore((state) => state.isHovered)
  const setSettings = useNotificationStore((state) => state.setSettings)
  const setHovered = useNotificationStore((state) => state.setHovered)
  const addOrUpdateNotification = useNotificationStore((state) => state.addOrUpdateNotification)
  const updateOpacity = useNotificationStore((state) => state.updateOpacity)
  const removeNotification = useNotificationStore((state) => state.removeNotification)
  
  const pausedTimersRef = useRef<Map<string, number>>(new Map()) // context -> remaining time
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Computed values
  const displayDuration = (settings.autoDismissSeconds ?? 5) * 1000
  const isExpanded = settings.alwaysFanOut || isHovered
  const fanDirection = settings.fanDirection ?? "vertical"
  const hoverOpacity = settings.hoverOpacity ?? 100
  const buttonSize = settings.iconSize ?? 72
  const clickThrough = settings.clickThrough ?? false

  const startFadeOut = useCallback((context: string) => {
    updateOpacity(context, 0)
    
    const fadeTimer = setTimeout(() => {
      removeNotification(context)
      fadeTimers.delete(context)
    }, FADE_DURATION)
    fadeTimers.set(context, fadeTimer)
  }, [updateOpacity, removeNotification])

  const startTimer = useCallback((context: string, duration?: number) => {
    clearTimersForContext(context)
    
    const effectiveDuration = duration ?? displayDuration
    if (effectiveDuration <= 0) return
    
    const timer = setTimeout(() => {
      startFadeOut(context)
      dismissTimers.delete(context)
    }, effectiveDuration)
    dismissTimers.set(context, timer)
  }, [startFadeOut, displayDuration])

  const handleDismiss = useCallback((context: string) => {
    if (settings.dismissOnClick) {
      startFadeOut(context)
    }
  }, [settings.dismissOnClick, startFadeOut])

  const handleSnooze = useCallback((context: string, minutes: number) => {
    window.electron?.snoozeNotification?.(context, minutes)
    clearTimersForContext(context)
    removeNotification(context)
  }, [removeNotification])

  // Load initial config
  useEffect(() => {
    window.electron?.getNotificationConfig?.().then((config) => {
      if (config) {
        setSettings(config)
      }
    })
  }, [setSettings])

  // Listen for config updates
  useEffect(() => {
    const unsubscribe = window.electron?.onNotificationConfig?.((config) => {
      if (config) {
        setSettings(config)
      }
    })
    return () => unsubscribe?.()
  }, [setSettings])

  // Listen for notifications
  useEffect(() => {
    const handleNotification = (data: NotificationContent) => {
      const { isNew, context } = addOrUpdateNotification(data)
      
      // Clear any existing timers
      clearTimersForContext(context)
      
      if (isNew) {
        // Fade in new notifications
        requestAnimationFrame(() => {
          updateOpacity(context, 1)
        })
      }
      
      // Start/restart dismiss timer
      startTimer(context)
    }

    const unsubscribe = window.electron?.onNotification?.(handleNotification)
    return () => unsubscribe?.()
  }, [addOrUpdateNotification, updateOpacity, startTimer])

  // Listen for dismiss requests
  useEffect(() => {
    const handleDismissRequest = ({ context }: { context?: string; id?: string }) => {
      if (context) {
        startFadeOut(context)
      }
    }

    const unsubscribe = window.electron?.onDismissNotification?.(handleDismissRequest)
    return () => unsubscribe?.()
  }, [startFadeOut])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dismissTimers.forEach((timer) => clearTimeout(timer))
      dismissTimers.clear()
      fadeTimers.forEach((timer) => clearTimeout(timer))
      fadeTimers.clear()
    }
  }, [])

  // Control OS-level click-through behavior:
  // - Outside the notification stack area, the window should ALWAYS be click-through
  // - When "Click Through" setting is enabled, even the notifications themselves are click-through
  // - When it is disabled, notifications are clickable but the rest of the window still passes events through
  useEffect(() => {
    const api = window.electron
    if (!api?.setNotificationIgnoreMouseEvents) {
      return
    }

    // While any context menu (including submenus like "Snooze for") is open,
    // temporarily disable click-through so clicks outside the menu can close it.
    if (isMenuOpen) {
      api.setNotificationIgnoreMouseEvents(false, true)
      return
    }

    // If click-through is enabled globally, always pass events through
    if (clickThrough) {
      api.setNotificationIgnoreMouseEvents(true, true)
      return
    }

    // Otherwise, only capture mouse events while hovering over the notification stack
    if (isHovered && notificationOrder.length > 0) {
      api.setNotificationIgnoreMouseEvents(false, true)
    } else {
      api.setNotificationIgnoreMouseEvents(true, true)
    }
  }, [clickThrough, isHovered, isMenuOpen, notificationOrder.length])

  // Pause/resume timers when hovered
  useEffect(() => {
    if (displayDuration <= 0) {
      // Auto-dismiss disabled
      dismissTimers.forEach((timer) => clearTimeout(timer))
      dismissTimers.clear()
      return
    }

    if (isHovered && !settings.alwaysFanOut) {
      // Pause all timers - store remaining time
      notificationOrder.forEach((n: NotificationMeta) => {
        const elapsed = Date.now() - n.createdAt
        const remaining = Math.max(displayDuration - elapsed, 500)
        pausedTimersRef.current.set(n.context, remaining)
      })
      dismissTimers.forEach((timer) => clearTimeout(timer))
      dismissTimers.clear()
    } else if (!isHovered && !settings.alwaysFanOut) {
      // Resume timers with remaining time
      notificationOrder.forEach((n: NotificationMeta) => {
        const remaining = pausedTimersRef.current.get(n.context) ?? displayDuration
        
        const timer = setTimeout(() => {
          startFadeOut(n.context)
          dismissTimers.delete(n.context)
        }, remaining)
        dismissTimers.set(n.context, timer)
      })
      pausedTimersRef.current.clear()
    }
  }, [isHovered, notificationOrder, startFadeOut, displayDuration, settings.alwaysFanOut])

  if (notificationOrder.length === 0) {
    return null
  }

  // Calculate container size
  const margin = 16
  const gap = Math.floor(buttonSize * 0.11)
  const stackOffsetX = Math.floor(buttonSize * 0.11)
  const stackOffsetY = Math.floor(buttonSize * 0.055)
  
  let containerWidth: number
  let containerHeight: number
  
  if (isExpanded) {
    if (fanDirection === "horizontal") {
      containerWidth = buttonSize + (notificationOrder.length - 1) * (buttonSize + gap)
      containerHeight = buttonSize
    } else {
      containerWidth = buttonSize
      containerHeight = buttonSize + (notificationOrder.length - 1) * (buttonSize + gap)
    }
  } else {
    containerWidth = buttonSize + (notificationOrder.length - 1) * stackOffsetX
    containerHeight = buttonSize + (notificationOrder.length - 1) * stackOffsetY
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {notificationOrder.map((meta: NotificationMeta, index: number) => (
          <NotificationIcon
            key={meta.context}
            meta={meta}
            index={index}
            total={notificationOrder.length}
            isExpanded={isExpanded}
            isHovered={isHovered}
            fanDirection={fanDirection}
            hoverOpacity={hoverOpacity}
            buttonSize={buttonSize}
            onClick={() => handleDismiss(meta.context)}
            onSnooze={handleSnooze}
            onMenuOpenChange={setIsMenuOpen}
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
