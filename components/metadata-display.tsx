"use client"

import { FileText, Palette, Type, Layers, Printer, Info, User, Tag, BookOpen, Calendar } from "lucide-react"
import type { PDFMetadata } from "@/lib/types"

interface MetadataDisplayProps {
  metadata: PDFMetadata | undefined
  fileName: string
  fileSize?: number
  pageCount?: number
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function MetadataDisplay({ metadata, fileName, fileSize, pageCount }: MetadataDisplayProps) {
  if (!metadata) {
    return (
      <div className="p-4 bg-secondary/30 rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          Select a file to view metadata
        </p>
      </div>
    )
  }

  const InfoItem = ({
    icon: Icon,
    label,
    value,
    warning,
  }: {
    icon: React.ElementType
    label: string
    value: React.ReactNode
    warning?: boolean
  }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon
        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
          warning ? "text-warning" : "text-muted-foreground"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <div
          className={`text-sm font-medium ${
            warning ? "text-warning" : "text-foreground"
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">
          Document Info
        </span>
      </div>

      <div className="space-y-1 divide-y divide-border">
        <InfoItem
          icon={FileText}
          label="File"
          value={
            <span className="truncate block" title={fileName}>
              {fileName}
            </span>
          }
        />

        {(fileSize !== undefined || pageCount !== undefined) && (
          <InfoItem
            icon={Layers}
            label="Size & Pages"
            value={
              <span>
                {fileSize !== undefined ? formatBytes(fileSize) : ''}
                {fileSize !== undefined && pageCount !== undefined ? ' • ' : ''}
                {pageCount !== undefined ? `${pageCount} page${pageCount !== 1 ? 's' : ''}` : ''}
              </span>
            }
          />
        )}

        <InfoItem
          icon={Layers}
          label="Dimensions"
          value={`${(metadata.pageWidth / 25.4).toFixed(2)} × ${(metadata.pageHeight / 25.4).toFixed(2)} in`}
        />

        <InfoItem
          icon={Info}
          label="Title"
          value={metadata.title || "-"}
        />

        <InfoItem
          icon={User}
          label="Author"
          value={metadata.author || "-"}
        />

        <InfoItem
          icon={Info}
          label="Fast Web View"
          value={metadata.isLinearized ? "Yes" : "No"}
        />

        <InfoItem
          icon={Calendar}
          label="Created"
          value={metadata.creationDate || "-"}
        />

        <InfoItem
          icon={Calendar}
          label="Modified"
          value={metadata.modDate || "-"}
        />

        <InfoItem
          icon={Info}
          label="Application"
          value={metadata.creatorApp || "-"}
        />

        <InfoItem
          icon={Info}
          label="PDF Producer"
          value={metadata.producer || "-"}
        />

        <InfoItem
          icon={Info}
          label="PDF Version"
          value={metadata.pdfVersion || "-"}
        />

        <InfoItem
          icon={Palette}
          label="Color Spaces"
          value={
            <div className="flex flex-wrap gap-1 mt-1">
              {metadata.colorSpaces.length > 0 ? (
                metadata.colorSpaces.map((cs) => (
                  <span
                    key={cs}
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      cs.toLowerCase().includes("cmyk")
                        ? "bg-warning/20 text-warning"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {cs}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          }
          warning={metadata.hasCMYK}
        />

        {metadata.iccProfiles.length > 0 && (
          <InfoItem
            icon={Palette}
            label="ICC Profiles"
            value={
              <div className="space-y-1 mt-1">
                {metadata.iccProfiles.map((profile) => (
                  <span
                    key={profile}
                    className="block text-xs bg-secondary px-1.5 py-0.5 rounded truncate"
                    title={profile}
                  >
                    {profile}
                  </span>
                ))}
              </div>
            }
          />
        )}

        {metadata.outputIntent && (
          <InfoItem
            icon={Printer}
            label="Output Intent"
            value={metadata.outputIntent}
          />
        )}

        <InfoItem
          icon={Type}
          label="Embedded Fonts"
          value={
            metadata.embeddedFonts.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {metadata.embeddedFonts.slice(0, 5).map((font) => (
                  <span
                    key={font}
                    className="px-1.5 py-0.5 rounded text-xs bg-secondary text-secondary-foreground truncate max-w-24"
                    title={font}
                  >
                    {font}
                  </span>
                ))}
                {metadata.embeddedFonts.length > 5 && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground">
                    +{metadata.embeddedFonts.length - 5} more
                  </span>
                )}
              </div>
            ) : (
              "No embedded fonts"
            )
          }
        />

        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Features
          </p>
          <div className="flex flex-wrap gap-2">
            {metadata.hasTransparency && (
              <span className="px-2 py-1 rounded-full text-xs bg-info/20 text-info">
                Transparency
              </span>
            )}
            {metadata.hasOverprint && (
              <span className="px-2 py-1 rounded-full text-xs bg-accent/20 text-accent">
                Overprint
              </span>
            )}
            {metadata.hasSpotColors && (
              <span className="px-2 py-1 rounded-full text-xs bg-chart-5/20 text-chart-5">
                Spot Colors
              </span>
            )}
            {!metadata.hasTransparency &&
              !metadata.hasOverprint &&
              !metadata.hasSpotColors && (
                <span className="text-xs text-muted-foreground">
                  No special features
                </span>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}
