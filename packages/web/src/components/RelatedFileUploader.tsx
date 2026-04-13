import React, { useRef, useState } from "react";
import type { NcrRelatedFile } from "@nbins/shared";
import { deleteNcrFile, downloadNcrFile, uploadNcrFile } from "../api";

interface RelatedFileUploaderProps {
  ncrId: string;
  files: NcrRelatedFile[];
  onFilesChange: (files: NcrRelatedFile[]) => void;
  disabled?: boolean;
}

function canPreviewInBrowser(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf" || contentType.startsWith("text/");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function previewBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function RelatedFileUploader({ ncrId, files, onFilesChange, disabled = false }: RelatedFileUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0 || disabled) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const uploaded: NcrRelatedFile[] = [];
      for (const file of Array.from(fileList)) {
        uploaded.push(await uploadNcrFile(ncrId, file));
      }
      onFilesChange([...files, ...uploaded]);
    } catch (uploadError: any) {
      setError(uploadError?.message || "Failed to upload file");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function handlePreview(file: NcrRelatedFile): Promise<void> {
    try {
      setError(null);
      const blob = await downloadNcrFile(ncrId, file.id);
      previewBlob(blob);
    } catch (previewError: any) {
      setError(previewError?.message || "Failed to preview file");
    }
  }

  async function handleDownload(file: NcrRelatedFile): Promise<void> {
    try {
      setError(null);
      const blob = await downloadNcrFile(ncrId, file.id);
      triggerBlobDownload(blob, file.name);
    } catch (downloadError: any) {
      setError(downloadError?.message || "Failed to download file");
    }
  }

  async function handleDelete(file: NcrRelatedFile): Promise<void> {
    try {
      setError(null);
      await deleteNcrFile(ncrId, file.id);
      onFilesChange(files.filter((entry) => entry.id !== file.id));
    } catch (deleteError: any) {
      setError(deleteError?.message || "Failed to delete file");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, color: "var(--nb-text, #334155)", fontSize: 13 }}>Related Files</div>
          <div style={{ fontSize: 12, color: "var(--nb-text-muted, #64748b)" }}>
            Upload supporting PDFs, Excel files, Word documents or ZIP packages.
          </div>
        </div>
        <button type="button" style={buttonStyle} disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading..." : "Upload Files"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.webp,.txt"
        onChange={(event) => void handleUpload(event.target.files)}
      />
      {error ? <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div> : null}
      {files.length === 0 ? (
        <div style={emptyStyle}>No related files uploaded.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((file) => (
            <div key={file.id} style={rowStyle}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nb-text, #334155)", wordBreak: "break-all" }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "var(--nb-text-muted, #64748b)" }}>
                  {file.contentType || "application/octet-stream"} · {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {canPreviewInBrowser(file.contentType) ? (
                  <button type="button" style={smallButtonStyle} onClick={() => void handlePreview(file)}>Preview</button>
                ) : null}
                <button type="button" style={smallButtonStyle} onClick={() => void handleDownload(file)}>Download</button>
                <button type="button" style={dangerButtonStyle} onClick={() => void handleDelete(file)} disabled={disabled || uploading}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
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

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid var(--nb-border, #cbd5e1)",
  borderRadius: 6,
  padding: "6px 10px",
  background: "var(--nb-bg, #fff)",
  color: "var(--nb-text, #334155)",
  cursor: "pointer",
  fontSize: 12
};

const dangerButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c"
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  border: "1px solid var(--nb-border, #e2e8f0)",
  borderRadius: 8,
  background: "var(--nb-bg, #fff)"
};

const emptyStyle: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px dashed var(--nb-border, #cbd5e1)",
  borderRadius: 8,
  color: "var(--nb-text-muted, #64748b)",
  fontSize: 12
};
