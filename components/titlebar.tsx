"use client"

import { useEffect, useState } from "react"
import { Minus, Square, X } from "lucide-react"

export function Titlebar() {
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    // Only render the titlebar if we are in Tauri desktop mode
    if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
      setIsTauri(true)
    }
  }, [])

  if (!isTauri) return null

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      await getCurrentWindow().minimize()
    } catch (error) {
      console.error("Failed to minimize", error)
    }
  }

  const handleToggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      await getCurrentWindow().toggleMaximize()
    } catch (error) {
      console.error("Failed to maximize", error)
    }
  }

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      await getCurrentWindow().close()
    } catch (error) {
      console.error("Failed to close", error)
    }
  }

  return (
    <div
      data-tauri-drag-region
      className="h-10 flex justify-between items-center bg-transparent shrink-0 relative z-50 select-none group"
    >
      <div data-tauri-drag-region className="flex-1 flex items-center h-full px-4">
        <span data-tauri-drag-region className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors pointer-events-none">PDF Sucker</span>
      </div>
      
      <div className="flex h-full items-center">
        <button
          onClick={handleMinimize}
          className="inline-flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="inline-flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          onClick={handleClose}
          className="inline-flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-red-500/90 hover:text-white transition-colors"
          tabIndex={-1}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
