"use client"

import { Download, Archive, Loader2, Play, Square, Trash2, CheckCircle2 } from "lucide-react"
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
  onStartConversion: (fileId?: string) => void
  onStopConversion: () => void
  onDownloadSingle: (fileId: string, pageNumber: number) => void
  onDownloadAll: (fileId?: string) => void
  onReset: () => void
}

export function ConversionControls({
  files,
  job,
  selectedFileId,
  selectedFilePages = 0,
  isDirty = false,
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

  const selectedFile = files.find((f) => f.id === selectedFileId)

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date()
    const diff = endTime.getTime() - start.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">Conversion</h3>
          {job?.startTime && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {isProcessing
                ? `Processing... ${formatDuration(job.startTime)}`
                : isComplete
                ? (
                  <>
                    <span>Completed in {formatDuration(job.startTime, job.endTime)}</span>
                    {!hasErrors && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline-block animate-pulse" />}
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
              title="Reset PDF Conversion Status"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {(isProcessing || isComplete) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {displayCompletedPages} of {displayTotalPages} pages
            </span>
            <span className="font-mono text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!isProcessing && (
          <>
            {files.length === 1 && (
              files[0].status === "complete" ? (
                isDirty && (
                  <Button
                    onClick={() => onStartConversion(files[0].id)}
                    variant="default"
                    className="w-full font-semibold shadow-sm"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Update Current
                  </Button>
                )
              ) : (
                <Button
                  onClick={() => onStartConversion(files[0].id)}
                  variant="default"
                  className="w-full font-semibold shadow-sm"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Conversion
                </Button>
              )
            )}

            {files.length > 1 && selectedFileId && (
              selectedFile?.status === "complete" ? (
                isDirty && (
                  <Button
                    onClick={() => onStartConversion(selectedFileId)}
                    variant="default"
                    className="w-full font-semibold shadow-sm"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Update Current
                    {selectedFilePages > 0 && (
                      <span className="ml-1 text-primary-foreground/90 font-normal">
                        ({selectedFilePages} page{selectedFilePages !== 1 && "s"})
                      </span>
                    )}
                  </Button>
                )
              ) : (
                <Button
                  onClick={() => onStartConversion(selectedFileId)}
                  variant="default"
                  className="w-full font-semibold shadow-sm"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Convert Current
                  {selectedFilePages > 0 && (
                    <span className="ml-1 text-primary-foreground/90 font-normal">
                      ({selectedFilePages} page{selectedFilePages !== 1 && "s"})
                    </span>
                  )}
                </Button>
              )
            )}
            
            {files.length > 1 && selectedFileId && selectedFile?.status === "complete" && (
              <Button onClick={() => onDownloadAll(selectedFileId)} variant="outline" className="w-full">
                <Archive className="h-4 w-4 mr-2" />
                Download Current as ZIP
              </Button>
            )}
          </>
        )}

        {isProcessing && (
          <Button
            onClick={onStopConversion}
            variant="destructive"
            className="w-full"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Conversion
          </Button>
        )}

        {!isProcessing && hasErrors && (
          <p className="text-xs text-destructive text-center">
            Some pages failed to convert. Check the preview for details.
          </p>
        )}
      </div>

      {isProcessing && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            Rendering with Ghostscript...
          </span>
        </div>
      )}


    </div>
  )
}
