import { useDeckStore } from "@/lib/deck-store"
import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import type { GridButton as GridButtonType } from "@/lib/types"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface ButtonWithHint extends GridButtonType {
  filterHint: string
  linearIndex: number
}

interface OverlayButtonGridProps {
  onButtonActivated?: () => void
}

export function OverlayButtonGrid({ onButtonActivated }: OverlayButtonGridProps) {
  const { config, executeAction } = useDeckStore()
  const [typedCombo, setTypedCombo] = useState("")
  const [focusedButton, setFocusedButton] = useState<ButtonWithHint | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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
          window.electron?.closeOverlay()
        } else if (singleMatch) {
          executeAction(singleMatch.id)
          onButtonActivated?.()
          window.electron?.closeOverlay()
        }
        return
      }

      // Only accept alphanumeric characters
      if (/^[a-zA-Z0-9]$/.test(event.key)) {
        setTypedCombo((prev) => prev + event.key.toUpperCase())
      }
    },
    [focusedButton, singleMatch, executeAction, onButtonActivated]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Auto-focus when single match found
  useEffect(() => {
    if (singleMatch && !focusedButton) {
      // Small delay for animation
      const timer = setTimeout(() => {
        setFocusedButton(singleMatch)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [singleMatch, focusedButton])

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
    <div className="relative">
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
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
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

            return (
              <div
                key={`${row}-${col}`}
                className="relative"
                style={{ width: buttonSize, height: buttonSize }}
              >
                {button && (
                  <OverlayButton
                    button={button}
                    buttonSize={buttonSize}
                    radius={radius}
                    isDimmed={isButtonDimmed(button)}
                    showHint={true}
                    isFocused={false}
                    onClick={() => {
                      executeAction(button.id)
                      onButtonActivated?.()
                      window.electron?.closeOverlay()
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
  onClick?: () => void
}

function OverlayButton({
  button,
  buttonSize,
  radius,
  isDimmed,
  showHint,
  isFocused,
  onClick,
}: OverlayButtonProps) {
  const innerPadding = 4
  const innerRadius = Math.max(radius - 4, 4)

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center flex-col transition-all duration-200 cursor-pointer",
        "hover:scale-105 hover:z-10 active:scale-95",
        isDimmed && "opacity-30 grayscale pointer-events-none",
        isFocused && "scale-110"
      )}
      style={{ width: buttonSize, height: buttonSize }}
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
    </div>
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
}: MergedBackgroundProps) {
  const iconMap = useMemo(() => {
    const map: boolean[][] = []
    for (let r = 0; r < rows; r++) {
      map[r] = []
      for (let c = 0; c < cols; c++) {
        const button = buttonsWithHints.find(
          (btn) => btn.position.row === r && btn.position.col === c
        )
        map[r][c] = !!button
      }
    }
    return map
  }, [buttonsWithHints, rows, cols])

  const generatePaths = () => {
    const cellSize = buttonSize

    // Find connected regions using flood fill
    const visited = new Set<string>()
    const regions: Set<string>[] = []

    const floodFill = (startRow: number, startCol: number): Set<string> => {
      const region = new Set<string>()
      const stack = [{ row: startRow, col: startCol }]

      while (stack.length > 0) {
        const { row, col } = stack.pop()!
        const key = `${row},${col}`

        if (visited.has(key)) continue
        if (row < 0 || row >= rows || col < 0 || col >= cols) continue
        if (!iconMap[row]?.[col]) continue

        visited.add(key)
        region.add(key)

        stack.push({ row: row - 1, col })
        stack.push({ row: row + 1, col })
        stack.push({ row, col: col - 1 })
        stack.push({ row, col: col + 1 })
      }

      return region
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (iconMap[r]?.[c] && !visited.has(`${r},${c}`)) {
          const region = floodFill(r, c)
          if (region.size > 0) {
            regions.push(region)
          }
        }
      }
    }

    if (regions.length === 0) return null

    const paths: string[] = []

    for (const region of regions) {
      const inRegion = (r: number, c: number) => region.has(`${r},${c}`)

      type Edge = { x1: number; y1: number; x2: number; y2: number }
      const edges: Edge[] = []

      for (const key of region) {
        const [r, c] = key.split(",").map(Number)
        const x = c * cellSize
        const y = r * cellSize

        if (!inRegion(r - 1, c)) {
          edges.push({ x1: x, y1: y, x2: x + cellSize, y2: y })
        }
        if (!inRegion(r, c + 1)) {
          edges.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize })
        }
        if (!inRegion(r + 1, c)) {
          edges.push({ x1: x + cellSize, y1: y + cellSize, x2: x, y2: y + cellSize })
        }
        if (!inRegion(r, c - 1)) {
          edges.push({ x1: x, y1: y + cellSize, x2: x, y2: y })
        }
      }

      if (edges.length === 0) continue

      const usedEdges = new Set<number>()
      const orderedPoints: { x: number; y: number }[] = []

      orderedPoints.push({ x: edges[0].x1, y: edges[0].y1 })
      orderedPoints.push({ x: edges[0].x2, y: edges[0].y2 })
      usedEdges.add(0)

      while (usedEdges.size < edges.length) {
        const lastPoint = orderedPoints[orderedPoints.length - 1]
        let foundNext = false

        for (let i = 0; i < edges.length; i++) {
          if (usedEdges.has(i)) continue
          const edge = edges[i]

          if (
            Math.abs(edge.x1 - lastPoint.x) < 0.5 &&
            Math.abs(edge.y1 - lastPoint.y) < 0.5
          ) {
            orderedPoints.push({ x: edge.x2, y: edge.y2 })
            usedEdges.add(i)
            foundNext = true
            break
          }
        }

        if (!foundNext) break
      }

      if (orderedPoints.length > 1) {
        const first = orderedPoints[0]
        const last = orderedPoints[orderedPoints.length - 1]
        if (
          Math.abs(first.x - last.x) < 0.5 &&
          Math.abs(first.y - last.y) < 0.5
        ) {
          orderedPoints.pop()
        }
      }

      if (orderedPoints.length < 3) continue

      const paddedPath = generatePaddedPathWithRoundedCorners(
        orderedPoints,
        padding,
        radius,
        cellSize
      )
      paths.push(paddedPath)
    }

    return { paths, totalWidth: cols * cellSize, totalHeight: rows * cellSize }
  }

  const generatePaddedPathWithRoundedCorners = (
    points: { x: number; y: number }[],
    pad: number,
    r: number,
    cellSize: number
  ): string => {
    const n = points.length
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

  const result = generatePaths()

  if (!result || result.paths.length === 0) return null

  const { paths, totalWidth, totalHeight } = result

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        top: 0,
        left: 0,
        width: totalWidth + padding * 2,
        height: totalHeight + padding * 2,
      }}
      viewBox={`${-padding} ${-padding} ${totalWidth + padding * 2} ${totalHeight + padding * 2}`}
    >
      {paths.map((path, i) => (
        <path
          key={i}
          d={path}
          fill={bgColor}
          fillOpacity={bgOpacity}
        />
      ))}
    </svg>
  )
}

