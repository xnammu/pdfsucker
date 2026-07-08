"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import JSZip from "jszip"
import { FileType2, Settings2, Layers, Download, Play, Square, RefreshCw, Trash2, Zap, Cpu, Shield, Lock, CheckCircle2 } from "lucide-react"
import { FileUpload } from "@/components/file-upload"
import { SettingsPanel } from "@/components/settings-panel"
import { PagePreview } from "@/components/page-preview"
import { ConversionControls } from "@/components/conversion-controls"
import { MetadataDisplay } from "@/components/metadata-display"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import type { PDFFile, ConversionSettings, ConversionJob } from "@/lib/types"
import { DEFAULT_SETTINGS } from "@/lib/types"
import { analyzePDF, convertAllPages } from "@/lib/pdf-processor"
import { parsePageRange, dataUrlToBlob } from "@/lib/utils"

const getDisplayPageNumber = (file: { pages: { pageNumber: number; deleted?: boolean }[] }, pageNumber: number): number => {
  const activePages = file.pages.filter(p => !p.deleted)
  const idx = activePages.findIndex(p => p.pageNumber === pageNumber)
  return idx !== -1 ? idx + 1 : pageNumber
}

const getFileSignature = (file: PDFFile, settings: ConversionSettings) => {
  const activePages = file.pages.filter(p => !p.deleted)
  const pagesState = activePages.map(p => `${p.pageNumber}-${p.selected !== false}-${p.rotation || 0}-${!!p.flipX}-${!!p.flipY}`).join('|')
  const settingsState = `${settings.dpi}-${settings.jpegQuality}-${settings.colorMode}-${settings.renderingIntent}-${settings.overprintSimulation}-${settings.transparencyPreservation}-${settings.vectorAntiAliasing}-${settings.textAntiAliasing}-${settings.includeBleed}-${settings.boxSelection}-${settings.iccProfile}-${settings.outputSharpening}-${settings.chromaSubsampling}-${settings.progressiveJpeg}-${settings.exportScope}-${settings.customRange}-${settings.exportFormat}`
  return `${pagesState}::${settingsState}`
}

export default function PDFConverter() {
  const [files, setFiles] = useState<PDFFile[]>([])
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS)
  const [job, setJob] = useState<ConversionJob | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedPageNumber, setSelectedPageNumber] = useState(1)
  const [activeTab, setActiveTab] = useState("upload")
  const [zipProgress, setZipProgress] = useState<{ active: boolean; current: number; total: number; message: string; ready: boolean; size?: string; downloadUrl?: string; zipName?: string; } | null>(null)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const isCancelledRef = useRef(false)
  const activeFileIdsRef = useRef<Set<string>>(new Set())

  // Reset selected page to 1 when selected file changes to prevent out-of-bounds page selection
  useEffect(() => {
    setSelectedPageNumber(1)
  }, [selectedFileId])

  // Reset export scope to "all" if selected file has only 1 page
  useEffect(() => {
    const selectedFile = files.find(f => f.id === selectedFileId)
    if (selectedFile) {
      const activePagesCount = selectedFile.pages.filter(p => !p.deleted).length
      const fileSettings = selectedFile.settings
      if (activePagesCount <= 1 && (fileSettings.exportScope === "odd" || fileSettings.exportScope === "even" || fileSettings.exportScope === "range")) {
        setFiles(prev => prev.map(f => f.id === selectedFileId ? {
          ...f,
          settings: { ...f.settings, exportScope: "all" }
        } : f))
      }
    }
  }, [selectedFileId, files])

  const generateId = () => Math.random().toString(36).substring(2, 11)

  const handleFilesAdded = useCallback(async (newFiles: { file?: File, path?: string, name: string, size: number }[]) => {
    // Prevent duplicate file names
    const uniqueNewFiles = newFiles.filter((newFile) => {
      const isDuplicate = files.some((existingFile) => existingFile.name === newFile.name)
      if (isDuplicate) {
        alert(`A file named "${newFile.name}" has already been uploaded. Duplicate names are not allowed.`)
      }
      return !isDuplicate
    })

    if (uniqueNewFiles.length === 0) return

    const pdfFiles: PDFFile[] = uniqueNewFiles.map((f) => ({
      id: generateId(),
      file: f.file,
      path: f.path,
      name: f.name,
      size: f.size,
      pageCount: 0,
      status: "analyzing",
      progress: 0,
      pages: [],
      settings: { ...settings },
    }))

    setFiles((prev) => [...prev, ...pdfFiles])
    pdfFiles.forEach((f) => activeFileIdsRef.current.add(f.id))

    // Select first file if none selected
    if (!selectedFileId && pdfFiles.length > 0) {
      setSelectedFileId(pdfFiles[0].id)
    }

    // Analyze each file using client-side PDF.js
    for (const pdfFile of pdfFiles) {
      try {
        const result = await analyzePDF(pdfFile, () => !activeFileIdsRef.current.has(pdfFile.id))

        setFiles((prev) =>
          prev.map((f) =>
            f.id === pdfFile.id
              ? {
                ...f,
                status: "pending",
                pageCount: result.pageCount,
                metadata: result.metadata,
                pages: Array.from({ length: result.pageCount }, (_, i) => ({
                  pageNumber: i + 1,
                  status: "pending" as const,
                  previewUrl: result.previews[i].url,
                  width: result.previews[i].width,
                  height: result.previews[i].height,
                  rotation: 0,
                  flipX: false,
                  flipY: false,
                  selected: true,
                  warnings: [],
                })),
              }
              : f
          )
        )
      } catch (error) {
        if (!activeFileIdsRef.current.has(pdfFile.id)) {
          // Ignore cancellation errors silently
          continue
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === pdfFile.id
              ? {
                ...f,
                status: "error",
                error: error instanceof Error ? error.message : "Analysis failed",
              }
              : f
          )
        )
      }
    }
  }, [selectedFileId, files])

  const handleRemoveFile = useCallback((id: string) => {
    activeFileIdsRef.current.delete(id)
    setFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id)
      if (selectedFileId === id) {
        const nextFile = updated[0]
        setSelectedFileId(nextFile ? nextFile.id : null)
      }
      return updated
    })
  }, [selectedFileId])

  const handleSettingsChange = useCallback((newSettings: ConversionSettings) => {
    if (selectedFileId) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === selectedFileId ? { ...f, settings: newSettings } : f
        )
      )
    } else {
      setSettings(newSettings)
    }
  }, [selectedFileId])

  const handleUpdatePageTransform = useCallback((fileId: string, pageNumber: number, updates: Partial<import("@/lib/types").PDFPage>) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          const updatedPages = f.pages.map((p) =>
            p.pageNumber === pageNumber ? { ...p, ...updates } : p
          )

          let updatedSettings = f.settings
          if ("selected" in updates && f.settings.exportScope !== "selected") {
            updatedSettings = { ...f.settings, exportScope: "selected" }
          }

          return {
            ...f,
            pages: updatedPages,
            settings: updatedSettings,
          }
        }
        return f
      })
    )
  }, [])

  const handleMasterTransform = useCallback((fileId: string, action: 'rotateCw' | 'rotateCcw' | 'flipX' | 'flipY') => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
            ...f,
            pages: f.pages.map((p) => {
              let updates: Partial<import("@/lib/types").PDFPage> = {}
              if (action === 'rotateCw') updates = { rotation: ((p.rotation || 0) + 90) % 360 }
              if (action === 'rotateCcw') updates = { rotation: ((p.rotation || 0) + 270) % 360 }
              if (action === 'flipX') updates = { flipX: !p.flipX }
              if (action === 'flipY') updates = { flipY: !p.flipY }
              return { ...p, ...updates }
            }),
          }
          : f
      )
    )
  }, [])

  const handleStartConversion = useCallback(async (targetFileId?: string) => {
    isCancelledRef.current = false
    let filesToProcess = targetFileId
      ? files.filter(f => f.id === targetFileId)
      : files.filter(f => f.status !== "complete");

    // Fallback to all files if everything is already complete
    if (filesToProcess.length === 0) {
      filesToProcess = files;
    }

    // Helper to determine if a page in a specific file should be converted based on settings
    const shouldConvertPage = (file: PDFFile, pageNumber: number) => {
      const page = file.pages.find(p => p.pageNumber === pageNumber)
      if (page?.deleted) return false

      const displayNum = getDisplayPageNumber(file, pageNumber)
      const fileSettings = file.settings

      if (fileSettings.exportScope === "selected") {
        return page?.selected !== false
      }
      if (fileSettings.exportScope === "range") {
        const activeCount = file.pages.filter(p => !p.deleted).length
        const parsedPages = parsePageRange(fileSettings.customRange, activeCount)
        if (parsedPages.length === 0) return false
        return parsedPages.includes(displayNum)
      }
      if (fileSettings.exportScope === "odd") {
        return displayNum % 2 !== 0
      }
      if (fileSettings.exportScope === "even") {
        return displayNum % 2 === 0
      }
      return true
    }

    // Only count pages that are actively scheduled for conversion
    const totalPages = filesToProcess.reduce((acc, f) => {
      const activePagesCount = f.pages.filter(p => shouldConvertPage(f, p.pageNumber)).length
      return acc + activePagesCount
    }, 0)

    if (totalPages === 0) {
      alert("No pages are selected for conversion. Please select at least one page in the left sidebar checklist or adjust your export page range.")
      return
    }

    setJob({
      id: generateId(),
      files: filesToProcess,
      settings,
      status: "processing",
      startTime: new Date(),
      totalPages,
      processedPages: 0,
    })

    // Mark active pages as processing for files to process
    setFiles((prev) =>
      prev.map((f) =>
        filesToProcess.some(target => target.id === f.id)
          ? {
            ...f,
            status: "processing",
            progress: 0,
            pages: f.pages.map((p) =>
              shouldConvertPage(f, p.pageNumber)
                ? { ...p, status: "processing" as const }
                : p
            ),
          }
          : f
      )
    )

    // Save original requestAnimationFrame and cancelAnimationFrame
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    // Create an inline Web Worker to act as a high-frequency background clock (bypassing browser tab timeout clamping)
    let worker: Worker | null = null
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextId = 1

    try {
      const workerCode = `
        let timers = new Map();
        self.onmessage = function(e) {
          const { action, id, delay } = e.data;
          if (action === 'start') {
            const timerId = setTimeout(() => {
              self.postMessage({ id });
              timers.delete(id);
            }, delay);
            timers.set(id, timerId);
          } else if (action === 'cancel') {
            const timerId = timers.get(id);
            if (timerId) {
              clearTimeout(timerId);
              timers.delete(id);
            }
          }
        };
      `
      const blob = new Blob([workerCode], { type: "application/javascript" })
      const workerUrl = URL.createObjectURL(blob)
      worker = new Worker(workerUrl)

      worker.onmessage = (e) => {
        const { id } = e.data
        const cb = callbacks.get(id)
        if (cb) {
          callbacks.delete(id)
          cb(performance.now())
        }
      }

      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        const id = nextId++
        callbacks.set(id, callback)
        worker?.postMessage({ action: "start", id, delay: 16 })
        return id
      }

      window.cancelAnimationFrame = (id: number) => {
        callbacks.delete(id)
        worker?.postMessage({ action: "cancel", id })
      }
    } catch (e) {
      console.warn("Failed to initialize background worker clock, falling back to setTimeout:", e)

      // Fallback to setTimeout shim if Web Workers are blocked or unsupported
      const timeoutIds = new Map<number, NodeJS.Timeout>()
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        const id = nextId++
        const timeoutId = setTimeout(() => {
          callback(performance.now())
        }, 16)
        timeoutIds.set(id, timeoutId)
        return id
      }
      window.cancelAnimationFrame = (id: number) => {
        const timeoutId = timeoutIds.get(id)
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutIds.delete(id)
        }
      }
    }

    try {
      // Process each file using client-side PDF.js
      for (const file of filesToProcess) {
        if (isCancelledRef.current) {
          break
        }
        try {
          await convertAllPages(
            file,
            file.settings,
            (pageNumber, dataUrl, localPath) => {
              if (isCancelledRef.current) return

              // Update individual page as it completes
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === file.id
                    ? {
                      ...f,
                      pages: f.pages.map((p) =>
                        p.pageNumber === pageNumber
                          ? {
                            ...p,
                            status: "complete" as const,
                            outputUrl: dataUrl,
                            previewUrl: p.previewUrl || dataUrl,
                            localPath,
                          }
                          : p
                      ),
                    }
                    : f
                )
              )

              setJob((prev) => {
                if (isCancelledRef.current || !prev) return prev
                return {
                  ...prev,
                  processedPages: prev.processedPages + 1,
                }
              })
            },
            (progress) => {
              if (isCancelledRef.current) return
              // Update file progress
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === file.id
                    ? { ...f, progress }
                    : f
                )
              )
            },
            () => isCancelledRef.current
          )

          if (isCancelledRef.current) {
            break
          }

          // Mark file as complete
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, status: "complete", progress: 100, lastConvertedSignature: getFileSignature(f, f.settings) }
                : f
            )
          )
        } catch (error) {
          if (isCancelledRef.current) {
            break
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? {
                  ...f,
                  status: "error",
                  error: error instanceof Error ? error.message : "Conversion failed",
                  pages: f.pages.map((p) => ({
                    ...p,
                    status: "error" as const,
                    warnings: [error instanceof Error ? error.message : "Conversion failed"],
                  })),
                }
                : f
            )
          )
        }
      }
    } finally {
      // Restore original native functions
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame

      // Terminate worker and clean up URL
      if (worker) {
        worker.terminate()
      }
    }

    setJob((prev) => {
      if (isCancelledRef.current) {
        return null
      }
      return prev
        ? {
          ...prev,
          status: "complete",
          endTime: new Date(),
        }
        : prev
    })
  }, [files, settings])

  const handleStopConversion = useCallback(() => {
    isCancelledRef.current = true
    setJob(null)

    // Stop all conversion processing status of files
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "processing"
          ? {
            ...f,
            status: "pending",
            pages: f.pages.map((p) =>
              p.status === "processing"
                ? { ...p, status: "pending" as const }
                : p
            ),
          }
          : f
      )
    )
  }, [])

  const handleDownloadSingle = useCallback(
    async (fileId: string, pageNumber: number) => {
      const file = files.find((f) => f.id === fileId)
      if (!file) return
      const page = file.pages.find((p) => p.pageNumber === pageNumber)
      if (!page) return

      const mime = page.outputUrl?.split(";")[0]?.split(":")[1] || ""
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
      const defaultName = `${file.name.replace(/\.pdf$/i, "")}-page-${getDisplayPageNumber(file, pageNumber)}.${ext}`

      if (window.__TAURI_INTERNALS__ && page.localPath) {
        try {
          const { save } = await import("@tauri-apps/plugin-dialog")
          const { invoke } = await import("@tauri-apps/api/core")

          const selectedPath = await save({
            defaultPath: defaultName,
            filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
          })

          if (!selectedPath) return // User cancelled

          await invoke("save_converted_files", {
            sourcePaths: [page.localPath],
            destPath: selectedPath,
            zipPack: false
          })
        } catch (error) {
          console.error("Failed to save file natively:", error)
          alert(`Failed to save file: ${error}`)
        }
        return
      }

      if (page?.outputUrl) {
        // Convert to secure local Blob URL to ensure names and extensions are preserved correctly in all browsers
        const blob = dataUrlToBlob(page.outputUrl)
        const blobUrl = URL.createObjectURL(blob)

        const displayNum = getDisplayPageNumber(file, pageNumber)
        const link = document.createElement("a")
        link.href = blobUrl
        link.download = defaultName
        link.click()

        // Safe timeout to prevent browser race conditions revoking the URL before the download starts
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl)
        }, 1000)
      }
    },
    [files]
  )

  const handleSaveToFolder = useCallback(async (targetFileId?: string) => {
    const filesToDownload = targetFileId ? files.filter(f => f.id === targetFileId) : files;
    const allCompletedPages = filesToDownload.flatMap(f => f.pages.filter(p => !p.deleted && p.outputUrl))

    const localPaths: string[] = []
    allCompletedPages.forEach(p => {
      if (p.localPath) {
        localPaths.push(p.localPath)
      }
    })

    if (localPaths.length === 0) return

    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const { invoke } = await import("@tauri-apps/api/core")

      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select Directory to Save Images"
      })

      if (!selectedPath) return // User cancelled

      const destPath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath

      await invoke("save_converted_files", {
        sourcePaths: localPaths,
        destPath,
        zipPack: false
      })
    } catch (error) {
      console.error("Failed to save to folder natively:", error)
      alert(`Failed to save to folder: ${error}`)
    }
  }, [files])

  const handleDownloadAll = useCallback(async (targetFileId?: string) => {
    const filesToDownload = targetFileId ? files.filter(f => f.id === targetFileId) : files;

    // Check if we are only downloading a single page in total across all files
    const allCompletedPages = filesToDownload.flatMap(f => f.pages.filter(p => !p.deleted && p.outputUrl))
    if (allCompletedPages.length === 1 && filesToDownload.length === 1) {
      // Directly trigger single page download!
      const targetPage = allCompletedPages[0]
      handleDownloadSingle(filesToDownload[0].id, targetPage.pageNumber)
      return
    }

    const localPaths: string[] = []
    allCompletedPages.forEach(p => {
      if (p.localPath) {
        localPaths.push(p.localPath)
      }
    })

    if (window.__TAURI_INTERNALS__ && localPaths.length > 0) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog")
        const { invoke } = await import("@tauri-apps/api/core")

        const defaultZipName = filesToDownload.length === 1
          ? `${filesToDownload[0].name.replace(/\.pdf$/i, "")}.zip`
          : "converted-files.zip"

        const selectedPath = await save({
          defaultPath: defaultZipName,
          filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
        })

        if (!selectedPath) return // User cancelled

        await invoke("save_converted_files", {
          sourcePaths: localPaths,
          destPath: selectedPath,
          zipPack: true
        })
      } catch (error) {
        console.error("Failed to save ZIP natively:", error)
        alert(`Failed to save ZIP: ${error}`)
      } finally {
        setZipProgress(null)
      }
      return
    }

    setZipProgress({ active: true, current: 0, total: allCompletedPages.length, message: "Preparing ZIP...", ready: false })

    const zip = new JSZip()
    for (const file of filesToDownload) {
      const folder = filesToDownload.length === 1 ? zip : zip.folder(file.name.replace(".pdf", ""))
      const targetZip = folder || zip;

      for (const page of file.pages) {
        if (page.deleted) continue // CRITICAL: Skip deleted pages from ZIP downloads
        if (page.outputUrl) {
          const mime = page.outputUrl.split(";")[0].split(":")[1]
          const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
          const base64Data = page.outputUrl.split(",")[1]
          if (!base64Data) continue

          const displayNum = getDisplayPageNumber(file, page.pageNumber)
          targetZip.file(`page-${displayNum.toString().padStart(3, "0")}.${ext}`, base64Data, {
            base64: true,
          })

          processed++
          if (processed % 5 === 0) {
            setZipProgress(p => p ? { ...p, current: processed, message: `Compressing ${processed} of ${allCompletedPages.length} pages` } : null)
            await new Promise(r => setTimeout(r, 0))
          }
        }
      }
    }

    setZipProgress(p => p ? { ...p, current: processed, message: "Building archive..." } : null)

    const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
      setZipProgress(p => p ? { ...p, message: `Writing files... ${Math.round(meta.percent)}%` } : null)
    })

    const sizeInMB = (blob.size / (1024 * 1024)).toFixed(1) + " MB"
    const downloadUrl = URL.createObjectURL(blob)
    const zipName = filesToDownload.length === 1
      ? `${filesToDownload[0].name.replace(/\.pdf$/i, "")}.zip`
      : "converted-files.zip"

    setZipProgress({
      active: true,
      current: allCompletedPages.length,
      total: allCompletedPages.length,
      message: "ZIP Ready",
      ready: true,
      size: sizeInMB,
      downloadUrl,
      zipName
    })
  }, [files, handleDownloadSingle])

  const handleReset = useCallback(() => {
    setJob(null)
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        status: "pending",
        progress: 0,
        pages: f.pages.map((p) => ({
          ...p,
          status: "pending" as const,
          outputUrl: undefined,
        })),
      }))
    )
  }, [])

  const handleResetSingle = useCallback((fileId: string) => {
    setJob((prev) => {
      if (prev && prev.files.some((f) => f.id === fileId)) {
        return null
      }
      return prev
    })
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
            ...f,
            status: "pending",
            progress: 0,
            pages: f.pages.map((p) => ({
              ...p,
              status: "pending" as const,
              outputUrl: undefined,
            })),
          }
          : f
      )
    )
  }, [])

  const handleDeleteMultiplePages = useCallback((fileId: string, pageNumbers: number[]) => {
    if (pageNumbers.length === 0) return

    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          const activePagesLeft = f.pages.filter(p => !p.deleted && !pageNumbers.includes(p.pageNumber)).length
          if (activePagesLeft === 0) {
            alert("A PDF must have at least one active page. Cannot delete all pages.")
            return f
          }
          return {
            ...f,
            pages: f.pages.map((p) =>
              pageNumbers.includes(p.pageNumber) ? { ...p, deleted: true } : p
            ),
          }
        }
        return f
      })
    )

    setSelectedPageNumber((prev) => {
      if (pageNumbers.includes(prev)) {
        const file = files.find((f) => f.id === fileId)
        if (file) {
          const nextAvailable = file.pages.find(
            (p) => !p.deleted && !pageNumbers.includes(p.pageNumber)
          )
          return nextAvailable ? nextAvailable.pageNumber : 1
        }
      }
      return prev
    })
  }, [files])

  const handleDeletePage = useCallback((fileId: string, pageNumber: number) => {
    handleDeleteMultiplePages(fileId, [pageNumber])
  }, [handleDeleteMultiplePages])

  const selectedFile = files.find((f) => f.id === selectedFileId)

  // Keyboard Shortcuts Hook Logic
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowKeyboardShortcuts(prev => !prev)
        return
      }

      if (!selectedFileId) return

      if (e.key.toLowerCase() === 'e') {
        e.preventDefault()
        handleDownloadAll(selectedFileId)
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        handleMasterTransform(selectedFileId, 'rotateCw')
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [selectedFileId, handleDownloadAll, handleMasterTransform])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden bg-ambient relative">
      <div className="noise-overlay"></div>
      <div className="vignette"></div>

      {/* Keyboard Shortcuts Overlay */}
      {showKeyboardShortcuts && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setShowKeyboardShortcuts(false)}>
          <div className="bg-card border border-border p-6 rounded-xl shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Keyboard Shortcuts</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">R</kbd> <span className="text-sm text-muted-foreground">Rotate</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">E</kbd> <span className="text-sm text-muted-foreground">Export / Download</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">F</kbd> <span className="text-sm text-muted-foreground">Fit / Reset Zoom</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">+ / -</kbd> <span className="text-sm text-muted-foreground">Zoom In / Out</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">Delete</kbd> <span className="text-sm text-muted-foreground">Remove Page</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">Arrows</kbd> <span className="text-sm text-muted-foreground">Navigate Pages</span></div>
              <div className="flex justify-between items-center"><kbd className="bg-muted px-2 py-1 rounded text-xs font-mono">Ctrl+K</kbd> <span className="text-sm text-muted-foreground">Toggle Shortcuts</span></div>
            </div>
            <Button className="w-full mt-6" onClick={() => setShowKeyboardShortcuts(false)}>Close</Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative z-10">
        {/* Leftmost Nav Sidebar */}
        <nav className="w-16 flex-shrink-0 bg-sidebar border-r border-border flex flex-col items-center py-6 justify-between z-20">
          <div className="flex flex-col items-center gap-6 w-full">
            {/* Logo */}
            <div className="h-10 w-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-2 glow-border border border-primary/50">
              <Zap className="h-6 w-6 text-primary" />
            </div>

            {/* Nav Items */}
            <button
              onClick={() => setActiveTab("upload")}
              className={`w-full py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === 'upload' ? 'text-primary border-r-2 border-primary bg-primary/10 glow-text' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
              <Layers className="h-5 w-5" />
              <span className="text-[10px] font-medium">Files</span>
            </button>
            <button
              onClick={() => setActiveTab("info")}
              className={`w-full py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === 'info' ? 'text-primary border-r-2 border-primary bg-primary/10 glow-text' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
              <FileType2 className="h-5 w-5" />
              <span className="text-[10px] font-medium">Info</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`w-full py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === 'history' ? 'text-primary border-r-2 border-primary bg-primary/10 glow-text' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-[10px] font-medium">History</span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-4 w-full">
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full py-4 flex flex-col items-center gap-1.5 transition-all ${activeTab === 'settings' ? 'text-primary border-r-2 border-primary bg-primary/10 glow-text' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
              <Settings2 className="h-5 w-5" />
              <span className="text-[10px] font-medium">Settings</span>
            </button>
            <div className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center mt-2 font-bold text-xs text-foreground">
              N
            </div>
          </div>
        </nav>

        {/* Left Sidebar - Upload & Info */}
        <aside className="w-80 flex-shrink-0 border-r border-border bg-card/80 flex flex-col overflow-hidden">
          <Tabs value={activeTab === "settings" ? "upload" : activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-6 pb-2 border-b border-border/20">
              <TabsList className="hidden">
                <TabsTrigger value="upload">Files</TabsTrigger>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold tracking-wide text-primary glow-text uppercase">{
                  activeTab === 'upload' ? 'Files' : activeTab === 'info' ? 'Info' : activeTab === 'history' ? 'History' : 'Settings'
                }</h2>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <TabsContent value="upload" className="m-0 p-4 w-80">
                <FileUpload
                  onFilesAdded={handleFilesAdded}
                  files={files}
                  onRemoveFile={handleRemoveFile}
                  disabled={job?.status === "processing"}
                  selectedFileId={selectedFileId}
                  onSelectFile={setSelectedFileId}
                />
              </TabsContent>

              <TabsContent value="info" className="flex-1 mt-0 m-0 p-6 overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">PDF Sucker</h2>
                    <p className="text-sm text-muted-foreground mt-1">The fastest local document processing engine for creators, designers, print shops, publishers, and professionals.</p>
                  </div>

                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Local & Secure
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      All processing happens entirely in your browser using WebAssembly. Your files are never uploaded to any server, ensuring 100% privacy and security.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-card border border-border">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" /> Feature Roadmap
                    </h3>
                    <ul className="text-xs text-muted-foreground space-y-2">
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> PDF → JPG / PNG / WebP</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Image → PDF</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Merge & Split PDFs</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Extract selected pages</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> OCR (offline text extraction)</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Compress & Optimize PDFs</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Password Management</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Watermark & Crop</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Batch rename & Metadata</li>
                      <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-accent ml-1 mr-1"></div> Color profile conversion</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </aside>

        {/* Main Preview Area */}
        <main className="flex-1 p-4 min-w-0">
          <div className="h-full bg-card rounded-lg border border-border overflow-hidden">
            <PagePreview
              files={files}
              selectedFileId={selectedFileId}
              selectedPageNumber={selectedPageNumber}
              onSelectFile={setSelectedFileId}
              onSelectPage={setSelectedPageNumber}
              onUpdatePageTransform={handleUpdatePageTransform}
              onMasterTransform={handleMasterTransform}
              onDeletePage={handleDeletePage}
              onDeleteMultiplePages={handleDeleteMultiplePages}
            />
          </div>
        </main>

        {/* Right Sidebar - Settings & Conversion */}
        <aside className="w-80 flex-shrink-0 border-l border-border bg-card/80 flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center px-4 py-4 border-b border-border/20">
            <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Conversion Settings</span>
          </div>

          {files.length > 0 && (() => {
            const selectedFile = files.find(f => f.id === selectedFileId)
            const selectedFilePages = selectedFile ? selectedFile.pages.filter(p => {
              if (p.deleted) return false
              const displayNum = getDisplayPageNumber(selectedFile, p.pageNumber)
              const fileSettings = selectedFile.settings
              if (fileSettings.exportScope === "selected") return p.selected !== false
              if (fileSettings.exportScope === "range") {
                const activeCount = selectedFile.pages.filter(pg => !pg.deleted).length
                const parsed = parsePageRange(fileSettings.customRange, activeCount)
                return parsed.includes(displayNum)
              }
              if (fileSettings.exportScope === "odd") return displayNum % 2 !== 0
              if (fileSettings.exportScope === "even") return displayNum % 2 === 0
              return true
            }).length : 0

            return (
              <div className="p-4 border-b border-border/20 bg-card/30 z-10">
                <ConversionControls
                  files={files}
                  job={job}
                  selectedFileId={selectedFileId}
                  selectedFilePages={selectedFile?.pages.filter(p => !p.deleted).length}
                  isDirty={
                    selectedFile?.lastConvertedSignature !== undefined &&
                    selectedFile?.lastConvertedSignature !== getFileSignature(selectedFile, selectedFile.settings)
                  }
                  zipProgress={zipProgress}
                  onClearZipProgress={() => setZipProgress(null)}
                  onStartConversion={handleStartConversion}
                  onStopConversion={handleStopConversion}
                  onDownloadSingle={handleDownloadSingle}
                  onDownloadAll={handleDownloadAll}
                  onReset={() => selectedFileId && handleResetSingle(selectedFileId)}
                />
              </div>
            )
          })()}

          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                <SettingsPanel
                  settings={selectedFile ? selectedFile.settings : settings}
                  onSettingsChange={handleSettingsChange}
                  disabled={job?.status === "processing" || files.length === 0}
                  sections={["resolution", "color", "rendering", "geometry"]}
                  activePageCount={selectedFile ? selectedFile.pages.filter(p => !p.deleted).length : 0}
                />
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-10 flex-shrink-0 border-t border-border bg-card/50 flex items-center justify-center gap-8 text-[11px] text-muted-foreground z-20">
        <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary glow-text" /> Lightning Fast</div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-primary glow-text" /> Local Processing</div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-primary glow-text" /> 100% Private</div>
        <div className="h-3 w-px bg-border"></div>
        <div className="flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-primary glow-text" /> Secure by Design</div>
      </footer>
    </div>
  )
}
