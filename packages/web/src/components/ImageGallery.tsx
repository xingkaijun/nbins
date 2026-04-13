import React, { useEffect, useState } from "react";
import { downloadMedia } from "../api";

interface ImageGalleryProps {
  shipId: string;
  images: string[];
  onRemove?: (key: string) => void;
  disabled?: boolean;
}

function extractFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
}

function toVariantFilename(filename: string, variant: "thumb" | "medium"): string {
  const original = filename.replace(/_(thumb|medium)(?=\.webp$)/i, "");
  const base = original.replace(/\.[^.]+$/, "");
  return `${base}_${variant}.webp`;
}

function previewBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ImageGallery({ shipId, images, onRemove, disabled = false }: ImageGalleryProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const imagesKey = images.join(",");

  useEffect(() => {
    let active = true;
    const currentUrls: string[] = [];

    async function load(): Promise<void> {
      const entries = await Promise.all(images.map(async (key) => {
        const originalFilename = extractFilename(key);
        const thumbFilename = toVariantFilename(originalFilename, "thumb");

        try {
          const thumbBlob = await downloadMedia(shipId, thumbFilename);
          const objectUrl = URL.createObjectURL(thumbBlob);
          currentUrls.push(objectUrl);
          return [key, objectUrl] as const;
        } catch {
          try {
            const originalBlob = await downloadMedia(shipId, originalFilename);
            const objectUrl = URL.createObjectURL(originalBlob);
            currentUrls.push(objectUrl);
            return [key, objectUrl] as const;
          } catch {
            return null;
          }
        }
      }));

      if (!active) {
        currentUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
    }

    if (images.length > 0) {
      void load();
    } else {
      setUrls({});
    }

    return () => {
      active = false;
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesKey, shipId]);

  async function handleOpen(key: string): Promise<void> {
    try {
      const blob = await downloadMedia(shipId, extractFilename(key));
      previewBlob(blob);
    } catch {
      // ignore preview failure to keep gallery resilient
    }
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
      {images.map((key) => {
        const previewUrl = urls[key];
        return (
          <div key={key} style={{ border: "1px solid var(--nb-border, #e2e8f0)", borderRadius: 8, overflow: "hidden", background: "var(--nb-bg, #fff)", display: "flex", flexDirection: "column" }}>
            {previewUrl ? (
              <button
                type="button"
                onClick={() => void handleOpen(key)}
                style={{ border: "none", background: "transparent", padding: 0, width: "100%", cursor: "pointer" }}
              >
                <img src={previewUrl} alt={extractFilename(key)} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
              </button>
            ) : (
              <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--nb-text-muted)" }}>
                Loading...
              </div>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(key)}
                disabled={disabled}
                style={{
                  border: "1px solid #fecaca",
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  padding: "6px 8px",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  opacity: disabled ? 0.5 : 1
                }}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
