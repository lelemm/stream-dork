import { useDeckStore } from "@/lib/deck-store"
import { GridButton } from "./grid-button"
import { useMemo, useState, useRef } from "react"
import type { GridButton as GridButtonType } from "@/lib/types"

interface ButtonGridProps {
  isSetupMode: boolean
  fitToViewport?: boolean
  onButtonDrop?: (row: number, col: number) => void
  onButtonClick?: (buttonId: string) => void
}

export function ButtonGrid({ isSetupMode, fitToViewport = false, onButtonDrop, onButtonClick }: ButtonGridProps) {
  const { config, activeScene, selectedButton, setSelectedButton, removeButton, moveButton, copyButton, pasteButton, executeAction } = useDeckStore()
  const [clipboard, setClipboard] = useState<GridButtonType | null>(null)
  const draggedButtonId = useRef<string | null>(null)

  // Use active scene's config, fallback to legacy config
  const scene = activeScene || (config.scenes && config.scenes[0]) || null
  const rows = scene?.rows ?? config.rows ?? 3
  const cols = scene?.cols ?? config.cols ?? 5
  const buttons = scene?.buttons ?? config.buttons ?? []

  const getButtonAtPosition = (row: number, col: number) => {
    return buttons.find((btn) => btn.position.row === row && btn.position.col === col)
  }

  const hasIcon = (row: number, col: number) => {
    const button = getButtonAtPosition(row, col)
    return button?.icon || button?.action
  }

  const iconMap = useMemo(() => {
    const map: boolean[][] = []
    for (let r = 0; r < rows; r++) {
      map[r] = []
      for (let c = 0; c < cols; c++) {
        map[r][c] = !!hasIcon(r, c)
      }
    }
    return map
  }, [buttons, rows, cols])

  const handleButtonClick = (row: number, col: number) => {
    const button = getButtonAtPosition(row, col)

    if (isSetupMode) {
      if (button) {
        setSelectedButton(button)
        onButtonClick?.(button.id)
      }
    } else {
      if (button) {
        executeAction(button.id)
      }
    }
  }

  const handleCopy = (buttonId: string) => {
    const copied = copyButton(buttonId)
    if (copied) {
      setClipboard(copied)
    }
  }

  const handlePaste = (row: number, col: number) => {
    if (clipboard) {
      pasteButton(clipboard, row, col)
    }
  }

  const handleMove = (targetRow: number, targetCol: number) => {
    if (draggedButtonId.current) {
      moveButton(draggedButtonId.current, targetRow, targetCol)
      draggedButtonId.current = null
    }
  }

  const handleDragStart = (buttonId: string) => {
    draggedButtonId.current = buttonId
  }

  const padding = config.backgroundPadding || 8
  const radius = config.buttonRadius || 16
  const bgColor = config.backgroundColor || "#1a1a1a"

  if (fitToViewport) {
    // Setup mode: fit to viewport with square buttons
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div
          className="relative"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            aspectRatio: `${cols} / ${rows}`,
            maxWidth: "100%",
            maxHeight: "100%",
            width: cols >= rows ? "100%" : "auto",
            height: cols < rows ? "100%" : "auto",
          }}
        >
          <MergedBackground
            rows={rows}
            cols={cols}
            iconMap={iconMap}
            padding={padding}
            radius={radius}
            bgColor={bgColor}
          />

          {/* Buttons layer */}
          {Array.from({ length: rows * cols }).map((_, index) => {
            const row = Math.floor(index / cols)
            const col = index % cols
            const button = getButtonAtPosition(row, col)

            return (
              <div
                key={`${row}-${col}`}
                className="relative aspect-square"
                style={{ gridColumn: col + 1, gridRow: row + 1 }}
                onDragStart={() => button && handleDragStart(button.id)}
              >
                <GridButton
                  button={button}
                  isSetupMode={isSetupMode}
                  isSelected={isSetupMode && !!button && selectedButton?.id === button.id}
                  position={{ row, col }}
                  buttonSize={0}
                  useFlexSize={true}
                  radius={radius}
                  hasBackground={iconMap[row]?.[col] || false}
                  onDrop={onButtonDrop}
                  onMove={() => handleMove(row, col)}
                  onClick={() => handleButtonClick(row, col)}
                  onRemove={() => button && removeButton(button.id)}
                  onCopy={() => button && handleCopy(button.id)}
                  onPaste={() => handlePaste(row, col)}
                  canPaste={!!clipboard}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Overlay mode: use configured pixel size with square buttons
  const gridSize = config.gridSizePixels || 400
  const buttonSize = Math.floor(gridSize / Math.max(rows, cols))
  const gridWidth = buttonSize * cols
  const gridHeight = buttonSize * rows

  return (
    <div
      className="relative"
      style={{
        width: gridWidth + padding * 2,
        height: gridHeight + padding * 2,
        padding: padding,
      }}
    >
      <MergedBackground
        rows={rows}
        cols={cols}
        iconMap={iconMap}
        padding={padding}
        radius={radius}
        bgColor={bgColor}
        buttonSize={buttonSize}
      />

      {/* Buttons layer */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${buttonSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${buttonSize}px)`,
        }}
      >
        {Array.from({ length: rows * cols }).map((_, index) => {
          const row = Math.floor(index / cols)
          const col = index % cols
          const button = getButtonAtPosition(row, col)

          return (
            <div
              key={`${row}-${col}`}
              onDragStart={() => button && handleDragStart(button.id)}
            >
              <GridButton
                button={button}
                isSetupMode={isSetupMode}
                isSelected={false}
                position={{ row, col }}
                buttonSize={buttonSize}
                radius={radius}
                hasBackground={iconMap[row]?.[col] || false}
                onDrop={onButtonDrop}
                onMove={() => handleMove(row, col)}
                onClick={() => handleButtonClick(row, col)}
                onRemove={() => button && removeButton(button.id)}
                onCopy={() => button && handleCopy(button.id)}
                onPaste={() => handlePaste(row, col)}
                canPaste={!!clipboard}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface MergedBackgroundProps {
  rows: number
  cols: number
  iconMap: boolean[][]
  padding: number
  radius: number
  bgColor: string
  buttonSize?: number
}

function MergedBackground({ rows, cols, iconMap, padding, radius, bgColor, buttonSize }: MergedBackgroundProps) {
  const generatePaths = () => {
    const usePixels = buttonSize !== undefined
    const cellSize = usePixels ? buttonSize : 100

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

      // Use marching squares to trace the outline
      // We work on a grid of corners (rows+1 x cols+1)
      // Each corner has 4 adjacent cells, we encode which are in the region

      // Find all boundary edges
      type Edge = { x1: number; y1: number; x2: number; y2: number }
      const edges: Edge[] = []

      for (const key of region) {
        const [r, c] = key.split(",").map(Number)
        const x = c * cellSize
        const y = r * cellSize

        // Top edge - if cell above is not in region
        if (!inRegion(r - 1, c)) {
          edges.push({ x1: x, y1: y, x2: x + cellSize, y2: y })
        }
        // Right edge - if cell to right is not in region
        if (!inRegion(r, c + 1)) {
          edges.push({ x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize })
        }
        // Bottom edge - if cell below is not in region
        if (!inRegion(r + 1, c)) {
          edges.push({ x1: x + cellSize, y1: y + cellSize, x2: x, y2: y + cellSize })
        }
        // Left edge - if cell to left is not in region
        if (!inRegion(r, c - 1)) {
          edges.push({ x1: x, y1: y + cellSize, x2: x, y2: y })
        }
      }

      if (edges.length === 0) continue

      // Chain edges together to form a closed polygon
      const usedEdges = new Set<number>()
      const orderedPoints: { x: number; y: number }[] = []

      // Start with first edge
      orderedPoints.push({ x: edges[0].x1, y: edges[0].y1 })
      orderedPoints.push({ x: edges[0].x2, y: edges[0].y2 })
      usedEdges.add(0)

      while (usedEdges.size < edges.length) {
        const lastPoint = orderedPoints[orderedPoints.length - 1]
        let foundNext = false

        for (let i = 0; i < edges.length; i++) {
          if (usedEdges.has(i)) continue
          const edge = edges[i]

          // Check if this edge starts where last point is
          if (Math.abs(edge.x1 - lastPoint.x) < 0.5 && Math.abs(edge.y1 - lastPoint.y) < 0.5) {
            orderedPoints.push({ x: edge.x2, y: edge.y2 })
            usedEdges.add(i)
            foundNext = true
            break
          }
        }

        if (!foundNext) break
      }

      // Remove duplicate last point if it matches first
      if (orderedPoints.length > 1) {
        const first = orderedPoints[0]
        const last = orderedPoints[orderedPoints.length - 1]
        if (Math.abs(first.x - last.x) < 0.5 && Math.abs(first.y - last.y) < 0.5) {
          orderedPoints.pop()
        }
      }

      if (orderedPoints.length < 3) continue

      // Now apply padding outward and generate path with rounded corners
      // First, determine the direction of each edge and the turn at each corner

      const paddedPath = generatePaddedPathWithRoundedCorners(orderedPoints, padding, radius, cellSize, inRegion)
      paths.push(paddedPath)
    }

    return { paths, totalWidth: cols * cellSize, totalHeight: rows * cellSize }
  }

  const generatePaddedPathWithRoundedCorners = (
    points: { x: number; y: number }[],
    pad: number,
    r: number,
    cellSize: number,
    inRegion: (row: number, col: number) => boolean,
  ): string => {
    const n = points.length

    // Calculate padded points - each corner pushes outward based on adjacent edges
    const paddedPoints: { x: number; y: number; isOuterCorner: boolean }[] = []

    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n]
      const curr = points[i]
      const next = points[(i + 1) % n]

      // Edge from prev to curr
      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y

      // Edge from curr to next
      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y

      // Normal vectors pointing outward (perpendicular to edge, outward from polygon)
      // For a clockwise polygon, outward is to the right of the edge direction
      // We need to determine if our polygon is CW or CCW

      // Outward normal for edge 1 (prev->curr): rotate 90° clockwise
      const n1x = dy1 === 0 ? 0 : dy1 > 0 ? 1 : -1
      const n1y = dx1 === 0 ? 0 : dx1 > 0 ? -1 : 1

      // Outward normal for edge 2 (curr->next): rotate 90° clockwise
      const n2x = dy2 === 0 ? 0 : dy2 > 0 ? 1 : -1
      const n2y = dx2 === 0 ? 0 : dx2 > 0 ? -1 : 1

      // Average the normals for corner offset
      let offsetX = (n1x + n2x) * pad
      let offsetY = (n1y + n2y) * pad

      // Normalize for diagonal corners
      if (n1x !== n2x && n1y !== n2y) {
        // This is a corner (not straight)
        offsetX = n1x * pad + n2x * pad
        offsetY = n1y * pad + n2y * pad
      } else if (n1x === n2x && n1y === n2y) {
        // Straight line, just offset
        offsetX = n1x * pad
        offsetY = n1y * pad
      }

      // Determine if this is an outer corner (convex) or inner corner (concave)
      // Cross product of edge vectors: if positive, it's a left turn (inner), if negative, right turn (outer)
      const cross = dx1 * dy2 - dy1 * dx2
      const isOuterCorner = cross < 0

      paddedPoints.push({
        x: curr.x + offsetX,
        y: curr.y + offsetY,
        isOuterCorner,
      })
    }

    // Generate SVG path with rounded corners
    let path = ""
    const effectiveRadius = Math.min(r, cellSize / 2)

    for (let i = 0; i < paddedPoints.length; i++) {
      const prev = paddedPoints[(i - 1 + paddedPoints.length) % paddedPoints.length]
      const curr = paddedPoints[i]
      const next = paddedPoints[(i + 1) % paddedPoints.length]

      // Vector from prev to curr
      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)

      // Vector from curr to next
      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

      const cornerRadius = Math.min(effectiveRadius, len1 / 2, len2 / 2)

      // Points for the arc
      const arcStartX = curr.x - (len1 > 0 ? (dx1 / len1) * cornerRadius : 0)
      const arcStartY = curr.y - (len1 > 0 ? (dy1 / len1) * cornerRadius : 0)
      const arcEndX = curr.x + (len2 > 0 ? (dx2 / len2) * cornerRadius : 0)
      const arcEndY = curr.y + (len2 > 0 ? (dy2 / len2) * cornerRadius : 0)

      if (i === 0) {
        path += `M ${arcStartX} ${arcStartY} `
      } else {
        path += `L ${arcStartX} ${arcStartY} `
      }

      // Add arc using quadratic bezier with corner point as control
      if (cornerRadius > 0 && len1 > 0 && len2 > 0) {
        path += `Q ${curr.x} ${curr.y} ${arcEndX} ${arcEndY} `
      }
    }

    // Close path back to start
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

  if (buttonSize === undefined) {
    return (
      <svg
        className="absolute pointer-events-none"
        style={{
          top: `-${padding}px`,
          left: `-${padding}px`,
          width: `calc(100% + ${padding * 2}px)`,
          height: `calc(100% + ${padding * 2}px)`,
        }}
        viewBox={`${-padding} ${-padding} ${totalWidth + padding * 2} ${totalHeight + padding * 2}`}
        preserveAspectRatio="none"
      >
        {paths.map((path, i) => (
          <path key={i} d={path} fill={bgColor} />
        ))}
      </svg>
    )
  }

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
        <path key={i} d={path} fill={bgColor} />
      ))}
    </svg>
  )
}
