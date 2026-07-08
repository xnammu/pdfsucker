"use client"

import { useState, useEffect } from "react"
import { Download, Archive, Loader2, Play, Square, Trash2, CheckCircle2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { ConversionJob, PDFFile } from "@/lib/types"

interface ConversionControlsProps {
  files: PDFFile[]
  job: ConversionJob | null
  selectedFileId: string | null
  selectedFilePages?: number
  isDirty?: boolean
  zipProgress?: { active: boolean; current: number; total: number; message: string; ready: boolean; size?: string; downloadUrl?: string; zipName?: string; } | null
  onClearZipProgress?: () => void
  onStartConversion: (fileId?: string) => void
  onStopConversion: () => void
  onDownloadSingle: (fileId: string, pageNumber: number) => void
  onDownloadAll: (fileId?: string) => void
  onReset: () => void
}

const SPEED_MESSAGES = [
  "Analyzing PDF...",
  "Extracting pages...",
  "Rendering images...",
  "Optimizing output...",
  "Building archive...",
  "Almost there..."
]

export function ConversionControls({
  files,
  job,
  selectedFileId,
  selectedFilePages = 0,
  isDirty = false,
  zipProgress,
  onClearZipProgress,
  onStartConversion,
  onStopConversion,
  onDownloadSingle,
  onDownloadAll,
  onReset,
}: ConversionControlsProps) {
  const hasFiles = files.length > 0
  const isProcessing = job?.status === "processing"
  const isComplete = job?.status === "complete"
  const hasErrors = files.some((f) => f.status === "error")
  const displayTotalPages = job ? job.totalPages : files.reduce((acc, f) => acc + f.pageCount, 0)
  const displayCompletedPages = job ? job.processedPages : 0
  const progress = displayTotalPages > 0 ? (displayCompletedPages / displayTotalPages) * 100 : 0

  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (isProcessing) {
      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % SPEED_MESSAGES.length)
      }, 2500)
      return () => clearInterval(interval)
    }
  }, [isProcessing])

  const selectedFile = files.find((f) => f.id === selectedFileId)
  const allComplete = files.length > 0 && files.every(f => f.status === "complete")

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date()
    const diff = endTime.getTime() - start.getTime()
    const seconds = (diff / 1000).toFixed(1)
    return `${seconds}s`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground uppercase tracking-widest">Engine Status</h3>
          {job?.startTime && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {isProcessing
                ? `⚡ Processing... ${formatDuration(job.startTime)}`
                : isComplete
                ? (
                  <>
                    <span className="text-primary font-bold">Finished in {formatDuration(job.startTime, job.endTime)}. Faster than expected.</span>
                    {!hasErrors && <Zap className="h-3.5 w-3.5 text-primary inline-block" />}
                  </>
                )
                : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isComplete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onReset}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
              title="Reset Processing Engine"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {(isProcessing || isComplete) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono">
              {isProcessing ? `⚡ Sucking ${displayTotalPages} pages...` : `⚡ Extraction Complete (${displayCompletedPages} Images Ready)`}
            </span>
            <span className="font-mono text-primary font-bold">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2 bg-muted/50 [&>div]:bg-primary shadow-[0_0_10px_var(--color-primary)]" />
        </div>
      )}

      {zipProgress?.active && (
        <div className="space-y-3 p-3 bg-card border border-border rounded-lg relative overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-primary/5"></div>
          <div className="relative z-10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                {zipProgress.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {zipProgress.ready ? "✔ ZIP Ready" : zipProgress.message}
              </span>
              {!zipProgress.ready && (
                <span className="font-mono text-muted-foreground">
                  {Math.round((zipProgress.current / zipProgress.total) * 100)}%
                </span>
              )}
            </div>
            
            {!zipProgress.ready && (
              <Progress value={(zipProgress.current / zipProgress.total) * 100} className="h-1.5 bg-muted/30 [&>div]:bg-primary" />
            )}
            
            {zipProgress.ready && zipProgress.downloadUrl && (
              <div className="flex items-center gap-2 mt-2">
                <Button 
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = zipProgress.downloadUrl!
                    link.download = zipProgress.zipName || "converted-files.zip"
                    link.click()
                    if (onClearZipProgress) onClearZipProgress()
                  }} 
                  className="flex-1 font-bold shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 glow-primary transition-all duration-300 uppercase tracking-widest"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download ({zipProgress.size})
                </Button>
                <Button variant="ghost" size="icon" onClick={onClearZipProgress} className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!isProcessing && !zipProgress?.active && (
          <>
            {files.length === 1 && (
              files[0].status === "complete" ? (
                isDirty && (
                  <Button
                    onClick={() => onStartConversion(files[0].id)}
                    variant="outline"
                    className="w-full font-bold shadow-sm border-primary text-primary hover:text-primary hover:bg-primary/10 glow-border glow-text transition-all duration-300 uppercase tracking-widest"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Update Current
                  </Button>
                )
              ) : (
                <Button
                  onClick={() => onStartConversion(files[0].id)}
                  variant="outline"
                  className="w-full font-bold shadow-sm border-primary text-primary hover:text-primary hover:bg-primary/10 glow-border glow-text transition-all duration-300 uppercase tracking-widest"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Convert PDF
                </Button>
              )
            )}

            {files.length > 1 && (
              <>
                <Button
                  onClick={() => onStartConversion()}
                  variant="outline"
                  className={cn(
                    "w-full font-bold shadow-sm transition-all duration-300 uppercase tracking-widest",
                    allComplete && !isDirty
                      ? "border-muted text-muted-foreground"
                      : "border-primary text-primary hover:text-primary hover:bg-primary/10 glow-border glow-text"
                  )}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Convert All
                </Button>
                
                {selectedFileId && (!allComplete || isDirty) && (
                  <Button
                    onClick={() => onStartConversion(selectedFileId)}
                    variant="ghost"
                    className="w-full text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest"
                  >
                    <Play className="h-3 w-3 mr-1.5" />
                    Convert Current Only
                  </Button>
                )}
              </>
            )}
            
            {(files.length === 1 && files[0].status === "complete") && (
              <Button onClick={() => onDownloadAll()} variant="outline" className="w-full border-muted text-foreground hover:bg-accent/50 uppercase tracking-widest text-xs h-9">
                <Archive className="h-3.5 w-3.5 mr-2" />
                Download All as ZIP
              </Button>
            )}

            {(files.length > 1 && allComplete) && (
              <Button onClick={() => onDownloadAll()} variant="outline" className="w-full border-muted text-foreground hover:bg-accent/50 uppercase tracking-widest text-xs h-9">
                <Archive className="h-3.5 w-3.5 mr-2" />
                Download All as ZIP
              </Button>
            )}
          </>
        )}

        {isProcessing && (
          <Button
            onClick={onStopConversion}
            variant="destructive"
            className="w-full uppercase tracking-widest font-bold"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Engine
          </Button>
        )}

        {!isProcessing && hasErrors && (
          <p className="text-xs text-destructive text-center">
            Some pages failed to process. Check preview.
          </p>
        )}
      </div>

      {isProcessing && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-primary/80 font-mono">
            {SPEED_MESSAGES[messageIndex]}
          </span>
        </div>
      )}

    </div>
  )
}

