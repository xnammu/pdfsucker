import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parsePageRange(rangeStr: string, maxPages: number): number[] {
  if (!rangeStr || !rangeStr.trim()) return []
  
  const pages = new Set<number>()
  const parts = rangeStr.split(",")
  
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-")
      const start = parseInt(startStr.trim(), 10)
      const end = parseInt(endStr.trim(), 10)
      
      if (!isNaN(start) && !isNaN(end) && start <= end && start > 0) {
        for (let i = start; i <= Math.min(end, maxPages); i++) {
          pages.add(i)
        }
      }
    } else {
      const page = parseInt(trimmed, 10)
      if (!isNaN(page) && page > 0 && page <= maxPages) {
        pages.add(page)
      }
    }
  }
  
  return Array.from(pages).sort((a, b) => a - b)
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",")
  const mime = parts[0].split(";")[0].split(":")[1]
  const byteString = atob(parts[1])
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new Blob([ab], { type: mime })
}
