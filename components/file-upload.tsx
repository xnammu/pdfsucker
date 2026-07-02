"use client"

import { useCallback, useState } from "react"
import {
  Upload,
  FileText,
  AlertTriangle,
  X,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PDFFile } from "@/lib/types"

interface FileUploadProps {
  onFilesAdded: (files: File[]) => void
  files: PDFFile[]
  onRemoveFile: (id: string) => void
  disabled?: boolean
  selectedFileId?: string | null
  onSelectFile?: (id: string) => void
}

export function FileUpload({
  onFilesAdded,
  files,
  onRemoveFile,
  disabled = false,
  selectedFileId,
  onSelectFile,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "application/pdf"
      )

      if (droppedFiles.length > 0) {
        const mapped = droppedFiles.map(f => ({ file: f, name: f.name, size: f.size }))
        onFilesAdded(mapped as any)
      }
    },
    [onFilesAdded, disabled]
  )

  const handleBrowseNative = useCallback(async () => {
    if (disabled) return
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const { invoke } = await import("@tauri-apps/api/core")
      
      const selected = await open({
        multiple: true,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      })
      
      if (!selected) return
      const paths = Array.isArray(selected) ? selected : [selected]
      
      const newFiles = []
      for (const path of paths) {
        let size = 0
        try {
          size = await invoke<number>("get_file_size", { path })
        } catch (e) {
          console.error("Failed to get file size natively:", e)
        }
        const name = path.split('\\').pop()?.split('/').pop() || 'document.pdf'
        newFiles.push({ path, name, size })
      }
      
      if (newFiles.length > 0) {
        onFilesAdded(newFiles as any) // Type will be updated in page.tsx
      }
    } catch (error) {
      console.error("Failed to open native dialog:", error)
    }
  }, [disabled, onFilesAdded])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []).filter(
        (file) => file.type === "application/pdf"
      )

      if (selectedFiles.length > 0) {
        const mapped = selectedFiles.map(f => ({ file: f, name: f.name, size: f.size }))
        onFilesAdded(mapped as any)
      }

      e.target.value = ""
    },
    [onFilesAdded]
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStatusIcon = (status: PDFFile["status"]) => {
    switch (status) {
      case "complete":
        return <CheckCircle2 className="h-4 w-4 text-primary" />
      case "error":
        return <AlertTriangle className="h-4 w-4 text-destructive" />
      case "processing":
      case "analyzing":
        return (
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (window.__TAURI_INTERNALS__) {
            handleBrowseNative();
          } else {
            document.getElementById('file-upload-input')?.click();
          }
        }}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 transition-all duration-200 cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          id="file-upload-input"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInput}
          disabled={disabled}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div
            className={cn(
              "p-4 rounded-full transition-colors",
              isDragging ? "bg-primary/10" : "bg-secondary"
            )}
          >
            <Upload
              className={cn(
                "h-8 w-8 transition-colors",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">
              Drop PDF files here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse • Supports multi-page documents
            </p>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Uploaded Files ({files.length})
            </h3>
          </div>
          <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-2 border border-border/50 bg-secondary/20 rounded-lg p-2">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => onSelectFile?.(file.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg group cursor-pointer transition-colors w-full",
                  selectedFileId === file.id ? "bg-primary/10 ring-1 ring-primary" : "bg-secondary hover:bg-secondary/80"
                )}
              >
                <div className="flex-shrink-0">{getStatusIcon(file.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(file.size)}</span>
                    {file.pageCount > 0 && (
                      <>
                        <span>•</span>
                        <span>
                          {file.pageCount} page{file.pageCount !== 1 && "s"}
                        </span>
                      </>
                    )}
                    {file.status === "processing" && (
                      <>
                        <span>•</span>
                        <span>{file.progress}%</span>
                      </>
                    )}
                  </div>
                  {file.error && (
                    <p className="text-xs text-destructive mt-1">{file.error}</p>
                  )}
                  {file.metadata?.hasCMYK && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      <span className="text-xs text-warning">
                        CMYK color space detected
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFile(file.id)
                  }}
                  disabled={
                    file.status === "processing"
                  }
                  className="p-1.5 rounded-md hover:bg-background/50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
