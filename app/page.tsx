"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import JSZip from "jszip"
import { FileType2, Settings2, Layers, Download, Play, Square, RefreshCw, Trash2 } from "lucide-react"
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
      }
      return
    }

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
        }
      }
    }

    const blob = await zip.generateAsync({ type: "blob" })
    const link = document.createElement("a")
    const downloadUrl = URL.createObjectURL(blob)
    link.href = downloadUrl
    link.download = filesToDownload.length === 1
      ? `${filesToDownload[0].name.replace(/\.pdf$/i, "")}.zip`
      : "converted-files.zip"
    link.click()

    // Safe timeout to prevent browser race conditions revoking the URL before the download starts
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl)
    }, 1000)
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

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileType2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              PDF Sucker
            </h1>
            <p className="text-xs text-muted-foreground">
              High-quality conversion • Configurable DPI • Batch processing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Header Actions: Convert All / Stop / Download ZIP */}
          {job?.status !== "processing" && files.length > 0 && (() => {
            const remainingFiles = files.filter(f => f.status !== "complete")
            const hasCompleted = files.some(f => f.status === "complete")
            const allCompleted = files.every(f => f.status === "complete")
            const targetFiles = (hasCompleted && remainingFiles.length > 0) ? remainingFiles : files

            const anyDirty = targetFiles.some(f => !f.lastConvertedSignature || f.lastConvertedSignature !== getFileSignature(f, f.settings))
            const showConvertButton = !allCompleted || anyDirty
            if (!showConvertButton) return null

            const label = allCompleted
              ? (files.length === 1 ? "Update Current" : "Update All")
              : files.length === 1
                ? "Start Conversion"
                : (hasCompleted && remainingFiles.length > 0)
                  ? "Convert Remaining"
                  : "Convert All"

            const totalTargetPages = targetFiles.reduce((acc, f) => {
              const activePagesCount = f.pages.filter(p => {
                if (p.deleted) return false

                const displayNum = getDisplayPageNumber(f, p.pageNumber)
                const fileSettings = f.settings

                if (fileSettings.exportScope === "selected") {
                  return p.selected !== false
                }
                if (fileSettings.exportScope === "range") {
                  const activeCount = f.pages.filter(pg => !pg.deleted).length
                  const parsed = parsePageRange(fileSettings.customRange, activeCount)
                  return parsed.includes(displayNum)
                }
                if (fileSettings.exportScope === "odd") {
                  return displayNum % 2 !== 0
                }
                if (fileSettings.exportScope === "even") {
                  return displayNum % 2 === 0
                }
                return true
              }).length
              return acc + activePagesCount
            }, 0)

            return (
              <Button
                onClick={() => handleStartConversion()}
                disabled={totalTargetPages === 0}
                size="sm"
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {label}
                <span className="opacity-90 font-normal text-xs">
                  ({totalTargetPages} page{totalTargetPages !== 1 && "s"})
                </span>
              </Button>
            )
          })()}

          {job?.status === "processing" && (
            <Button
              onClick={handleStopConversion}
              variant="destructive"
              size="sm"
              className="gap-2"
            >
              <Square className="h-4 w-4" />
              Stop Conversion
            </Button>
          )}

          {job?.status !== "processing" && files.some(f => f.status === "complete") && (
            <>
              {files.filter(f => f.status === "complete").length > 1 ? (
                <>
                  <Button
                    onClick={() => handleDownloadAll()}
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {window.__TAURI_INTERNALS__ ? "Save All ZIP" : "Download All ZIP"} ({files.filter(f => f.status === "complete").length} files)
                  </Button>
                  {window.__TAURI_INTERNALS__ && (
                    <Button
                      onClick={() => handleSaveToFolder()}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Save All to Folder
                    </Button>
                  )}
                </>
              ) : files.filter(f => f.status === "complete").length === 1 ? (
                <>
                  <Button
                    onClick={() => handleDownloadAll(files.find(f => f.status === "complete")?.id)}
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {window.__TAURI_INTERNALS__ ? "Save ZIP" : "Download ZIP"}
                  </Button>
                  {window.__TAURI_INTERNALS__ && (
                    <Button
                      onClick={() => handleSaveToFolder(files.find(f => f.status === "complete")?.id)}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Save to Folder
                    </Button>
                  )}
                </>
              ) : null}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                title="Reset All PDF Conversions"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar - Upload & Info */}
        <aside className="w-80 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
          <Tabs value={activeTab === "settings" ? "upload" : activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-2 border-b border-border/50">
              <TabsList className="grid grid-cols-2 w-full p-1 h-auto">
                <TabsTrigger value="upload" className="text-xs py-2 gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="info" className="text-xs py-2 gap-1.5">
                  <FileType2 className="h-3.5 w-3.5" />
                  Info
                </TabsTrigger>
              </TabsList>
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

              <TabsContent value="info" className="m-0 p-4">
                <MetadataDisplay
                  metadata={selectedFile?.metadata}
                  fileName={selectedFile?.name || ""}
                  fileSize={selectedFile?.size}
                  pageCount={selectedFile?.pageCount}
                />
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
        <aside className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden min-h-0">
          <div className="flex items-center px-4 py-3 border-b border-border">
            <Settings2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Conversion Settings</span>
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

            const isDirty = selectedFile ? (!selectedFile.lastConvertedSignature || selectedFile.lastConvertedSignature !== getFileSignature(selectedFile, selectedFile.settings)) : false

            return (
              <div className="p-4 border-b border-border bg-card/50 z-10">
                <ConversionControls
                  files={files}
                  job={job}
                  selectedFileId={selectedFileId}
                  selectedFilePages={selectedFilePages}
                  isDirty={isDirty}
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
    </div>
  )
}
