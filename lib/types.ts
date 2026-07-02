export interface PDFFile {
  id: string
  file?: File // Keep optional for previews, but native path is preferred
  path?: string
  name: string
  size: number
  pageCount: number
  status: 'pending' | 'analyzing' | 'processing' | 'complete' | 'error'
  progress: number
  metadata?: PDFMetadata
  pages: PDFPage[]
  error?: string
  lastConvertedSignature?: string
  settings: ConversionSettings
}

export interface PDFMetadata {
  colorSpaces: string[]
  hasTransparency: boolean
  hasCMYK: boolean
  hasRGB: boolean
  hasSpotColors: boolean
  embeddedFonts: string[]
  iccProfiles: string[]
  outputIntent?: string
  hasOverprint: boolean
  pageWidth: number
  pageHeight: number
  creatorApp?: string
  title?: string
  author?: string
  isLinearized?: boolean
  creationDate?: string
  modDate?: string
  producer?: string
  pdfVersion?: string
}


export interface PDFPage {
  pageNumber: number
  status: 'pending' | 'processing' | 'complete' | 'error'
  previewUrl?: string
  outputUrl?: string
  localPath?: string
  warnings: string[]
  width: number
  height: number
  rotation: number
  flipX: boolean
  flipY: boolean
  selected?: boolean
  deleted?: boolean
}

export interface ConversionSettings {
  dpi: number
  jpegQuality: number
  colorMode: 'preserve' | 'rgb' | 'cmyk-simulate'
  renderingIntent: 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric'
  overprintSimulation: boolean
  transparencyPreservation: boolean
  vectorAntiAliasing: 'off' | 'low' | 'medium' | 'high'
  textAntiAliasing: 'off' | 'low' | 'medium' | 'high'
  includeBleed: boolean
  boxSelection: 'mediabox' | 'cropbox' | 'trimbox' | 'bleedbox' | 'artbox'
  iccProfile: 'preserve' | 'srgb' | 'adobe-rgb' | 'fogra39' | 'gracol'
  outputSharpening: 'off' | 'subtle' | 'moderate' | 'strong'
  chromaSubsampling: boolean
  progressiveJpeg: boolean
  exportScope: 'all' | 'selected' | 'range' | 'odd' | 'even'
  customRange: string
  exportFormat: 'jpg' | 'png' | 'webp'
}

export interface ConversionJob {
  id: string
  files: PDFFile[]
  settings: ConversionSettings
  status: 'idle' | 'processing' | 'complete' | 'error'
  startTime?: Date
  endTime?: Date
  totalPages: number
  processedPages: number
}

export const DEFAULT_SETTINGS: ConversionSettings = {
  dpi: 600,
  jpegQuality: 100,
  colorMode: 'preserve',
  renderingIntent: 'relative-colorimetric',
  overprintSimulation: true,
  transparencyPreservation: true,
  vectorAntiAliasing: 'high',
  textAntiAliasing: 'high',
  includeBleed: false,
  boxSelection: 'cropbox',
  iccProfile: 'preserve',
  outputSharpening: 'off',
  chromaSubsampling: false,
  progressiveJpeg: false,
  exportScope: 'all',
  customRange: '',
  exportFormat: 'jpg',
}
