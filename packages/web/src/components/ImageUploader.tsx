import React, { useEffect, useRef, useState } from "react";
import { deleteMedia, uploadMedia } from "../api";
import { ImageGallery } from "./ImageGallery";

type MediaVariant = "original" | "medium" | "thumb";

interface ImageUploaderProps {
  shipId: string;
  existingImages: string[];
  onImagesChange: (images: string[]) => void;
  disabled?: boolean;
}

interface LocalPreview {
  id: string;
  name: string;
  url: string;
  status: "queued" | "uploading";
}

function extractFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "") || "image";
}

function collectImageFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    image.src = objectUrl;
  });
}

async function renderVariant(file: File, maxDimension: number, quality: number): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) {
    return file;
  }

  return new File([blob], `${baseName(file.name)}.webp`, { type: "image/webp" });
}

async function buildImageVariants(file: File): Promise<Record<MediaVariant, File>> {
  const [original, medium, thumb] = await Promise.all([
    renderVariant(file, 1600, 0.82),
    renderVariant(file, 800, 0.8),
    renderVariant(file, 240, 0.75)
  ]);

  return { original, medium, thumb };
}

export function ImageUploader({ shipId, existingImages, onImagesChange, disabled = false }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<LocalPreview[]>([]);

  useEffect(() => {
    return () => {
      setLocalPreviews((current) => {
        current.forEach((preview) => URL.revokeObjectURL(preview.url));
        return [];
      });
    };
  }, []);

  function removePreview(previewId: string): void {
    setLocalPreviews((current) => {
      const target = current.find((preview) => preview.id === previewId);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((preview) => preview.id !== previewId);
    });
  }

  function clearPreviews(): void {
    setLocalPreviews((current) => {
      current.forEach((preview) => URL.revokeObjectURL(preview.url));
      return [];
    });
  }

  async function handleFiles(selectedFiles: File[]): Promise<void> {
    if (selectedFiles.length === 0 || disabled) {
      return;
    }

    setUploading(true);
    setError(null);

    const previewBatch = selectedFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      status: "queued" as const
    }));
    setLocalPreviews((current) => [...current, ...previewBatch]);

    let nextImages = [...existingImages];

    try {
      for (const [index, file] of selectedFiles.entries()) {
        const preview = previewBatch[index];
        setLocalPreviews((current) => current.map((entry) => (
          entry.id === preview.id ? { ...entry, status: "uploading" } : entry
        )));
        setProgressText(`Uploading ${index + 1}/${selectedFiles.length}: ${file.name}`);

        const variantBaseId = crypto.randomUUID();
        const variants = await buildImageVariants(file);

        const originalUpload = await uploadMedia(shipId, variants.original, {
          baseId: variantBaseId,
          variant: "original",
          originalName: file.name
        });

        await Promise.all([
          uploadMedia(shipId, variants.medium, {
            baseId: variantBaseId,
            variant: "medium",
            originalName: file.name
          }),
          uploadMedia(shipId, variants.thumb, {
            baseId: variantBaseId,
            variant: "thumb",
            originalName: file.name
          })
        ]);

        nextImages = [...nextImages, originalUpload.key];
        onImagesChange(nextImages);
        removePreview(preview.id);
      }
    } catch (uploadError: any) {
      setError(uploadError?.message || "Failed to upload image");
      clearPreviews();
    } finally {
      setUploading(false);
      setProgressText(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handleFileSelection(files: FileList | null): Promise<void> {
    if (!files) {
      return;
    }
    await handleFiles(collectImageFiles(files));
  }

  async function handleRemove(key: string): Promise<void> {
    try {
      setError(null);
      await deleteMedia(shipId, extractFilename(key));
      onImagesChange(existingImages.filter((item) => item !== key));
    } catch (removeError: any) {
      setError(removeError?.message || "Failed to remove image");
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) {
      return;
    }
    void handleFiles(collectImageFiles(event.dataTransfer.files));
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>): void {
    if (disabled) {
      return;
    }

    const clipboardFiles = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file && file.type.startsWith("image/"));

    if (clipboardFiles.length > 0) {
      event.preventDefault();
      void handleFiles(clipboardFiles);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        tabIndex={disabled ? -1 : 0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        style={{
          border: isDragging ? "2px dashed var(--nb-accent, #0f766e)" : "1px dashed var(--nb-border, #cbd5e1)",
          borderRadius: 10,
          padding: 14,
          background: isDragging ? "rgba(15, 118, 110, 0.08)" : "var(--nb-bg, #fff)",
          outline: "none",
          transition: "all 0.2s ease"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--nb-text, #334155)", fontSize: 13 }}>NCR Images</div>
            <div style={{ fontSize: 12, color: "var(--nb-text-muted, #64748b)" }}>
              Drag images here, click to browse, or paste from clipboard. The browser will generate `original / medium / thumb` WebP variants before upload.
            </div>
          </div>
          <button type="button" style={buttonStyle} disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading..." : "Add Images"}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void handleFileSelection(event.target.files)}
        />

        {progressText ? <div style={{ marginTop: 10, fontSize: 12, color: "var(--nb-text-muted, #64748b)" }}>{progressText}</div> : null}
        {error ? <div style={{ marginTop: 8, color: "#dc2626", fontSize: 12 }}>{error}</div> : null}
      </div>

      {localPreviews.length > 0 ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nb-text-muted, #64748b)", marginBottom: 8 }}>Pending Uploads</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
            {localPreviews.map((preview) => (
              <div key={preview.id} style={previewCardStyle}>
                <img src={preview.url} alt={preview.name} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ fontSize: 11, color: "var(--nb-text-muted, #64748b)", wordBreak: "break-all" }}>{preview.name}</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: preview.status === "uploading" ? "#0f766e" : "#64748b" }}>
                    {preview.status === "uploading" ? "Uploading..." : "Queued"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {existingImages.length > 0 ? (
        <ImageGallery 
          shipId={shipId} 
          images={existingImages} 
          onRemove={handleRemove}
          disabled={disabled || uploading}
        />
      ) : null}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid var(--nb-border, #cbd5e1)",
  borderRadius: 6,
  padding: "8px 12px",
  background: "var(--nb-surface, #f8fafc)",
  color: "var(--nb-text, #334155)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12
};

const previewCardStyle: React.CSSProperties = {
  border: "1px solid var(--nb-border, #e2e8f0)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--nb-bg, #fff)"
};
