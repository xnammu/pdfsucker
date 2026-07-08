"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Move, AlertTriangle, CheckCircle2, RefreshCw, GripVertical, Sparkles, Loader2, Trash2, Layers, Crop, Scissors } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { PDFFile, PDFPage } from "@/lib/types"
import { renderHighResPage } from "@/lib/pdf-processor"

interface PagePreviewProps {
  files: PDFFile[]
  selectedFileId: string | null
  selectedPageNumber: number
  onSelectFile: (fileId: string) => void
  onSelectPage: (pageNumber: number) => void
  onUpdatePageTransform: (fileId: string, pageNumber: number, updates: Partial<PDFPage>) => void
  onMasterTransform: (fileId: string, action: 'rotateCw' | 'rotateCcw' | 'flipX' | 'flipY') => void
  onDeletePage: (fileId: string, pageNumber: number) => void
  onDeleteMultiplePages: (fileId: string, pageNumbers: number[]) => void
}

export function PagePreview({
  files,
  selectedFileId,
  selectedPageNumber,
  onSelectFile,
  onSelectPage,
  onUpdatePageTransform,
  onMasterTransform,
  onDeletePage,
  onDeleteMultiplePages,
}: PagePreviewProps) {
  const [zoom, setZoom] = useState(125)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isAllEnabled, setIsAllEnabled] = useState(false)
  const [pageQualities, setPageQualities] = useState<Record<string, "hd" | "fhd" | "standard">>({})
  const [hdUrl, setHdUrl] = useState<string | null>(null)
  const [isHdLoading, setIsHdLoading] = useState(false)
  const [lastClickedPage, setLastClickedPage] = useState<number | null>(null)

  const selectedFile = files.find((f) => f.id === selectedFileId)
  const selectedPage = selectedFile?.pages.find(
    (p) => p.pageNumber === selectedPageNumber && !p.deleted
  )
  
  const [isCropActive, setIsCropActive] = useState(false)
  const [cropBox, setCropBox] = useState({ x: 15, y: 15, w: 70, h: 70 })
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const [isExportingSnippet, setIsExportingSnippet] = useState(false)
  const dragStartRef = useRef<{ x: number, y: number, box: typeof cropBox } | null>(null)

  const handleStartDrag = (e: React.MouseEvent, handle: string) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveHandle(handle)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      box: { ...cropBox }
    }
  }

  const handleExportSnippet = async () => {
    if (!selectedFile || !selectedPage || isExportingSnippet) return
    setIsExportingSnippet(true)
    try {
      const { renderCropSnippet } = await import("@/lib/pdf-processor")
      const snippetUrl = await renderCropSnippet(
        selectedFile,
        selectedPage.pageNumber,
        cropBox,
        selectedPage.rotation,
        selectedPage.flipX,
        selectedPage.flipY
      )
      
      const link = document.createElement("a")
      link.href = snippetUrl
      const cleanFileName = selectedFile.name.replace(/\.pdf$/i, "")
      link.download = `${cleanFileName}-page-${selectedPage.pageNumber}-snippet.png`
      link.click()
      
      // Safe timeout to prevent browser race conditions revoking the URL before the download starts
      setTimeout(() => {
        URL.revokeObjectURL(snippetUrl)
      }, 1000)
    } catch (error) {
      console.error("Failed to export snippet:", error)
      alert("Failed to export snippet. Please try again.")
    } finally {
      setIsExportingSnippet(false)
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeHandle || !dragStartRef.current || !selectedFile || !selectedPage) return
      
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      
      const isRotated = selectedPage.rotation === 90 || selectedPage.rotation === 270
      const originalRatio = selectedPage.width / selectedPage.height
      const visualWidth = 400
      const visualHeight = isRotated ? 400 * originalRatio : 400 / originalRatio
      const innerWidth = isRotated ? visualHeight : visualWidth
      const innerHeight = isRotated ? visualWidth : visualHeight
      
      const zoomScale = zoom / 100
      const pctDx = (dx / (innerWidth * zoomScale)) * 100
      const pctDy = (dy / (innerHeight * zoomScale)) * 100
      
      let localDx = pctDx
      let localDy = pctDy
      
      const rot = selectedPage.rotation || 0
      if (rot === 90) {
        localDx = pctDy
        localDy = -pctDx
      } else if (rot === 180) {
        localDx = -pctDx
        localDy = -pctDy
      } else if (rot === 270) {
        localDx = -pctDy
        localDy = pctDx
      }
      
      if (selectedPage.flipX) localDx = -localDx
      if (selectedPage.flipY) localDy = -localDy
      
      const startBox = dragStartRef.current.box
      let newBox = { ...startBox }
      
      if (activeHandle === "move") {
        newBox.x = Math.max(0, Math.min(100 - startBox.w, startBox.x + localDx))
        newBox.y = Math.max(0, Math.min(100 - startBox.h, startBox.y + localDy))
      } else {
        if (activeHandle.includes("l")) {
          const newX = Math.max(0, Math.min(startBox.x + startBox.w - 5, startBox.x + localDx))
          newBox.w = startBox.x + startBox.w - newX
          newBox.x = newX
        }
        if (activeHandle.includes("r")) {
          newBox.w = Math.max(5, Math.min(100 - startBox.x, startBox.w + localDx))
        }
        if (activeHandle.includes("t")) {
          const newY = Math.max(0, Math.min(startBox.y + startBox.h - 5, startBox.y + localDy))
          newBox.h = startBox.y + startBox.h - newY
          newBox.y = newY
        }
        if (activeHandle.includes("b")) {
          newBox.h = Math.max(5, Math.min(100 - startBox.y, startBox.h + localDy))
        }
      }
      
      setCropBox(newBox)
    }
    
    const handleMouseUp = () => {
      setActiveHandle(null)
      dragStartRef.current = null
    }
    
    if (activeHandle) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [activeHandle, selectedFile, selectedPage, zoom])



  useEffect(() => {
    if (selectedPage) {
      const isLandscape = selectedPage.width > selectedPage.height
      setZoom(isLandscape ? 225 : 125)
      setOffset({ x: 0, y: 0 })
    }
  }, [selectedPage?.pageNumber, selectedFileId])

  const pageKey = selectedFile ? `${selectedFile.id}-${selectedPageNumber}` : ""
  const currentQuality = pageQualities[pageKey] || "standard"

  useEffect(() => {
    let active = true
    let currentHdUrl: string | null = null

    const loadHd = async () => {
      if (currentQuality === "standard" || !selectedFile || !selectedPage) {
        setHdUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return null
        })
        return
      }

      setIsHdLoading(true)
      try {
        const scale = currentQuality === "fhd" ? 4.0 : 2.0
        const url = await renderHighResPage(selectedFile, selectedPage.pageNumber, scale)
        if (active) {
          setHdUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
          currentHdUrl = url
        } else {
          URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error("Failed to render HD/FHD page:", error)
      } finally {
        if (active) {
          setIsHdLoading(false)
        }
      }
    }

    loadHd()

    return () => {
      active = false
      if (currentHdUrl) {
        URL.revokeObjectURL(currentHdUrl)
      }
    }
  }, [currentQuality, selectedFileId, selectedPageNumber])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedFile) return
        
        const checkedPageNumbers = selectedFile.pages
          .filter((p) => p.selected && !p.deleted)
          .map((p) => p.pageNumber)

        if (checkedPageNumbers.length > 0) {
          e.preventDefault()
          onDeleteMultiplePages(selectedFile.id, checkedPageNumbers)
        } else if (selectedPage) {
          const activePagesCount = selectedFile.pages.filter(p => !p.deleted).length
          if (activePagesCount > 1) {
            e.preventDefault()
            onDeleteMultiplePages(selectedFile.id, [selectedPage.pageNumber])
          }
        }
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault()
        handleResetZoom()
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        handleZoomIn()
      } else if (e.key === "-") {
        e.preventDefault()
        handleZoomOut()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (!selectedFile) return
        const activePages = selectedFile.pages.filter(p => !p.deleted)
        const currIdx = activePages.findIndex(p => p.pageNumber === selectedPageNumber)
        if (currIdx > 0) {
          e.preventDefault()
          onSelectPage(activePages[currIdx - 1].pageNumber)
        }
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (!selectedFile) return
        const activePages = selectedFile.pages.filter(p => !p.deleted)
        const currIdx = activePages.findIndex(p => p.pageNumber === selectedPageNumber)
        if (currIdx >= 0 && currIdx < activePages.length - 1) {
          e.preventDefault()
          onSelectPage(activePages[currIdx + 1].pageNumber)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedFile, selectedPage, selectedPageNumber, onDeleteMultiplePages])

  const handleToggleQuality = (quality: "hd" | "fhd") => {
    if (!selectedFile || !selectedPage) return

    setPageQualities((prev) => {
      const next = { ...prev }
      
      if (isAllEnabled) {
        // Apply to all pages in the current file
        const pages = selectedFile.pages
        const allAlreadyHaveIt = pages.every(p => prev[`${selectedFile.id}-${p.pageNumber}`] === quality)
        
        pages.forEach((p) => {
          const key = `${selectedFile.id}-${p.pageNumber}`
          if (allAlreadyHaveIt) {
            next[key] = "standard"
          } else {
            next[key] = quality
          }
        })
      } else {
        // Apply to the current page only
        const key = `${selectedFile.id}-${selectedPage.pageNumber}`
        if (prev[key] === quality) {
          next[key] = "standard"
        } else {
          next[key] = quality
        }
      }
      
      return next
    })
  }

  const clampOffset = (x: number, y: number, scale: number) => {
    if (!scrollRef.current) return { x, y }
    const rect = scrollRef.current.getBoundingClientRect()
    
    const isRotated = selectedPage?.rotation === 90 || selectedPage?.rotation === 270
    const originalRatio = selectedPage ? selectedPage.width / selectedPage.height : 3/4
    const visualWidth = 400
    const visualHeight = isRotated ? 400 * originalRatio : 400 / originalRatio

    const imgWidth = visualWidth * scale
    const imgHeight = visualHeight * scale
    
    const maxX = Math.max(0, (imgWidth - rect.width) / 2)
    const minX = -maxX
    
    const maxY = Math.max(0, (imgHeight - rect.height) / 2)
    const minY = -maxY
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    }
  }

  const doZoom = (newZoom: number, mouseX = 0, mouseY = 0, centerTarget = false) => {
    setZoom((prevZoom) => {
      if (prevZoom === newZoom) return prevZoom
      const oldScale = prevZoom / 100
      const newScale = newZoom / 100
      const ratio = newScale / oldScale
      
      setOffset((prev) => {
        let newX, newY
        if (centerTarget) {
          newX = -((mouseX - prev.x) / oldScale) * newScale
          newY = -((mouseY - prev.y) / oldScale) * newScale
        } else {
          newX = mouseX - (mouseX - prev.x) * ratio
          newY = mouseY - (mouseY - prev.y) * ratio
        }
        return clampOffset(newX, newY, newScale)
      })
      
      return newZoom
    })
  }

  const handleZoomIn = () => doZoom(Math.min(zoom + 25, 10000))
  const handleZoomOut = () => doZoom(Math.max(zoom - 25, 25))
  const handleResetZoom = () => {
    const isLandscape = selectedPage ? selectedPage.width > selectedPage.height : false
    setZoom(isLandscape ? 225 : 125)
    setOffset({ x: 0, y: 0 })
  }

  // Drag to pan logic
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false)
  const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return
    e.preventDefault() // Prevents default image dragging
    setIsDragging(true)
  }

  const onToolbarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingToolbar(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingToolbar && containerRef.current && toolbarRef.current) {
        e.preventDefault()
        const containerRect = containerRef.current.getBoundingClientRect()
        const toolbarRect = toolbarRef.current.getBoundingClientRect()
        
        setToolbarOffset((prev) => {
          const newX = prev.x + e.movementX
          const newY = prev.y + e.movementY
          
          const maxOffsetX = Math.max(0, (containerRect.width - toolbarRect.width) / 2)
          const minOffsetX = -maxOffsetX
          
          const minOffsetY = -(containerRect.height - 16 - toolbarRect.height)
          const maxOffsetY = 16
          
          return {
            x: Math.max(minOffsetX, Math.min(maxOffsetX, newX)),
            y: Math.max(minOffsetY, Math.min(maxOffsetY, newY)),
          }
        })
      }
    }
    const handleMouseUp = () => {
      setIsDraggingToolbar(false)
    }

    if (isDraggingToolbar) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingToolbar])

  const onMouseLeave = () => {
    setIsDragging(false)
  }
  const onMouseUp = () => {
    setIsDragging(false)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDraggingToolbar) return
    
    if (!isDragging) return
    e.preventDefault()
    setOffset((prev) => clampOffset(prev.x + e.movementX, prev.y + e.movementY, zoom / 100))
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!scrollRef.current) return
    const rect = scrollRef.current.getBoundingClientRect()
    
    // Mouse position relative to center of the container
    const mouseX = e.clientX - rect.left - rect.width / 2
    const mouseY = e.clientY - rect.top - rect.height / 2

    let newZoom = zoom
    if (e.deltaY < 0) {
      newZoom = Math.min(zoom + 25, 10000)
    } else if (e.deltaY > 0) {
      newZoom = Math.max(zoom - 25, 25)
    }

    doZoom(newZoom, mouseX, mouseY)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!scrollRef.current) return
    const rect = scrollRef.current.getBoundingClientRect()
    
    // Mouse position relative to center of the container
    const mouseX = e.clientX - rect.left - rect.width / 2
    const mouseY = e.clientY - rect.top - rect.height / 2

    const defaultZoom = selectedPage && selectedPage.width > selectedPage.height ? 225 : 125

    if (zoom !== defaultZoom) {
      handleResetZoom()
    } else {
      doZoom(400, mouseX, mouseY, true)
    }
  }

  const getStatusColor = (status: PDFPage["status"]) => {
    switch (status) {
      case "complete":
        return "ring-primary"
      case "error":
        return "ring-destructive"
      case "processing":
        return "ring-accent"
      default:
        return "ring-transparent"
    }
  }

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full bg-secondary/30 rounded-lg">
        <div className="text-center p-8">
          <div className="p-4 rounded-full bg-secondary inline-block mb-4">
            <Move className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            Upload a PDF to preview pages
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background rounded-2xl overflow-hidden relative shadow-inner border border-border/20">
      {/* Top Bar with Floating Pill Toolbar */}
      <div className="flex items-center justify-between p-4 relative z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-wide text-foreground">Preview</span>
          {selectedFile.metadata?.hasCMYK && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/20 text-warning text-[10px] font-bold tracking-widest uppercase">
              <AlertTriangle className="h-3 w-3" />
              <span>CMYK</span>
            </div>
          )}
        </div>
        
        {/* Premium Floating Machined Toolbar */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-card/60 backdrop-blur-xl border border-primary/30 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {/* Master Controls */}
          <div className="flex items-center gap-1 border-r border-border/50 pr-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors" onClick={() => onMasterTransform(selectedFile.id, 'rotateCcw')} title="Rotate Counter-Clockwise (Shift+R)">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors" onClick={() => onMasterTransform(selectedFile.id, 'rotateCw')} title="Rotate Clockwise (R)">
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors" onClick={() => onMasterTransform(selectedFile.id, 'flipX')}>
              <FlipHorizontal className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors" onClick={() => onMasterTransform(selectedFile.id, 'flipY')}>
              <FlipVertical className="h-4 w-4" />
            </Button>
          </div>
          {/* HD/FHD Quality Selector */}
          <div className="flex items-center gap-1.5 border-r border-border/50 pr-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAllEnabled(!isAllEnabled)}
              className={cn(
                "h-7 px-3 text-[11px] font-bold tracking-wider uppercase rounded-full transition-all duration-300",
                isAllEnabled 
                  ? "bg-primary/20 text-primary border border-primary/50 glow-text" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleQuality("hd")}
              disabled={isHdLoading && currentQuality !== "hd"}
              className={cn(
                "h-7 px-3 text-[11px] font-bold tracking-wider uppercase rounded-full transition-all duration-300 gap-1.5",
                currentQuality === "hd"
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_var(--color-primary)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isHdLoading && currentQuality === "hd" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              HD
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleQuality("fhd")}
              disabled={isHdLoading && currentQuality !== "fhd"}
              className={cn(
                "h-7 px-3 text-[11px] font-bold tracking-wider uppercase rounded-full transition-all duration-300 gap-1.5",
                currentQuality === "fhd"
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_var(--color-primary)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isHdLoading && currentQuality === "fhd" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              FHD
            </Button>
          </div>
          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= 25}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-[11px] font-bold tracking-wider text-primary w-12 text-center glow-text">
              {zoom}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= 10000}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                handleResetZoom()
                if (selectedFile) {
                  // Reset page quality overrides back to standard blurry
                  setPageQualities((prev) => {
                    const next = { ...prev }
                    selectedFile.pages.forEach((p) => {
                      delete next[`${selectedFile.id}-${p.pageNumber}`]
                    })
                    return next
                  })
                  // Reset all page rotations, flips, and selections back to defaults
                  selectedFile.pages.forEach((p) => {
                    onUpdatePageTransform(selectedFile.id, p.pageNumber, {
                      rotation: 0,
                      flipX: false,
                      flipY: false,
                      selected: true
                    })
                  })
                }
              }}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/20 transition-colors ml-2"
              title="Reset Zoom & Adjustments (F)"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-36 border-r border-border bg-card/60 flex flex-col z-10 backdrop-blur-sm">
          {/* Static Page Selection Utility Menu */}
          <div className="p-3 border-b border-border/40 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted-foreground uppercase select-none">
            <button
              onClick={() => {
                if (selectedFile) {
                  selectedFile.pages.forEach((p) => {
                    onUpdatePageTransform(selectedFile.id, p.pageNumber, { selected: true })
                  })
                }
              }}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              All
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              onClick={() => {
                if (selectedFile) {
                  selectedFile.pages.forEach((p) => {
                    onUpdatePageTransform(selectedFile.id, p.pageNumber, { selected: false })
                  })
                }
              }}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              None
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              onClick={() => {
                if (selectedFile) {
                  selectedFile.pages.forEach((p) => {
                    onUpdatePageTransform(selectedFile.id, p.pageNumber, { selected: !p.selected })
                  })
                }
              }}
              className="hover:text-primary transition-colors cursor-pointer"
            >
              Inv
            </button>
            {selectedFile.pages.some((p) => p.selected && !p.deleted) && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <button
                  onClick={() => {
                    const checkedPageNumbers = selectedFile.pages
                      .filter((p) => p.selected && !p.deleted)
                      .map((p) => p.pageNumber)
                    
                    if (checkedPageNumbers.length > 0) {
                      onDeleteMultiplePages(selectedFile.id, checkedPageNumbers)
                    }
                  }}
                  className="text-destructive hover:text-destructive/80 transition-all duration-200 cursor-pointer animate-in fade-in scale-in duration-200 p-1 hover:bg-destructive/10 rounded-full flex items-center justify-center"
                  title={`Delete ${selectedFile.pages.filter((p) => p.selected && !p.deleted).length} selected page(s)`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/45 scrollbar-track-transparent">
            <div className="p-3 space-y-3">
              {selectedFile.pages.filter(p => !p.deleted).map((page, idx) => (
                <button
                  key={page.pageNumber}
                  onClick={(e) => {
                    onSelectPage(page.pageNumber)

                    const isShiftPressed = e.shiftKey
                    if (selectedFile) {
                      if (isShiftPressed && lastClickedPage !== null) {
                        const start = Math.min(lastClickedPage, page.pageNumber)
                        const end = Math.max(lastClickedPage, page.pageNumber)
                        const targetSelectedState = !page.selected
                        
                        selectedFile.pages.forEach((p) => {
                          if (p.pageNumber >= start && p.pageNumber <= end) {
                            onUpdatePageTransform(selectedFile.id, p.pageNumber, { selected: targetSelectedState })
                          }
                        })
                      } else {
                        onUpdatePageTransform(selectedFile.id, page.pageNumber, { selected: !page.selected })
                      }
                    }
                    
                    setLastClickedPage(page.pageNumber)
                  }}
                  className={cn(
                    "w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all duration-300 relative group",
                    page.pageNumber === selectedPageNumber
                      ? "border-primary glow-border"
                      : "border-transparent hover:border-primary/50",
                    !page.selected && "opacity-30 grayscale-[50%]"
                  )}
                >
                  {/* Delete Page hover action */}
                  {selectedFile.pages.filter(p => !p.deleted).length > 1 && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeletePage(selectedFile.id, page.pageNumber)
                      }}
                      className="absolute top-1.5 right-1.5 h-6 w-6 bg-destructive hover:bg-destructive/95 text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md"
                      title={`Delete Page ${idx + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </div>
                  )}
                  {/* Custom Checkbox overlay (visual only, events pass through) */}
                  <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                    <div className={cn(
                      "w-4 h-4 rounded-sm border flex items-center justify-center transition-all duration-200",
                      page.selected 
                        ? "bg-primary border-primary text-primary-foreground scale-100 shadow-[0_0_8px_var(--color-primary)]" 
                        : "bg-background/90 border-muted-foreground/50 opacity-0 group-hover:opacity-100 scale-95 hover:scale-100 hover:border-primary"
                    )}>
                      {page.selected && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>
                  </div>
                  {page.previewUrl ? (
                    <Image
                      src={page.previewUrl}
                      alt={`Page ${idx + 1}`}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                      <span className="text-xs font-bold text-muted-foreground">
                        {page.pageNumber}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-md px-1.5 py-1">
                    <span className="text-[10px] font-bold text-foreground block text-center">{idx + 1} / {selectedFile.pages.filter(p => !p.deleted).length}</span>
                  </div>
                  {page.status === "complete" && (
                    <div className="absolute top-1 right-1 drop-shadow-md">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  {page.warnings.length > 0 && (
                    <div className="absolute top-1 left-1 drop-shadow-md">
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!selectedPage ? (
            <div className="flex-1 flex items-center justify-center bg-card text-muted-foreground p-8">
              <div className="text-center space-y-3 max-w-sm">
                <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">No Pages Available</h3>
                <p className="text-xs text-muted-foreground">
                  All pages in this PDF have been deleted. Reset conversion settings or upload a new PDF to restore them.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col relative group" ref={containerRef}>
              {(() => {
                const isRotated = selectedPage?.rotation === 90 || selectedPage?.rotation === 270
                const originalRatio = selectedPage ? selectedPage.width / selectedPage.height : 3/4
              const visualWidth = 400
              const visualHeight = isRotated ? 400 * originalRatio : 400 / originalRatio
              
              const innerWidth = isRotated ? visualHeight : visualWidth
              const innerHeight = isRotated ? visualWidth : visualHeight

              return (
                <>
                  <div 
                    className={cn(
                      "flex-1 overflow-hidden relative flex items-center justify-center", 
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    )}
                    ref={scrollRef}
                    onMouseDown={onMouseDown}
                    onMouseLeave={onMouseLeave}
                    onMouseUp={onMouseUp}
                    onMouseMove={onMouseMove}
                    onWheel={onWheel}
                    onDoubleClick={onDoubleClick}
                  >
                      <div
                        className="relative bg-secondary rounded-lg overflow-hidden shadow-lg flex-shrink-0"
                        style={{
                          width: `${visualWidth}px`,
                          height: `${visualHeight}px`,
                          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom / 100})`,
                          transformOrigin: "center center",
                          transition: isDragging ? "none" : "transform 0.1s ease-out"
                        }}
                      >
                        <div 
                          className="relative overflow-hidden"
                          style={{
                            width: `${innerWidth}px`, 
                            height: `${innerHeight}px`,
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: `translate(-50%, -50%) rotate(${selectedPage?.rotation || 0}deg) scaleX(${selectedPage?.flipX ? -1 : 1}) scaleY(${selectedPage?.flipY ? -1 : 1})`,
                            transition: "transform 0.3s ease-in-out"
                          }}
                        >
                          {(hdUrl || selectedPage?.previewUrl) ? (
                            <Image
                              src={hdUrl || selectedPage!.previewUrl!}
                              alt={hdUrl ? "HD Preview" : "Preview"}
                              fill
                              className="object-contain"
                              draggable={false}
                              unoptimized={!!hdUrl}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                              No preview available
                            </div>
                          )}

                          {isCropActive && (
                            <div className="absolute inset-0 z-30 select-none">
                              <div className="absolute bg-black/40" style={{ left: 0, top: 0, width: "100%", height: `${cropBox.y}%` }} />
                              <div className="absolute bg-black/40" style={{ left: 0, top: `${cropBox.y + cropBox.h}%`, width: "100%", height: `${100 - cropBox.y - cropBox.h}%` }} />
                              <div className="absolute bg-black/40" style={{ left: 0, top: `${cropBox.y}%`, width: `${cropBox.x}%`, height: `${cropBox.h}%` }} />
                              <div className="absolute bg-black/40" style={{ left: `${cropBox.x + cropBox.w}%`, top: `${cropBox.y}%`, width: `${100 - cropBox.x - cropBox.w}%`, height: `${cropBox.h}%` }} />

                              <div
                                className="absolute border-2 border-primary cursor-move flex flex-col justify-between shadow-[0_0_0_1px_rgba(255,255,255,0.5)] group/crop animate-in fade-in zoom-in-95 duration-150"
                                style={{
                                  left: `${cropBox.x}%`,
                                  top: `${cropBox.y}%`,
                                  width: `${cropBox.w}%`,
                                  height: `${cropBox.h}%`,
                                }}
                                onMouseDown={(e) => handleStartDrag(e, "move")}
                              >
                                <div className="absolute inset-0 flex pointer-events-none opacity-40 group-hover/crop:opacity-75 transition-opacity duration-200">
                                  <div className="w-1/3 h-full border-r border-dashed border-white/50" />
                                  <div className="w-1/3 h-full border-r border-dashed border-white/50" />
                                  <div className="absolute inset-0 flex flex-col">
                                    <div className="h-1/3 w-full border-b border-dashed border-white/50" />
                                    <div className="h-1/3 w-full border-b border-dashed border-white/50" />
                                  </div>
                                </div>

                                <div
                                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full cursor-nwse-resize z-40 shadow-md hover:scale-125 transition-transform"
                                  onMouseDown={(e) => handleStartDrag(e, "tl")}
                                />
                                <div
                                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full cursor-nesw-resize z-40 shadow-md hover:scale-125 transition-transform"
                                  onMouseDown={(e) => handleStartDrag(e, "tr")}
                                />
                                <div
                                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full cursor-nesw-resize z-40 shadow-md hover:scale-125 transition-transform"
                                  onMouseDown={(e) => handleStartDrag(e, "bl")}
                                />
                                <div
                                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full cursor-nwse-resize z-40 shadow-md hover:scale-125 transition-transform"
                                  onMouseDown={(e) => handleStartDrag(e, "br")}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                  </div>

                  {/* Floating Page Controls */}
                  {selectedPage && (
                    <div 
                      ref={toolbarRef}
                      className={cn(
                        "absolute bottom-4 left-1/2 flex items-center gap-1 p-1 bg-background/90 backdrop-blur-md border border-border rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity",
                        isDraggingToolbar ? "opacity-100 transition-none" : ""
                      )}
                      style={{
                        transform: `translate(calc(-50% + ${toolbarOffset.x}px), ${toolbarOffset.y}px)`,
                      }}
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary" onClick={() => onUpdatePageTransform(selectedFile.id, selectedPage.pageNumber, { rotation: ((selectedPage.rotation || 0) + 270) % 360 })}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary" onClick={() => onUpdatePageTransform(selectedFile.id, selectedPage.pageNumber, { rotation: ((selectedPage.rotation || 0) + 90) % 360 })}>
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary" onClick={() => onUpdatePageTransform(selectedFile.id, selectedPage.pageNumber, { flipX: !selectedPage.flipX })}>
                        <FlipHorizontal className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary" onClick={() => onUpdatePageTransform(selectedFile.id, selectedPage.pageNumber, { flipY: !selectedPage.flipY })}>
                        <FlipVertical className="h-4 w-4" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-1"></div>
                      <Button
                        variant={isCropActive ? "default" : "ghost"}
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-full transition-colors",
                          isCropActive ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                        )}
                        onClick={() => setIsCropActive(!isCropActive)}
                        title="Toggle Crop Grid for Snippet Export"
                      >
                        <Crop className="h-4 w-4" />
                      </Button>
                      {isCropActive && (
                        <>
                          <div className="w-px h-4 bg-border mx-1"></div>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 gap-1.5 font-medium shadow-md transition-all animate-in zoom-in-95 duration-200"
                            onClick={handleExportSnippet}
                            disabled={isExportingSnippet}
                          >
                            {isExportingSnippet ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Scissors className="h-3.5 w-3.5" />
                            )}
                            Export Snippet
                          </Button>
                        </>
                      )}
                      <div className="w-px h-4 bg-border mx-1"></div>
                      <div 
                        className={cn("px-1 flex items-center justify-center text-muted-foreground hover:text-foreground", isDraggingToolbar ? "cursor-grabbing" : "cursor-grab")}
                        onMouseDown={onToolbarMouseDown}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            </div>
          )}

          {selectedPage?.warnings && selectedPage.warnings.length > 0 && (
            <div className="p-3 border-t border-border bg-warning/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {selectedPage.warnings.map((warning, i) => (
                    <p key={i} className="text-xs text-warning">
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
