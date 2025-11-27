import { useDeckStore } from "@/lib/deck-store"
import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import type { GridButton as GridButtonType, AnimationDirection, AnimationStartCorner } from "@/lib/types"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, useSpring, useTransform } from "motion/react"
import { interpolate } from "flubber"

interface ButtonWithHint extends GridButtonType {
  filterHint: string
  linearIndex: number
}

interface OverlayButtonGridProps {
  onButtonActivated?: () => void
}

// Direction the button animates FROM (where it "comes from" in the spiral)
type StretchDirection = 'from-bottom' | 'from-right' | 'from-top' | 'from-left'

interface SpiralPosition {
  row: number
  col: number
  direction: StretchDirection
}

// Calculate spiral order with configurable start corner and direction
function calculateSpiralOrder(
  rows: number, 
  cols: number,
  startCorner: AnimationStartCorner = 'bottom-right',
  direction: AnimationDirection = 'clockwise'
): SpiralPosition[] {
  // For center start, we spiral outward from center
  if (startCorner === 'center') {
    return calculateCenterOutwardSpiral(rows, cols, direction)
  }
  
  const order: SpiralPosition[] = []
  const visited = new Set<string>()
  
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1
  
  // Determine starting position based on corner
  const isClockwise = direction === 'clockwise'
  
  while (top <= bottom && left <= right) {
    if (startCorner === 'bottom-right') {
      if (isClockwise) {
        // Up right edge, left top edge, down left edge, right bottom edge
        for (let r = bottom; r >= top; r--) addPos(r, right, 'from-bottom')
        right--
        for (let c = right; c >= left; c--) addPos(top, c, 'from-right')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, left, 'from-top')
        left++
        for (let c = left; c <= right; c++) addPos(bottom, c, 'from-left')
        bottom--
      } else {
        // Left bottom edge, up left edge, right top edge, down right edge
        for (let c = right; c >= left; c--) addPos(bottom, c, 'from-right')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, left, 'from-bottom')
        left++
        for (let c = left; c <= right; c++) addPos(top, c, 'from-left')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, right, 'from-top')
        right--
      }
    } else if (startCorner === 'bottom-left') {
      if (isClockwise) {
        for (let c = left; c <= right; c++) addPos(bottom, c, 'from-left')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, right, 'from-bottom')
        right--
        for (let c = right; c >= left; c--) addPos(top, c, 'from-right')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, left, 'from-top')
        left++
      } else {
        for (let r = bottom; r >= top; r--) addPos(r, left, 'from-bottom')
        left++
        for (let c = left; c <= right; c++) addPos(top, c, 'from-left')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, right, 'from-top')
        right--
        for (let c = right; c >= left; c--) addPos(bottom, c, 'from-right')
        bottom--
      }
    } else if (startCorner === 'top-right') {
      if (isClockwise) {
        for (let c = right; c >= left; c--) addPos(top, c, 'from-right')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, left, 'from-top')
        left++
        for (let c = left; c <= right; c++) addPos(bottom, c, 'from-left')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, right, 'from-bottom')
        right--
      } else {
        for (let r = top; r <= bottom; r++) addPos(r, right, 'from-top')
        right--
        for (let c = right; c >= left; c--) addPos(bottom, c, 'from-right')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, left, 'from-bottom')
        left++
        for (let c = left; c <= right; c++) addPos(top, c, 'from-left')
        top++
      }
    } else if (startCorner === 'top-left') {
      if (isClockwise) {
        for (let r = top; r <= bottom; r++) addPos(r, left, 'from-top')
        left++
        for (let c = left; c <= right; c++) addPos(bottom, c, 'from-left')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, right, 'from-bottom')
        right--
        for (let c = right; c >= left; c--) addPos(top, c, 'from-right')
        top++
      } else {
        for (let c = left; c <= right; c++) addPos(top, c, 'from-left')
        top++
        for (let r = top; r <= bottom; r++) addPos(r, right, 'from-top')
        right--
        for (let c = right; c >= left; c--) addPos(bottom, c, 'from-right')
        bottom--
        for (let r = bottom; r >= top; r--) addPos(r, left, 'from-bottom')
        left++
      }
    }
  }
  
  function addPos(row: number, col: number, dir: StretchDirection) {
    const key = `${row},${col}`
    if (!visited.has(key)) {
      order.push({ row, col, direction: dir })
      visited.add(key)
    }
  }
  
  return order
}

// Calculate spiral starting from center going outward
function calculateCenterOutwardSpiral(
  rows: number, 
  cols: number,
  direction: AnimationDirection
): SpiralPosition[] {
  const order: SpiralPosition[] = []
  const visited = new Set<string>()
  
  // Start from center
  const centerRow = Math.floor(rows / 2)
  const centerCol = Math.floor(cols / 2)
  
  // Add center first
  const addPos = (row: number, col: number, dir: StretchDirection) => {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const key = `${row},${col}`
      if (!visited.has(key)) {
        order.push({ row, col, direction: dir })
        visited.add(key)
      }
    }
  }
  
  addPos(centerRow, centerCol, 'from-bottom')
  
  const isClockwise = direction === 'clockwise'
  
  // Spiral outward in expanding rings
  for (let ring = 1; ring <= Math.max(rows, cols); ring++) {
    if (isClockwise) {
      // Right
      for (let r = centerRow - ring + 1; r <= centerRow + ring; r++) 
        addPos(r, centerCol + ring, 'from-left')
      // Down
      for (let c = centerCol + ring - 1; c >= centerCol - ring; c--) 
        addPos(centerRow + ring, c, 'from-top')
      // Left
      for (let r = centerRow + ring - 1; r >= centerRow - ring; r--) 
        addPos(r, centerCol - ring, 'from-right')
      // Up
      for (let c = centerCol - ring + 1; c <= centerCol + ring; c++) 
        addPos(centerRow - ring, c, 'from-bottom')
    } else {
      // Left
      for (let r = centerRow - ring + 1; r <= centerRow + ring; r++) 
        addPos(r, centerCol - ring, 'from-right')
      // Down
      for (let c = centerCol - ring + 1; c <= centerCol + ring; c++) 
        addPos(centerRow + ring, c, 'from-top')
      // Right
      for (let r = centerRow + ring - 1; r >= centerRow - ring; r--) 
        addPos(r, centerCol + ring, 'from-left')
      // Up
      for (let c = centerCol + ring - 1; c >= centerCol - ring; c--) 
        addPos(centerRow - ring, c, 'from-bottom')
    }
  }
  
  return order
}

type AnimationPhase = "idle" | "showing" | "visible" | "hiding" | "hidden"

export function OverlayButtonGrid({ onButtonActivated }: OverlayButtonGridProps) {
  const { config, executeAction } = useDeckStore()
  const [typedCombo, setTypedCombo] = useState("")
  const [focusedButton, setFocusedButton] = useState<ButtonWithHint | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  
  // Animation state
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("hidden")
  const [visibleButtonCount, setVisibleButtonCount] = useState(0)
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset auto-dismiss timer function
  const resetAutoDismissTimer = useCallback(() => {
    if (!config.autoDismissEnabled || !config.autoDismissDelaySeconds) return
    
    // Clear existing timer
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current)
      autoDismissRef.current = null
    }
    
    // Set new timer
    autoDismissRef.current = setTimeout(() => {
      window.electron?.closeOverlay()
    }, config.autoDismissDelaySeconds * 1000)
  }, [config.autoDismissEnabled, config.autoDismissDelaySeconds])

  // Animation settings from config
  const animationEnabled = config.animationEnabled ?? true
  const animationDuration = config.animationDuration || 250
  const staggerDelay = Math.max(10, animationDuration / 10)

  // Calculate spiral order for animation based on config
  const spiralOrder = useMemo(() => {
    return calculateSpiralOrder(
      config.rows, 
      config.cols,
      config.animationStartCorner || 'bottom-right',
      config.animationDirection || 'clockwise'
    )
  }, [config.rows, config.cols, config.animationStartCorner, config.animationDirection])

  // Get all buttons with their positions sorted left-to-right, top-to-bottom
  const sortedButtons = useMemo(() => {
    return [...config.buttons]
      .filter((btn) => btn.action) // Only buttons with actions
      .sort((a, b) => {
        if (a.position.row !== b.position.row) {
          return a.position.row - b.position.row
        }
        return a.position.col - b.position.col
      })
  }, [config.buttons])

  // Generate filter hints for each button
  const buttonsWithHints = useMemo((): ButtonWithHint[] => {
    // Group buttons by their first letter
    const letterGroups = new Map<string, GridButtonType[]>()

    sortedButtons.forEach((btn) => {
      const label = btn.label || ""
      const firstLetter = label.charAt(0).toUpperCase() || "?"
      if (!letterGroups.has(firstLetter)) {
        letterGroups.set(firstLetter, [])
      }
      letterGroups.get(firstLetter)!.push(btn)
    })

    // Assign hints to each button
    const result: ButtonWithHint[] = []

    letterGroups.forEach((buttons, letter) => {
      buttons.forEach((btn, index) => {
        let hint: string

        if (buttons.length === 1) {
          // Single button with this letter - just the letter
          hint = letter
        } else if (buttons.length <= 10) {
          // Up to 10 buttons - letter + number (1-9, then 0)
          const num = index < 9 ? (index + 1).toString() : "0"
          hint = `${letter}${num}`
        } else {
          // More than 10 buttons - need extended hints
          if (index < 10) {
            const num = index < 9 ? (index + 1).toString() : "0"
            hint = `${letter}${num}`
          } else {
            // Extended: letter + O + number
            const extIndex = index - 10
            const num = extIndex < 9 ? (extIndex + 1).toString() : "0"
            hint = `${letter}O${num}`
          }
        }

        result.push({
          ...btn,
          filterHint: hint,
          linearIndex: result.length,
        })
      })
    })

    return result
  }, [sortedButtons])

  // Find matching buttons based on typed combo
  const matchingButtons = useMemo(() => {
    if (!typedCombo) return buttonsWithHints

    return buttonsWithHints.filter((btn) =>
      btn.filterHint.toUpperCase().startsWith(typedCombo.toUpperCase())
    )
  }, [buttonsWithHints, typedCombo])

  // Check if we have exactly one match
  const singleMatch = matchingButtons.length === 1 ? matchingButtons[0] : null

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Reset auto-dismiss timer on any key press
      resetAutoDismissTimer()

      // Escape closes overlay
      if (event.key === "Escape") {
        if (focusedButton) {
          setFocusedButton(null)
          setTypedCombo("")
        } else {
          window.electron?.closeOverlay()
        }
        return
      }

      // Backspace removes last character
      if (event.key === "Backspace") {
        if (focusedButton) {
          setFocusedButton(null)
        } else {
          setTypedCombo((prev) => prev.slice(0, -1))
        }
        return
      }

      // Enter activates focused button
      if (event.key === "Enter") {
        if (focusedButton) {
          executeAction(focusedButton.id)
          onButtonActivated?.()
          // Use forceHideOverlay to skip the close animation
          window.electron?.forceHideOverlay()
        } else if (singleMatch) {
          executeAction(singleMatch.id)
          onButtonActivated?.()
          // Use forceHideOverlay to skip the close animation
          window.electron?.forceHideOverlay()
        }
        return
      }

      // Only accept alphanumeric characters
      if (/^[a-zA-Z0-9]$/.test(event.key)) {
        setTypedCombo((prev) => prev + event.key.toUpperCase())
      }
    },
    [focusedButton, singleMatch, executeAction, onButtonActivated, resetAutoDismissTimer]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Listen for overlay visibility changes from main process
  useEffect(() => {
    const unsubscribe = window.electron?.onOverlayVisibility(({ visible }: { visible: boolean }) => {
      // Clear any existing auto-dismiss timer
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current)
        autoDismissRef.current = null
      }

      if (visible) {
        // Reset focus mode when showing
        setFocusedButton(null)
        setTypedCombo("")
        
        if (animationEnabled) {
          // Start show animation
          setAnimationPhase("showing")
          setVisibleButtonCount(0)
        } else {
          // Skip animation - show all immediately
          setAnimationPhase("visible")
          setVisibleButtonCount(config.rows * config.cols)
        }
        
        // Set up auto-dismiss if enabled
        if (config.autoDismissEnabled && config.autoDismissDelaySeconds) {
          autoDismissRef.current = setTimeout(() => {
            window.electron?.closeOverlay()
          }, config.autoDismissDelaySeconds * 1000)
        }
      } else {
        if (animationEnabled) {
          // Start hide animation
          setAnimationPhase("hiding")
        } else {
          // Skip animation - hide immediately
          setAnimationPhase("hidden")
          setVisibleButtonCount(0)
          window.electron?.forceHideOverlay()
        }
      }
    })

    return () => {
      unsubscribe?.()
      if (autoDismissRef.current) {
        clearTimeout(autoDismissRef.current)
      }
    }
  }, [animationEnabled, config.rows, config.cols, config.autoDismissEnabled, config.autoDismissDelaySeconds])

  // Animation loop for showing buttons
  useEffect(() => {
    if (animationPhase === "showing") {
      const totalPositions = config.rows * config.cols
      
      if (visibleButtonCount < totalPositions) {
        animationRef.current = setTimeout(() => {
          setVisibleButtonCount((prev) => prev + 1)
        }, staggerDelay) // Configurable stagger delay
      } else {
        setAnimationPhase("visible")
      }
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [animationPhase, visibleButtonCount, config.rows, config.cols])

  // Animation loop for hiding buttons
  useEffect(() => {
    if (animationPhase === "hiding") {
      const totalPositions = config.rows * config.cols
      
      // If starting from 0 (edge case), initialize to full
      if (visibleButtonCount === 0) {
        setVisibleButtonCount(totalPositions)
        return
      }

      if (visibleButtonCount > 0) {
        animationRef.current = setTimeout(() => {
          setVisibleButtonCount((prev) => {
            const newCount = prev - 1
            // When count reaches 0, hide the window
            if (newCount === 0) {
              setAnimationPhase("hidden")
              window.electron?.forceHideOverlay()
            }
            return newCount
          })
        }, staggerDelay) // Configurable stagger delay
      }
    }

    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [animationPhase, visibleButtonCount, config.rows, config.cols])

  // Calculate which positions are currently visible based on animation
  const visiblePositions = useMemo(() => {
    const positions = new Set<string>()
    for (let i = 0; i < visibleButtonCount && i < spiralOrder.length; i++) {
      const pos = spiralOrder[i]
      positions.add(`${pos.row},${pos.col}`)
    }
    return positions
  }, [visibleButtonCount, spiralOrder])

  // Check if a position should be visible
  const isPositionVisible = useCallback((row: number, col: number) => {
    if (animationPhase === "visible" || animationPhase === "idle") return true
    if (animationPhase === "hidden") return false
    return visiblePositions.has(`${row},${col}`)
  }, [animationPhase, visiblePositions])

  // Get animation info for a position (index and stretch direction)
  const getPositionAnimationInfo = useCallback((row: number, col: number): { index: number; direction: StretchDirection } => {
    const idx = spiralOrder.findIndex((pos) => pos.row === row && pos.col === col)
    if (idx >= 0) {
      return { index: idx, direction: spiralOrder[idx].direction }
    }
    return { index: 0, direction: 'from-bottom' }
  }, [spiralOrder])

  // Auto-focus when single match found - only if user has typed something
  // This prevents getting stuck in focus mode when there's only 1 button
  useEffect(() => {
    if (singleMatch && !focusedButton && typedCombo.length > 0) {
      // Small delay for animation
      const timer = setTimeout(() => {
        setFocusedButton(singleMatch)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [singleMatch, focusedButton, typedCombo])

  const getButtonAtPosition = (row: number, col: number) => {
    return buttonsWithHints.find(
      (btn) => btn.position.row === row && btn.position.col === col
    )
  }

  const isButtonDimmed = (button: ButtonWithHint | undefined) => {
    if (!button || !typedCombo) return false
    return !button.filterHint.toUpperCase().startsWith(typedCombo.toUpperCase())
  }

  const padding = config.backgroundPadding || 8
  const radius = config.buttonRadius || 16
  const bgColor = config.backgroundColor || "#0a0a0a"
  const bgOpacity = (config.backgroundOpacity ?? 100) / 100
  const gridSize = config.gridSizePixels || 400
  const buttonSize = Math.floor(gridSize / Math.max(config.rows, config.cols))
  const gridWidth = buttonSize * config.cols
  const gridHeight = buttonSize * config.rows

  return (
    <div 
      className="relative"
      onMouseMove={resetAutoDismissTimer}
      onMouseEnter={resetAutoDismissTimer}
    >
      {/* Search indicator */}
      {typedCombo && !focusedButton && (
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Search className="size-4 text-white/70" />
          <span className="text-white font-mono text-lg tracking-widest">
            {typedCombo}
          </span>
        </div>
      )}

      {/* Focus mode - just the button, no background overlay */}
      {focusedButton && (
        <div 
          className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          onMouseMove={resetAutoDismissTimer}
        >
          <div className="animate-focus-pulse pointer-events-auto">
            <OverlayButton
              button={focusedButton}
              buttonSize={buttonSize * 2}
              radius={radius * 1.5}
              isDimmed={false}
              showHint={false}
              isFocused={true}
            />
          </div>
          <div className="absolute bottom-8 text-white/60 text-sm bg-black/50 px-4 py-2 rounded-lg pointer-events-auto">
            Press <kbd className="px-2 py-1 bg-white/10 rounded mx-1">Enter</kbd> to activate or{" "}
            <kbd className="px-2 py-1 bg-white/10 rounded mx-1">Backspace</kbd> to go back
          </div>
        </div>
      )}

      {/* Button grid */}
      <div
        ref={gridRef}
        onMouseMove={resetAutoDismissTimer}
        onMouseEnter={resetAutoDismissTimer}
        className={cn(
          "relative transition-opacity duration-200",
          focusedButton && "opacity-0 pointer-events-none"
        )}
        style={{
          width: gridWidth + padding * 2,
          height: gridHeight + padding * 2,
          padding: padding,
        }}
      >
        {/* Background layer - uses configured background color with opacity */}
        <MergedBackground
          rows={config.rows}
          cols={config.cols}
          buttonsWithHints={buttonsWithHints}
          padding={padding}
          radius={radius}
          buttonSize={buttonSize}
          bgColor={bgColor}
          bgOpacity={bgOpacity}
          visiblePositions={visiblePositions}
          animationPhase={animationPhase}
        />

        {/* Buttons layer */}
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `repeat(${config.cols}, ${buttonSize}px)`,
            gridTemplateRows: `repeat(${config.rows}, ${buttonSize}px)`,
          }}
        >
          {Array.from({ length: config.rows * config.cols }).map((_, index) => {
            const row = Math.floor(index / config.cols)
            const col = index % config.cols
            const button = getButtonAtPosition(row, col)
            const isVisible = isPositionVisible(row, col)
            const { index: animIndex, direction: stretchDirection } = getPositionAnimationInfo(row, col)

            return (
              <div
                key={`${row}-${col}`}
                className="relative"
                style={{ 
                  width: buttonSize, 
                  height: buttonSize,
                }}
              >
                {button && (
                  <OverlayButton
                    button={button}
                    buttonSize={buttonSize}
                    radius={radius}
                    isDimmed={isButtonDimmed(button)}
                    showHint={true}
                    isFocused={false}
                    isVisible={isVisible}
                    animationIndex={animIndex}
                    stretchDirection={stretchDirection}
                    animationDurationMs={animationDuration}
                    staggerDelayMs={staggerDelay}
                    onClick={() => {
                      executeAction(button.id)
                      onButtonActivated?.()
                      // Use forceHideOverlay to skip the close animation
                      window.electron?.forceHideOverlay()
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface OverlayButtonProps {
  button: ButtonWithHint
  buttonSize: number
  radius: number
  isDimmed: boolean
  showHint: boolean
  isFocused: boolean
  isVisible?: boolean
  animationIndex?: number
  stretchDirection?: StretchDirection
  animationDurationMs?: number
  staggerDelayMs?: number
  onClick?: () => void
}

// Get animation properties based on stretch direction
function getStretchAnimation(direction: StretchDirection, isVisible: boolean) {
  // Initial state (hidden) - stretched to zero in the direction it comes from
  // Final state (visible) - full size
  const hidden = {
    'from-bottom': { scaleY: 0, scaleX: 1, originX: 0.5, originY: 1 },    // grows upward
    'from-top': { scaleY: 0, scaleX: 1, originX: 0.5, originY: 0 },       // grows downward
    'from-right': { scaleX: 0, scaleY: 1, originX: 1, originY: 0.5 },     // grows leftward
    'from-left': { scaleX: 0, scaleY: 1, originX: 0, originY: 0.5 },      // grows rightward
  }
  
  const shown = { scaleX: 1, scaleY: 1 }
  
  const config = hidden[direction]
  
  return {
    initial: { ...config, opacity: 0 },
    animate: isVisible 
      ? { ...shown, opacity: 1 }
      : { scaleX: config.scaleX, scaleY: config.scaleY, opacity: 0 },
    style: { 
      originX: config.originX,
      originY: config.originY,
    }
  }
}

function OverlayButton({
  button,
  buttonSize,
  radius,
  isDimmed,
  showHint,
  isFocused,
  isVisible = true,
  animationIndex = 0,
  stretchDirection = 'from-bottom',
  animationDurationMs = 250,
  staggerDelayMs = 25,
  onClick,
}: OverlayButtonProps) {
  const innerPadding = 4
  const innerRadius = Math.max(radius - 4, 4)
  
  // Use per-button duration if set, otherwise use the passed default
  const duration = (button.animationDuration ?? animationDurationMs) / 1000
  const stretchAnim = getStretchAnimation(stretchDirection, isVisible)

  return (
    <motion.div
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center flex-col cursor-pointer",
        "hover:scale-105 hover:z-10 active:scale-95",
        isDimmed && "opacity-30 grayscale pointer-events-none",
        isFocused && "scale-110"
      )}
      initial={stretchAnim.initial}
      animate={stretchAnim.animate}
      transition={{ 
        duration: duration, 
        delay: isVisible ? animationIndex * (staggerDelayMs / 1000) : 0,
        ease: [0.34, 1.56, 0.64, 1] // Bouncy ease for playful effect
      }}
      style={{ 
        width: buttonSize, 
        height: buttonSize,
        ...stretchAnim.style
      }}
    >
      {/* Button with bevel effect */}
      <div
        className="absolute flex items-center justify-center flex-col gap-1 overlay-button-bevel"
        style={{
          inset: `${innerPadding}px`,
          borderRadius: `${innerRadius}px`,
        }}
      >
        {/* Hint badge */}
        {showHint && (
          <div
            className="absolute top-1 left-1 z-20 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {button.filterHint}
          </div>
        )}

        {/* Icon */}
        {button?.icon &&
        (button.icon.startsWith("data:") || button.icon.startsWith("http")) ? (
          <img
            src={button.icon}
            alt={button.label || "Button icon"}
            className={cn("size-10 object-contain", isFocused && "size-16")}
          />
        ) : (
          <div
            className={cn("text-2xl", isFocused && "text-4xl")}
            style={{ color: button?.textColor || "#ffffff" }}
          >
            {button?.icon || "🎮"}
          </div>
        )}

        {/* Label */}
        {button?.label && (
          <p
            className={cn(
              "text-[10px] font-medium text-center line-clamp-2 px-1",
              isFocused && "text-sm"
            )}
            style={{ color: button?.textColor || "#ffffff" }}
          >
            {button.label}
          </p>
        )}

        {/* Status indicator */}
        {button?.status && (
          <span
            className="absolute top-1 right-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{
              backgroundColor: button.status === "alert" ? "#f97316" : "#22c55e",
              color: "#000",
            }}
          >
            {button.status === "alert" ? "!" : "OK"}
          </span>
        )}
      </div>
    </motion.div>
  )
}

interface MergedBackgroundProps {
  rows: number
  cols: number
  buttonsWithHints: ButtonWithHint[]
  padding: number
  radius: number
  buttonSize: number
  bgColor: string
  bgOpacity: number
  visiblePositions: Set<string>
  animationPhase: AnimationPhase
}

// Animated path component that morphs between paths using Flubber
function AnimatedPath({ 
  targetPath, 
  fill, 
  fillOpacity 
}: { 
  targetPath: string
  fill: string
  fillOpacity: number 
}) {
  const [currentPath, setCurrentPath] = useState(targetPath)
  const [prevPath, setPrevPath] = useState(targetPath)
  const progress = useSpring(1, { stiffness: 300, damping: 30 })
  
  // Create interpolator when target changes
  const interpolator = useMemo(() => {
    if (prevPath === targetPath) return null
    try {
      return interpolate(prevPath, targetPath, { maxSegmentLength: 2 })
    } catch {
      // If interpolation fails, just snap to target
      return null
    }
  }, [prevPath, targetPath])
  
  // Update path when target changes
  useEffect(() => {
    if (targetPath !== prevPath) {
      progress.set(0)
      progress.set(1)
    }
  }, [targetPath, prevPath, progress])
  
  // Transform progress to interpolated path
  const animatedPath = useTransform(progress, (p) => {
    if (!interpolator) return targetPath
    return interpolator(Math.min(1, Math.max(0, p)))
  })
  
  // Update prev path after animation completes
  useEffect(() => {
    const unsubscribe = progress.on("change", (v) => {
      if (v >= 0.99 && prevPath !== targetPath) {
        setPrevPath(targetPath)
      }
    })
    return unsubscribe
  }, [progress, prevPath, targetPath])
  
  // Subscribe to animated path changes
  useEffect(() => {
    const unsubscribe = animatedPath.on("change", setCurrentPath)
    return unsubscribe
  }, [animatedPath])
  
  return (
    <motion.path
      d={currentPath}
      fill={fill}
      fillOpacity={fillOpacity}
      fillRule="evenodd"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    />
  )
}

function MergedBackground({
  rows,
  cols,
  buttonsWithHints,
  padding,
  radius,
  buttonSize,
  bgColor,
  bgOpacity,
  visiblePositions,
  animationPhase,
}: MergedBackgroundProps) {
  // Create icon map based on visible positions during animation
  const iconMap = useMemo(() => {
    const map: boolean[][] = []
    for (let r = 0; r < rows; r++) {
      map[r] = []
      for (let c = 0; c < cols; c++) {
        const button = buttonsWithHints.find(
          (btn) => btn.position.row === r && btn.position.col === c
        )
        // During animation, only include visible positions
        const isAnimating = animationPhase === "showing" || animationPhase === "hiding"
        const isVisible = visiblePositions.has(`${r},${c}`)
        map[r][c] = !!button && (!isAnimating || isVisible)
      }
    }
    return map
  }, [buttonsWithHints, rows, cols, visiblePositions, animationPhase])

  const generatePath = useCallback(() => {
    const cellSize = buttonSize

    // Find all boundary edges (edges between filled and empty cells)
    type Edge = { x1: number; y1: number; x2: number; y2: number; key: string }
    const allEdges: Edge[] = []
    
    const isFilled = (r: number, c: number) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return false
      return iconMap[r]?.[c] ?? false
    }

    // Collect all edges between filled and empty cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isFilled(r, c)) continue
        
        const x = c * cellSize
        const y = r * cellSize

        // Top edge (if cell above is empty)
        if (!isFilled(r - 1, c)) {
          allEdges.push({ x1: x, y1: y, x2: x + cellSize, y2: y, key: `h${r},${c}` })
        }
        // Right edge (if cell to right is empty)
        if (!isFilled(r, c + 1)) {
          allEdges.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize, key: `vr${r},${c}` })
        }
        // Bottom edge (if cell below is empty)
        if (!isFilled(r + 1, c)) {
          allEdges.push({ x1: x + cellSize, y1: y + cellSize, x2: x, y2: y + cellSize, key: `h${r+1},${c}` })
        }
        // Left edge (if cell to left is empty)
        if (!isFilled(r, c - 1)) {
          allEdges.push({ x1: x, y1: y + cellSize, x2: x, y2: y, key: `vl${r},${c}` })
        }
      }
    }

    if (allEdges.length === 0) return null

    // Build all closed loops from edges
    const loops: { x: number; y: number }[][] = []
    const usedEdges = new Set<number>()

    while (usedEdges.size < allEdges.length) {
      // Find first unused edge
      let startIdx = -1
      for (let i = 0; i < allEdges.length; i++) {
        if (!usedEdges.has(i)) {
          startIdx = i
          break
        }
      }
      if (startIdx === -1) break

      const loop: { x: number; y: number }[] = []
      loop.push({ x: allEdges[startIdx].x1, y: allEdges[startIdx].y1 })
      loop.push({ x: allEdges[startIdx].x2, y: allEdges[startIdx].y2 })
      usedEdges.add(startIdx)

      // Follow edges to complete the loop
      let iterations = 0
      const maxIterations = allEdges.length * 2
      
      while (iterations < maxIterations) {
        iterations++
        const lastPoint = loop[loop.length - 1]
        const firstPoint = loop[0]
        
        // Check if we've closed the loop
        if (loop.length > 2 && 
            Math.abs(lastPoint.x - firstPoint.x) < 0.5 && 
            Math.abs(lastPoint.y - firstPoint.y) < 0.5) {
          loop.pop() // Remove duplicate point
          break
        }

        // Find next edge
        let foundNext = false
        for (let i = 0; i < allEdges.length; i++) {
          if (usedEdges.has(i)) continue
          const edge = allEdges[i]

          if (Math.abs(edge.x1 - lastPoint.x) < 0.5 && 
              Math.abs(edge.y1 - lastPoint.y) < 0.5) {
            loop.push({ x: edge.x2, y: edge.y2 })
            usedEdges.add(i)
            foundNext = true
            break
          }
        }

        if (!foundNext) break
      }

      if (loop.length >= 3) {
        loops.push(loop)
      }
    }

    if (loops.length === 0) return null

    // Generate path string with all loops
    // Using evenodd fill rule, so holes will be cut out automatically
    let combinedPath = ""
    
    for (const loop of loops) {
      const paddedPath = generatePaddedPathWithRoundedCorners(loop, padding, radius, cellSize)
      combinedPath += paddedPath + " "
    }

    return { 
      path: combinedPath.trim(), 
      totalWidth: cols * cellSize, 
      totalHeight: rows * cellSize 
    }
  }, [iconMap, rows, cols, buttonSize, padding, radius])

  const generatePaddedPathWithRoundedCorners = (
    points: { x: number; y: number }[],
    pad: number,
    r: number,
    cellSize: number
  ): string => {
    const n = points.length
    if (n < 3) return ""
    
    const paddedPoints: { x: number; y: number }[] = []

    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n]
      const curr = points[i]
      const next = points[(i + 1) % n]

      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y
      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y

      const n1x = dy1 === 0 ? 0 : dy1 > 0 ? 1 : -1
      const n1y = dx1 === 0 ? 0 : dx1 > 0 ? -1 : 1
      const n2x = dy2 === 0 ? 0 : dy2 > 0 ? 1 : -1
      const n2y = dx2 === 0 ? 0 : dx2 > 0 ? -1 : 1

      let offsetX = (n1x + n2x) * pad
      let offsetY = (n1y + n2y) * pad

      if (n1x !== n2x && n1y !== n2y) {
        offsetX = n1x * pad + n2x * pad
        offsetY = n1y * pad + n2y * pad
      } else if (n1x === n2x && n1y === n2y) {
        offsetX = n1x * pad
        offsetY = n1y * pad
      }

      paddedPoints.push({
        x: curr.x + offsetX,
        y: curr.y + offsetY,
      })
    }

    let path = ""
    const effectiveRadius = Math.min(r, cellSize / 2)

    for (let i = 0; i < paddedPoints.length; i++) {
      const prev = paddedPoints[(i - 1 + paddedPoints.length) % paddedPoints.length]
      const curr = paddedPoints[i]
      const next = paddedPoints[(i + 1) % paddedPoints.length]

      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)

      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

      const cornerRadius = Math.min(effectiveRadius, len1 / 2, len2 / 2)

      const arcStartX = curr.x - (len1 > 0 ? (dx1 / len1) * cornerRadius : 0)
      const arcStartY = curr.y - (len1 > 0 ? (dy1 / len1) * cornerRadius : 0)
      const arcEndX = curr.x + (len2 > 0 ? (dx2 / len2) * cornerRadius : 0)
      const arcEndY = curr.y + (len2 > 0 ? (dy2 / len2) * cornerRadius : 0)

      if (i === 0) {
        path += `M ${arcStartX} ${arcStartY} `
      } else {
        path += `L ${arcStartX} ${arcStartY} `
      }

      if (cornerRadius > 0 && len1 > 0 && len2 > 0) {
        path += `Q ${curr.x} ${curr.y} ${arcEndX} ${arcEndY} `
      }
    }

    const firstPrev = paddedPoints[paddedPoints.length - 1]
    const first = paddedPoints[0]
    const dx = first.x - firstPrev.x
    const dy = first.y - firstPrev.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const cornerRadius = Math.min(effectiveRadius, len / 2)
    const arcStartX = first.x - (len > 0 ? (dx / len) * cornerRadius : 0)
    const arcStartY = first.y - (len > 0 ? (dy / len) * cornerRadius : 0)

    path += `L ${arcStartX} ${arcStartY} Z`

    return path
  }

  const result = generatePath()

  if (!result) return null

  const { path, totalWidth, totalHeight } = result

  return (
    <motion.svg
      className="absolute pointer-events-none"
      style={{
        top: 0,
        left: 0,
        width: totalWidth + padding * 2,
        height: totalHeight + padding * 2,
      }}
      viewBox={`${-padding} ${-padding} ${totalWidth + padding * 2} ${totalHeight + padding * 2}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <AnimatedPath 
        targetPath={path}
        fill={bgColor}
        fillOpacity={bgOpacity}
      />
    </motion.svg>
  )
}

