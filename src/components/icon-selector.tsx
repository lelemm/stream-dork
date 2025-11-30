import { useState, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import type { IconLibrary, IconLibraryIcon } from "@/types/electron"
import { ChevronDown, ChevronRight, FolderOpen, Image, Search, X } from "lucide-react"

interface IconSelectorProps {
  currentIcon?: string
  iconLibraries: IconLibrary[]
  onIconSelect: (iconDataUrl: string) => void
  className?: string
}

interface IconSelectorModalProps extends IconSelectorProps {
  isOpen: boolean
  onClose: () => void
}

function IconLibrarySection({
  library,
  searchQuery,
  onIconSelect,
}: {
  library: IconLibrary
  searchQuery: string
  onIconSelect: (iconDataUrl: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  const filteredIcons = useMemo(() => {
    if (!searchQuery) return library.icons
    const query = searchQuery.toLowerCase()
    return library.icons.filter(
      (icon) =>
        icon.name.toLowerCase().includes(query) ||
        icon.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  }, [library.icons, searchQuery])

  if (filteredIcons.length === 0) return null

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left p-2 hover:bg-muted/50 rounded-md"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        {library.icon ? (
          <img
            src={library.icon}
            alt={library.name}
            className="w-6 h-6 object-contain rounded"
          />
        ) : (
          <div className="w-6 h-6 bg-muted rounded flex items-center justify-center">
            <Image className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <span className="font-medium text-sm">{library.name}</span>
        <span className="text-xs text-muted-foreground">({filteredIcons.length})</span>
      </button>

      {isExpanded && (
        <div className="grid grid-cols-6 gap-2 mt-2 pl-8">
          {filteredIcons.map((icon) => (
            <button
              key={icon.id}
              onClick={() => onIconSelect(icon.dataUrl)}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors bg-muted/30"
              title={icon.name}
            >
              <img
                src={icon.dataUrl}
                alt={icon.name}
                className="w-full h-full object-contain p-1"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-1">
                <span className="text-[10px] text-white truncate w-full text-center">
                  {icon.name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function IconSelectorModal({
  isOpen,
  onClose,
  currentIcon,
  iconLibraries,
  onIconSelect,
}: IconSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSelectLocalFile = useCallback(async () => {
    const result = await window.electron?.selectIconFile()
    if (result) {
      onIconSelect(result)
      onClose()
    }
  }, [onIconSelect, onClose])

  const handleIconSelect = useCallback(
    (iconDataUrl: string) => {
      onIconSelect(iconDataUrl)
      onClose()
    },
    [onIconSelect, onClose]
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-lg">Select Icon</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search icons..."
              className="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-b border-border">
          <button
            onClick={handleSelectLocalFile}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            <span className="text-sm font-medium">Select Local File</span>
          </button>
        </div>

        {/* Icon Libraries */}
        <div className="flex-1 overflow-y-auto p-4">
          {iconLibraries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No icon libraries found.</p>
              <p className="text-xs mt-1">
                Add icon packs to the &quot;icons&quot; folder to see them here.
              </p>
            </div>
          ) : (
            iconLibraries.map((library) => (
              <IconLibrarySection
                key={library.id}
                library={library}
                searchQuery={searchQuery}
                onIconSelect={handleIconSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function IconSelector({
  currentIcon,
  iconLibraries,
  onIconSelect,
  className,
}: IconSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <div className={cn("flex items-center gap-3", className)}>
        {/* Current Icon Preview */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="relative w-16 h-16 rounded-lg border border-border bg-muted/30 overflow-hidden hover:border-primary transition-colors group"
        >
          {currentIcon ? (
            <img
              src={currentIcon}
              alt="Current icon"
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-xs text-white font-medium">Change</span>
          </div>
        </button>

        {/* Icon Actions */}
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-xs text-primary hover:underline text-left"
          >
            Open Icon Library
          </button>
          <button
            onClick={async () => {
              const result = await window.electron?.selectIconFile()
              if (result) {
                onIconSelect(result)
              }
            }}
            className="text-xs text-primary hover:underline text-left"
          >
            Select Local File
          </button>
        </div>
      </div>

      <IconSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentIcon={currentIcon}
        iconLibraries={iconLibraries}
        onIconSelect={onIconSelect}
      />
    </>
  )
}

