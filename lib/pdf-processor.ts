"use client"

import type { PDFMetadata, ConversionSettings } from "./types"
import { parsePageRange } from "./utils"

// PDF.js types
interface PDFDocumentProxy {
  numPages: number
  getPage(pageNumber: number): Promise<PDFPageProxy>
  getMetadata(): Promise<{ info: Record<string, unknown> }>
  destroy(): Promise<void>
}

interface PDFPageProxy {
  rotate: number
  getViewport(params: { scale: number; rotation?: number }): PDFViewport
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: PDFViewport }): { promise: Promise<void> }
}

interface PDFViewport {
  width: number
  height: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  
  // Dynamic import to avoid SSR issues
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjsLib = pdfjs
  
  // Use local worker file copied to public folder
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs"
  
  return pdfjsLib
}

function parsePDFDate(dateStr: unknown): string {
  if (!dateStr || typeof dateStr !== "string") return "-"
  
  let cleanStr = dateStr
  if (cleanStr.startsWith("D:")) {
    cleanStr = cleanStr.slice(2)
  }
  
  const match = cleanStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (!match) {
    const parsed = Date.parse(dateStr)
    if (!isNaN(parsed)) {
      return new Date(parsed).toLocaleString("en-US", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: true
      })
    }
    return "-"
  }
  
  const [_, year, month, day, hour, minute, second] = match
  
  let offset = ""
  const offsetPart = cleanStr.slice(14)
  if (offsetPart.startsWith("Z")) {
    offset = "Z"
  } else {
    const tzMatch = offsetPart.match(/^([+-])(\d{2})'(\d{2})'/)
    if (tzMatch) {
      offset = `${tzMatch[1]}${tzMatch[2]}:${tzMatch[3]}`
    }
  }
  
  try {
    const isoStr = `${year}-${month}-${day}T${hour}:${minute}:${second}${offset || "Z"}`
    const date = new Date(isoStr)
    if (!isNaN(date.getTime())) {
      return date.toLocaleString("en-US", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: true
      })
    }
  } catch (e) {
    // Ignore error
  }
  
  try {
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    )
    if (!isNaN(date.getTime())) {
      return date.toLocaleString("en-US", {
        year: "2-digit",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: true
      })
    }
  } catch (e) {
    // Ignore error
  }
  
  return "-"
}

export interface AnalysisResult {
  pageCount: number
  metadata: PDFMetadata
  previews: {
    url: string
    width: number
    height: number
  }[]
}

export async function analyzePDF(pdfFile: import("./types").PDFFile, checkCancelled?: () => boolean): Promise<AnalysisResult> {
  const pdfjs = await getPdfjs()
  
  let source: string | Uint8Array = ""
  let url = ""
  if (pdfFile.path && window.__TAURI_INTERNALS__) {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    // Temporarily read into memory for pdf.js preview to avoid asset protocol CORS. 
    // We will replace this with native MuPDF preview generation soon.
    source = await readFile(pdfFile.path)
  } else if (pdfFile.file) {
    url = URL.createObjectURL(pdfFile.file)
    source = url
  } else {
    throw new Error("No file or path provided")
  }
  
  const docInitParams = typeof source === "string" ? source : { data: source }
  const pdf = await pdfjs.getDocument(docInitParams).promise as PDFDocumentProxy
  
  try {
    const previews: AnalysisResult["previews"] = []
    
    // Generate preview for all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      if (checkCancelled && checkCancelled()) {
        throw new Error("Cancelled")
      }

      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 0.5 })
      
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")!
      
      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise
      
      previews.push({
        url: canvas.toDataURL("image/jpeg", 0.7),
        width: viewport.width,
        height: viewport.height,
      })

      // Yield execution to the browser event loop to avoid thread starvation
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    
    // Get metadata
    let metadata: Record<string, unknown> = {}
    try {
      const metaResult = await pdf.getMetadata()
      metadata = metaResult.info || {}
    } catch {
      // Metadata might not be available
    }

    // Get PDF version from file header
    let pdfVersion: string | undefined = undefined
    let header: string = ''
    try {
      if (pdfFile.file) {
        header = await pdfFile.file.slice(0, 100).text()
      } else if (pdfFile.path && window.__TAURI_INTERNALS__) {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        // Read just first 100 bytes (workaround, readFile reads all but we just want header)
        const bytes = await readFile(pdfFile.path)
        header = new TextDecoder().decode(bytes.slice(0, 100))
      }
      const match = header.match(/%PDF-(\d+\.\d+)/)
      if (match) {
        pdfVersion = match[1]
      }
    } catch (e) {
      console.error("Error reading PDF version header:", e)
    }
    
    // Analyze first page dimensions at 72 DPI (standard PDF units)
    const firstPage = await pdf.getPage(1)
    const fullViewport = firstPage.getViewport({ scale: 1 })
    const pageWidthPt = fullViewport.width
    const pageHeightPt = fullViewport.height
    
    // Convert points to inches (72 points per inch) then to mm
    const pageWidthMm = (pageWidthPt / 72) * 25.4
    const pageHeightMm = (pageHeightPt / 72) * 25.4
    
    // Detect linearization (Fast Web View) by checking header for '/Linearized'
    const isLinearized = header.includes('/Linearized');
    const pdfMetadata: PDFMetadata = {
      colorSpaces: ["RGB"], // PDF.js renders to RGB
      hasTransparency: false, // Would need deeper analysis
      hasCMYK: false, // PDF.js converts to RGB
      hasRGB: true,
      hasSpotColors: false,
      embeddedFonts: [], // Would need deeper analysis
      iccProfiles: [],
      hasOverprint: false,
      pageWidth: pageWidthMm,
      pageHeight: pageHeightMm,
      creatorApp: metadata.Creator as string | undefined,
      title: metadata.Title as string | undefined,
      author: metadata.Author as string | undefined,
      subject: metadata.Subject as string | undefined,
      keywords: metadata.Keywords as string | undefined,
      creationDate: parsePDFDate(metadata.CreationDate),
      modDate: parsePDFDate(metadata.ModDate),
      producer: metadata.Producer as string | undefined,
      pdfVersion: pdfVersion,
      isLinearized,
    }
    
    return {
      pageCount: pdf.numPages,
      metadata: pdfMetadata,
      previews,
    }
  } finally {
    await pdf.destroy()
    URL.revokeObjectURL(url)
  }
}


export interface ConvertedPage {
  pageNumber: number
  dataUrl: string
  width: number
  height: number
  localPath?: string
}

export async function convertPDFPage(
  pdf: PDFDocumentProxy,
  pdfPage: import("./types").PDFPage,
  settings: ConversionSettings,
  onProgress?: (progress: number) => void
): Promise<ConvertedPage> {
  const page = await pdf.getPage(pdfPage.pageNumber)
  
  // Calculate scale based on DPI
  // PDF.js uses 72 DPI as base, so scale = targetDPI / 72
  const scale = settings.dpi / 72
  
  // Rotate relative to the page's natural rotation
  const viewport = page.getViewport({ scale, rotation: (page.rotate + (pdfPage.rotation || 0)) % 360 })
  
  const preserveAlpha = settings.transparencyPreservation && settings.exportFormat !== "jpg"

  // Create high-resolution temporary canvas
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  
  const ctx = canvas.getContext("2d", {
    alpha: preserveAlpha,
  })!
  
  // Set background to white if not preserving transparency
  if (!preserveAlpha) {
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  
  // Apply anti-aliasing settings
  ctx.imageSmoothingEnabled = settings.vectorAntiAliasing !== "off"
  ctx.imageSmoothingQuality = settings.vectorAntiAliasing === "high" ? "high" : 
                              settings.vectorAntiAliasing === "medium" ? "medium" : "low"

  // Render the page naturally to the temp canvas
  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise
  
  // Now create the final canvas to apply edits (like flips)
  const finalCanvas = document.createElement("canvas")
  finalCanvas.width = canvas.width
  finalCanvas.height = canvas.height
  const finalCtx = finalCanvas.getContext("2d", {
    alpha: preserveAlpha,
  })!

  if (!preserveAlpha) {
    finalCtx.fillStyle = "white"
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
  }

  // Apply flips on finalCtx if needed
  if (pdfPage.flipX || pdfPage.flipY) {
    finalCtx.translate(
      pdfPage.flipX ? finalCanvas.width : 0,
      pdfPage.flipY ? finalCanvas.height : 0
    )
    finalCtx.scale(
      pdfPage.flipX ? -1 : 1,
      pdfPage.flipY ? -1 : 1
    )
  }

  // Draw the rendered page from the temp canvas onto the final canvas
  finalCtx.drawImage(canvas, 0, 0)

  // Apply output sharpening if enabled on the final canvas context
  if (settings.outputSharpening !== "off") {
    applySharpeningFilter(finalCtx, finalCanvas.width, finalCanvas.height, settings.outputSharpening)
  }
  
  if (onProgress) {
    onProgress(100)
  }
  
  // Export based on settings.exportFormat
  let mimeType = "image/jpeg"
  let quality: number | undefined = undefined

  if (settings.exportFormat === "png") {
    mimeType = "image/png"
  } else if (settings.exportFormat === "webp") {
    mimeType = "image/webp"
    quality = settings.jpegQuality / 100
  } else {
    mimeType = "image/jpeg"
    quality = settings.jpegQuality / 100
  }

  const dataUrl = finalCanvas.toDataURL(mimeType, quality)
  
  return {
    pageNumber: pdfPage.pageNumber,
    dataUrl,
    width: finalCanvas.width,
    height: finalCanvas.height,
  }
}

export async function convertAllPages(
  pdfFile: import("./types").PDFFile,
  settings: ConversionSettings,
  onPageComplete?: (pageNumber: number, dataUrl: string, localPath?: string) => void,
  onProgress?: (overallProgress: number) => void,
  checkCancelled?: () => boolean
): Promise<ConvertedPage[]> {
  
  if (!window.__TAURI_INTERNALS__) {
    throw new Error("Native conversion requires Tauri desktop environment.");
  }

  if (!pdfFile.path) {
    throw new Error("Native file path is missing.");
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const { convertFileSrc } = await import('@tauri-apps/api/core');

  const activePageNumbers = new Set<number>()
  const activePages = pdfFile.pages.filter(p => !p.deleted)
  
  if (settings.exportScope === "selected") {
    activePages.forEach((p) => {
      if (p.selected !== false) activePageNumbers.add(p.pageNumber)
    })
  } else if (settings.exportScope === "range") {
    const parsed = parsePageRange(settings.customRange, activePages.length)
    parsed.forEach(displayNum => {
      const physicalPage = activePages[displayNum - 1]
      if (physicalPage) activePageNumbers.add(physicalPage.pageNumber)
    })
  } else if (settings.exportScope === "odd") {
    activePages.forEach((p, idx) => {
      const displayNum = idx + 1
      if (displayNum % 2 !== 0) activePageNumbers.add(p.pageNumber)
    })
  } else if (settings.exportScope === "even") {
    activePages.forEach((p, idx) => {
      const displayNum = idx + 1
      if (displayNum % 2 === 0) activePageNumbers.add(p.pageNumber)
    })
  } else {
    activePages.forEach((p) => activePageNumbers.add(p.pageNumber))
  }

  const pagesArray = Array.from(activePageNumbers).sort((a, b) => a - b);
  
  if (onProgress) onProgress(10); // Starting

  try {
    const generatedPaths = await invoke<string[]>('convert_pdf_native', {
      id: pdfFile.id,
      path: pdfFile.path,
      dpi: settings.dpi || 300,
      format: settings.exportFormat === 'png' ? 'png' : 'jpeg',
      pages: pagesArray
    });

    const results: ConvertedPage[] = [];
    
    for (let i = 0; i < generatedPaths.length; i++) {
      if (checkCancelled && checkCancelled()) break;
      
      const localPath = generatedPaths[i];
      const pageNum = pagesArray[i] || (i + 1);
      
      // Convert the absolute native path to a tauri:// URL for the browser to render
      const dataUrl = convertFileSrc(localPath);
      
      results.push({
        pageNumber: pageNum,
        dataUrl,
        width: 0, // Native backend handles this
        height: 0,
        localPath,
      });

      if (onPageComplete) {
        onPageComplete(pageNum, dataUrl, localPath);
      }
      if (onProgress) {
        onProgress(10 + Math.round(((i + 1) / generatedPaths.length) * 90));
      }
    }

    return results;

  } catch (error) {
    console.error("Native conversion failed:", error);
    throw new Error(error as string);
  }
}

function applySharpeningFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  level: "subtle" | "moderate" | "strong"
): void {
  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  
  // Sharpening kernel strength based on level
  const strength = level === "subtle" ? 0.3 : level === "moderate" ? 0.5 : 0.8
  
  // Simple unsharp mask approximation
  const tempData = new Uint8ClampedArray(data)
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      
      for (let c = 0; c < 3; c++) {
        // Get surrounding pixels
        const center = tempData[idx + c]
        const top = tempData[((y - 1) * width + x) * 4 + c]
        const bottom = tempData[((y + 1) * width + x) * 4 + c]
        const left = tempData[(y * width + (x - 1)) * 4 + c]
        const right = tempData[(y * width + (x + 1)) * 4 + c]
        
        // Calculate Laplacian
        const laplacian = center * 4 - top - bottom - left - right
        
        // Apply sharpening
        const sharpened = center + laplacian * strength
        data[idx + c] = Math.max(0, Math.min(255, sharpened))
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0)
}

export async function renderHighResPage(
  pdfFile: import("./types").PDFFile,
  pageNumber: number,
  scale: number = 2.0
): Promise<string> {
  const pdfjs = await getPdfjs()
  
  let source: string | Uint8Array = ""
  let url = ""
  if (pdfFile.path && window.__TAURI_INTERNALS__) {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    source = await readFile(pdfFile.path)
  } else if (pdfFile.file) {
    url = URL.createObjectURL(pdfFile.file)
    source = url
  } else {
    throw new Error("No file or path provided")
  }
  
  const docInitParams = typeof source === "string" ? source : { data: source }
  const pdf = await pdfjs.getDocument(docInitParams).promise as PDFDocumentProxy
  try {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    
    const canvas = document.createElement("canvas")
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext("2d")!
    
    // Default background is white for preview clarity
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise
    
    return new Promise<string>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob))
          } else {
            reject(new Error("Failed to create blob"))
          }
        },
        "image/jpeg",
        0.9
      )
    })
  } finally {
    await pdf.destroy()
    if (url) {
      URL.revokeObjectURL(url)
    }
  }
}

export async function renderCropSnippet(
  pdfFile: import("./types").PDFFile,
  pageNumber: number,
  cropBox: { x: number; y: number; w: number; h: number },
  rotation: number = 0,
  flipX: boolean = false,
  flipY: boolean = false,
  scale: number = 4.0
): Promise<string> {
  const pdfjs = await getPdfjs()
  
  let source: string | Uint8Array = ""
  let url = ""
  if (pdfFile.path && window.__TAURI_INTERNALS__) {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    source = await readFile(pdfFile.path)
  } else if (pdfFile.file) {
    url = URL.createObjectURL(pdfFile.file)
    source = url
  } else {
    throw new Error("No file or path provided")
  }
  
  const docInitParams = typeof source === "string" ? source : { data: source }
  const pdf = await pdfjs.getDocument(docInitParams).promise as PDFDocumentProxy
  try {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    
    const pageCanvas = document.createElement("canvas")
    pageCanvas.width = Math.floor(viewport.width)
    pageCanvas.height = Math.floor(viewport.height)
    const pageCtx = pageCanvas.getContext("2d")!
    
    pageCtx.fillStyle = "white"
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    
    await page.render({
      canvasContext: pageCtx,
      viewport,
    }).promise
    
    const xPixel = pageCanvas.width * (cropBox.x / 100)
    const yPixel = pageCanvas.height * (cropBox.y / 100)
    const wPixel = pageCanvas.width * (cropBox.w / 100)
    const hPixel = pageCanvas.height * (cropBox.h / 100)
    
    const cropCanvas = document.createElement("canvas")
    cropCanvas.width = Math.floor(wPixel)
    cropCanvas.height = Math.floor(hPixel)
    const cropCtx = cropCanvas.getContext("2d")!
    
    cropCtx.drawImage(
      pageCanvas,
      xPixel, yPixel, wPixel, hPixel,
      0, 0, wPixel, hPixel
    )

    let finalCanvas = cropCanvas
    if (rotation !== 0 || flipX || flipY) {
      finalCanvas = document.createElement("canvas")
      const isRotated = rotation === 90 || rotation === 270
      finalCanvas.width = isRotated ? cropCanvas.height : cropCanvas.width
      finalCanvas.height = isRotated ? cropCanvas.width : cropCanvas.height
      const finalCtx = finalCanvas.getContext("2d")!
      
      finalCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2)
      finalCtx.rotate((rotation * Math.PI) / 180)
      finalCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
      finalCtx.drawImage(cropCanvas, -cropCanvas.width / 2, -cropCanvas.height / 2)
    }
    
    return new Promise<string>((resolve, reject) => {
      finalCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob))
          } else {
            reject(new Error("Failed to create snippet blob"))
          }
        },
        "image/png"
      )
    })
  } finally {
    await pdf.destroy()
    if (url) {
      URL.revokeObjectURL(url)
    }
  }
}
