"use client"

import { Info, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { ConversionSettings } from "@/lib/types"

interface SettingsPanelProps {
  settings: ConversionSettings
  onSettingsChange: (settings: ConversionSettings) => void
  disabled?: boolean
  sections?: ("resolution" | "color" | "rendering" | "geometry")[]
  activePageCount?: number
}

function SettingRow({
  label,
  tooltip,
  children,
  inline = false,
}: {
  label: string
  tooltip?: string
  children: React.ReactNode
  inline?: boolean
}) {
  if (inline) {
    return (
      <div className="flex items-center justify-between py-2 gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-foreground">{label}</Label>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help animate-pulse" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex-shrink-0">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="w-full mt-1">
        {children}
      </div>
    </div>
  )
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  disabled = false,
  sections = ["resolution", "color", "rendering", "geometry"],
  activePageCount = 2,
}: SettingsPanelProps) {
  const updateSetting = <K extends keyof ConversionSettings>(
    key: K,
    value: ConversionSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  return (
    <div className={cn("space-y-4", disabled && "opacity-50 pointer-events-none")}>
      <Accordion type="multiple" defaultValue={["export-scope", "color", "rendering", "geometry"]} className="space-y-2">
        <AccordionItem value="export-scope" className="border border-border rounded-lg px-4 bg-primary/[0.02]">
          <AccordionTrigger className="text-sm font-semibold hover:no-underline text-primary flex items-center gap-2">
            Export Scope & Options
          </AccordionTrigger>
          <AccordionContent className="space-y-1 pb-4">
            {/* Scope Selection */}
            <SettingRow
              label="Pages to Convert"
              tooltip="All: converts all pages. Selected: converts only pages checked in the left sidebar checklist. Custom Range: converts a list/range of pages (e.g. 1-3, 5)."
            >
              <Select
                value={settings.exportScope}
                onValueChange={(v) => updateSetting("exportScope", v as any)}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pages</SelectItem>
                  <SelectItem value="selected">Selected Pages</SelectItem>
                  <SelectItem value="range" disabled={activePageCount <= 1}>Custom Range</SelectItem>
                  <SelectItem value="odd" disabled={activePageCount <= 1}>Odd Pages Only</SelectItem>
                  <SelectItem value="even" disabled={activePageCount <= 1}>Even Pages Only</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            {/* Custom Range Text Input */}
            {settings.exportScope === "range" && (
              <SettingRow
                label="Custom Page Range"
                tooltip="Enter page numbers and/or ranges separated by commas. E.g. '1-3, 5, 8-10'."
              >
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={settings.customRange}
                    onChange={(e) => updateSetting("customRange", e.target.value)}
                    placeholder="e.g. 1-3, 5, 8-10"
                    className="w-full text-sm px-3 py-2 bg-background border border-input rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Valid format: single numbers or hyphen ranges, separated by commas.
                  </p>
                </div>
              </SettingRow>
            )}

            {/* Format Selection */}
            <SettingRow
              label="Output Format"
              tooltip="JPG: Standard format for prints. PNG: Lossless quality with transparency support. WebP: High-compression format with transparency support."
            >
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-muted rounded-lg border border-border">
                {(["jpg", "png", "webp"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => updateSetting("exportFormat", format)}
                    className={cn(
                      "py-1 text-xs font-semibold rounded-md transition-all uppercase",
                      settings.exportFormat === format
                        ? "bg-background text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Separator / Sub-heading */}
            <div className="border-t border-border/60 my-4 pt-1" />

            {/* Quality Preset Selection */}
            <SettingRow
              label="Quality Preset"
              tooltip="Low: 150 DPI (screen preview). Standard: 300 DPI (high quality web/print). Max: 600 DPI (professional print-production quality)."
            >
              <div className="grid grid-cols-4 gap-1 p-0.5 bg-muted rounded-lg border border-border">
                {([
                  { label: "Low", dpi: 150, quality: 80 },
                  { label: "Standard", dpi: 300, quality: 90 },
                  { label: "Max", dpi: 600, quality: 100 },
                  { label: "Custom", dpi: null, quality: null },
                ] as const).map((preset) => {
                  const isPng = settings.exportFormat === "png"
                  const targetQuality = isPng ? 100 : preset.quality
                  
                  const isActive = preset.label === "Custom"
                    ? (
                        (settings.dpi !== 150 || (!isPng && settings.jpegQuality !== 80)) &&
                        (settings.dpi !== 300 || (!isPng && settings.jpegQuality !== 90)) &&
                        (settings.dpi !== 600 || (!isPng && settings.jpegQuality !== 100))
                      )
                    : (settings.dpi === preset.dpi && (isPng || settings.jpegQuality === targetQuality))

                  return (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={preset.label === "Custom" && isActive}
                      onClick={() => {
                        if (preset.label !== "Custom" && preset.dpi && preset.quality) {
                          onSettingsChange({
                            ...settings,
                            dpi: preset.dpi,
                            jpegQuality: isPng ? 100 : preset.quality,
                          })
                        }
                      }}
                      className={cn(
                        "py-1 text-xs font-semibold rounded-md transition-all",
                        isActive
                          ? "bg-background text-primary shadow-sm animate-fade-in"
                          : "text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                      )}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </SettingRow>

            {/* DPI */}
            <SettingRow
              label="DPI"
              tooltip="Dots per inch. Higher values produce sharper output but larger files. 300 DPI is standard print quality, 600 DPI is high quality."
            >
              <div className="flex items-center gap-3 w-full">
                <Slider
                  value={[settings.dpi]}
                  onValueChange={([v]) => updateSetting("dpi", v)}
                  min={150}
                  max={1200}
                  step={50}
                  className="flex-1"
                />
                <span className="text-sm font-mono text-muted-foreground w-12 text-right">
                  {settings.dpi}
                </span>
              </div>
            </SettingRow>

            {/* Adaptive Quality Slider */}
            <SettingRow
              label={settings.exportFormat === "png" ? "Lossless PNG" : settings.exportFormat === "webp" ? "WebP Quality" : "JPEG Quality"}
              tooltip={settings.exportFormat === "png" ? "PNG is lossless and preserves absolute quality." : "Compression quality 1-100. Use 100 for maximum quality with no compression artifacts."}
            >
              {settings.exportFormat === "png" ? (
                <span className="text-xs text-muted-foreground italic py-1">
                  PNG is fully lossless • Quality locked at 100%
                </span>
              ) : (
                <div className="flex items-center gap-3 w-full">
                  <Slider
                    value={[settings.jpegQuality]}
                    onValueChange={([v]) => updateSetting("jpegQuality", v)}
                    min={70}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono text-muted-foreground w-12 text-right">
                    {settings.jpegQuality}%
                  </span>
                </div>
              )}
            </SettingRow>

            {/* Chroma Subsampling (INLINE Toggle) */}
            <SettingRow
              inline
              label="Chroma Subsampling"
              tooltip="Reduces color resolution. Disable (4:4:4) for maximum quality, enable for smaller files."
            >
              <Switch
                checked={settings.chromaSubsampling}
                onCheckedChange={(v) => updateSetting("chromaSubsampling", v)}
              />
            </SettingRow>

            {/* Progressive JPEG (INLINE Toggle) */}
            <SettingRow
              inline
              label="Progressive JPEG"
              tooltip="Creates progressive-loading JPEGs. May slightly increase file size."
            >
              <Switch
                checked={settings.progressiveJpeg}
                onCheckedChange={(v) => updateSetting("progressiveJpeg", v)}
              />
            </SettingRow>
          </AccordionContent>
        </AccordionItem>

        {sections.includes("color") && (
        <AccordionItem value="color" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Color Management
          </AccordionTrigger>
          <AccordionContent className="space-y-1 pb-4">
            <SettingRow
              label="Color Mode"
              tooltip="How to handle color conversion. 'Preserve' maintains original appearance, 'RGB' converts to sRGB, 'CMYK Simulate' shows print simulation."
            >
              <Select
                value={settings.colorMode}
                onValueChange={(v) =>
                  updateSetting("colorMode", v as ConversionSettings["colorMode"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve">Preserve</SelectItem>
                  <SelectItem value="rgb">Convert to RGB</SelectItem>
                  <SelectItem value="cmyk-simulate">CMYK Simulate</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              label="ICC Profile"
              tooltip="Output color profile. 'Preserve' keeps embedded profiles, others convert to specific color spaces."
            >
              <Select
                value={settings.iccProfile}
                onValueChange={(v) =>
                  updateSetting("iccProfile", v as ConversionSettings["iccProfile"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve">Preserve</SelectItem>
                  <SelectItem value="srgb">sRGB IEC61966-2.1</SelectItem>
                  <SelectItem value="adobe-rgb">Adobe RGB (1998)</SelectItem>
                  <SelectItem value="fogra39">FOGRA39 (ISO Coated)</SelectItem>
                  <SelectItem value="gracol">GRACoL 2006</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              label="Rendering Intent"
              tooltip="How colors are mapped between color spaces. Relative Colorimetric is recommended for most use cases."
            >
              <Select
                value={settings.renderingIntent}
                onValueChange={(v) =>
                  updateSetting(
                    "renderingIntent",
                    v as ConversionSettings["renderingIntent"]
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="perceptual">Perceptual</SelectItem>
                  <SelectItem value="relative-colorimetric">
                    Relative Colorimetric
                  </SelectItem>
                  <SelectItem value="saturation">Saturation</SelectItem>
                  <SelectItem value="absolute-colorimetric">
                    Absolute Colorimetric
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              inline
              label="Overprint Simulation"
              tooltip="Simulates overprint effects from print workflows. Enable for accurate preview of press output."
            >
              <Switch
                checked={settings.overprintSimulation}
                onCheckedChange={(v) => updateSetting("overprintSimulation", v)}
              />
            </SettingRow>
          </AccordionContent>
        </AccordionItem>
        )}

        {sections.includes("rendering") && (
        <AccordionItem value="rendering" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Rendering Options
          </AccordionTrigger>
          <AccordionContent className="space-y-1 pb-4">
            <SettingRow
              label="Vector Anti-Aliasing"
              tooltip="Smoothing for vector graphics and shapes. Higher quality reduces jagged edges."
            >
              <Select
                value={settings.vectorAntiAliasing}
                onValueChange={(v) =>
                  updateSetting(
                    "vectorAntiAliasing",
                    v as ConversionSettings["vectorAntiAliasing"]
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="low">Low (2-bit)</SelectItem>
                  <SelectItem value="medium">Medium (4-bit)</SelectItem>
                  <SelectItem value="high">High (8-bit)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              label="Text Anti-Aliasing"
              tooltip="Smoothing for text rendering. Higher quality improves readability at all sizes."
            >
              <Select
                value={settings.textAntiAliasing}
                onValueChange={(v) =>
                  updateSetting(
                    "textAntiAliasing",
                    v as ConversionSettings["textAntiAliasing"]
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="low">Low (2-bit)</SelectItem>
                  <SelectItem value="medium">Medium (4-bit)</SelectItem>
                  <SelectItem value="high">High (8-bit)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              inline
              label="Transparency Preservation"
              tooltip="Maintains transparency and blend modes. Disable only if you need solid backgrounds."
            >
              <Switch
                checked={settings.transparencyPreservation}
                onCheckedChange={(v) =>
                  updateSetting("transparencyPreservation", v)
                }
              />
            </SettingRow>

            <SettingRow
              label="Output Sharpening"
              tooltip="Apply sharpening to the output. Use subtly for screen viewing."
            >
              <Select
                value={settings.outputSharpening}
                onValueChange={(v) =>
                  updateSetting(
                    "outputSharpening",
                    v as ConversionSettings["outputSharpening"]
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="subtle">Subtle</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="strong">Strong</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </AccordionContent>
        </AccordionItem>
        )}

        {sections.includes("geometry") && (
        <AccordionItem value="geometry" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Page Geometry
          </AccordionTrigger>
          <AccordionContent className="space-y-1 pb-4">
            <SettingRow
              label="Box Selection"
              tooltip="Which PDF box to use for rendering boundaries. CropBox is most common for final output."
            >
              <Select
                value={settings.boxSelection}
                onValueChange={(v) =>
                  updateSetting(
                    "boxSelection",
                    v as ConversionSettings["boxSelection"]
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mediabox">MediaBox</SelectItem>
                  <SelectItem value="cropbox">CropBox</SelectItem>
                  <SelectItem value="trimbox">TrimBox</SelectItem>
                  <SelectItem value="bleedbox">BleedBox</SelectItem>
                  <SelectItem value="artbox">ArtBox</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow
              inline
              label="Include Bleed"
              tooltip="Extend rendering beyond trim marks to include bleed area."
            >
              <Switch
                checked={settings.includeBleed}
                onCheckedChange={(v) => updateSetting("includeBleed", v)}
              />
            </SettingRow>
          </AccordionContent>
        </AccordionItem>
        )}
      </Accordion>
    </div>
  )
}
