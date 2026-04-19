import { jsPDF } from "jspdf";
import { PG_LOGO_B64 } from "./pg-logo-b64";
import type { FatItemResponse } from "@nbins/shared";
import { downloadMedia } from "../api";

/**
 * FAT 高清矢量导出工具
 * 参考 NCR 报告样式，无审批区域
 */

// PDF 颜色配置 (same as NCR)
const COLORS = {
  primary: [15, 118, 110] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  muted: [148, 163, 184] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  bg: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  accent: [13, 148, 136] as [number, number, number],
  pass: [22, 163, 74] as [number, number, number],
  fail: [220, 38, 38] as [number, number, number],
  conditional: [217, 119, 6] as [number, number, number]
};

const ATTACHMENT_TARGET_WIDTH_PX = 1400;

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text || "-", maxWidth);
}

function normalizeText(value: string | null | undefined, fallback = "-"): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function extractFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
}

function ellipsizeText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = "...";
  let output = text;
  while (output.length > 0 && doc.getTextWidth(`${output}${ellipsis}`) > maxWidth) {
    output = output.slice(0, -1);
  }
  return output ? `${output}${ellipsis}` : ellipsis;
}

interface AdaptiveTextOptions {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  fontSize: number;
  minFontSize?: number;
  maxLines?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
}

function drawAdaptiveText(doc: jsPDF, options: AdaptiveTextOptions): { fontSize: number; lineCount: number } {
  const {
    text, x, y, maxWidth, fontSize, minFontSize = 6, maxLines = 1,
    lineHeight = fontSize * 0.42, align = "left"
  } = options;

  const content = normalizeText(text);
  let nextFontSize = fontSize;
  let lines: string[] = doc.splitTextToSize(content, maxWidth) as string[];

  while (nextFontSize > minFontSize && lines.length > maxLines) {
    nextFontSize = Math.max(minFontSize, nextFontSize - 0.5);
    doc.setFontSize(nextFontSize);
    lines = doc.splitTextToSize(content, maxWidth) as string[];
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsizeText(doc, lines[maxLines - 1], maxWidth);
  }

  doc.setFontSize(nextFontSize);
  lines.forEach((line: string, index: number) => {
    const lineY = y + (index * lineHeight);
    if (align === "right") {
      doc.text(line, x + maxWidth, lineY, { align: "right" });
    } else if (align === "center") {
      doc.text(line, x + (maxWidth / 2), lineY, { align: "center" });
    } else {
      doc.text(line, x, lineY);
    }
  });

  return { fontSize: nextFontSize, lineCount: lines.length };
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function cropBlobToCoverDataUrl(blob: Blob, targetWidthPx: number, targetHeightPx: number): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidthPx;
    canvas.height = targetHeightPx;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to prepare canvas context");

    const targetAspect = targetWidthPx / targetHeightPx;
    const imageAspect = image.width / image.height;

    let sx = 0, sy = 0, sWidth = image.width, sHeight = image.height;

    if (imageAspect > targetAspect) {
      sWidth = image.height * targetAspect;
      sx = (image.width - sWidth) / 2;
    } else if (imageAspect < targetAspect) {
      sHeight = image.width / targetAspect;
      sy = (image.height - sHeight) / 2;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidthPx, targetHeightPx);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, targetWidthPx, targetHeightPx);

    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function downloadImageForPdf(
  shipId: string,
  objectKey: string,
  targetWidthPx: number,
  targetHeightPx: number
): Promise<string | null> {
  try {
    const filename = extractFilename(objectKey);
    const blob = await downloadMedia(shipId, filename);
    return await cropBlobToCoverDataUrl(blob, targetWidthPx, targetHeightPx);
  } catch (error) {
    console.error(`Failed to download image ${objectKey}:`, error);
    return null;
  }
}

function getReportReference(fat: FatItemResponse): string {
  if (fat.formattedSerial?.trim()) return fat.formattedSerial.trim();
  const paddedSerial = String(fat.serialNo).padStart(3, "0");
  if (fat.hullNumber?.trim()) return `FAT-${fat.hullNumber.trim()}-${paddedSerial}`;
  return `FAT-${paddedSerial}`;
}

function sanitizePdfFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getPdfFilename(fat: FatItemResponse, reportReference: string): string {
  const normalizedReference = sanitizePdfFilename(reportReference);
  if (normalizedReference) return `${normalizedReference}.pdf`;
  const hullDisplayName = sanitizePdfFilename(normalizeText(fat.hullNumber, normalizeText(fat.shipName, "SHIP")));
  const serial = String(fat.serialNo).padStart(3, "0");
  return `FAT-${hullDisplayName}-${serial}.pdf`;
}

function getResultColor(result: string | null): [number, number, number] {
  switch (result) {
    case "PASS": return COLORS.pass;
    case "FAIL": return COLORS.fail;
    case "CONDITIONAL": return COLORS.conditional;
    default: return COLORS.muted;
  }
}

function drawDocumentHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  title: string,
  reportReference: string
): void {
  const logoSize = 17;
  doc.addImage(PG_LOGO_B64, "JPEG", margin, 10, logoSize, logoSize);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text("PG Newbuilding", margin + logoSize + 3, 18.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("Technical Intelligence System", margin + logoSize + 3, 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text(title.toUpperCase(), pageWidth - margin, 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`REF: ${reportReference}`, pageWidth - margin, 26, { align: "right" });

  const headerBottom = 32;
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
}

export async function exportFatToPdf(fat: FatItemResponse) {
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const reportReference = getReportReference(fat);
  const pdfFilename = getPdfFilename(fat, reportReference);
  const projectDisplayName = normalizeText(fat.projectName);
  const hullDisplayName = normalizeText(fat.hullNumber, normalizeText(fat.shipName));

  // Resolve owner/shipyard if missing
  let resolvedOwner = fat.projectOwner ?? null;
  let resolvedShipyard = fat.projectShipyard ?? null;
  if ((!resolvedOwner || !resolvedShipyard) && typeof window !== "undefined") {
    try {
      const { fetchProjects } = await import("../api");
      const projects = await fetchProjects();
      const proj = Array.isArray(projects) && fat.projectId
        ? projects.find((p: { id: string; owner: string | null; shipyard: string | null }) => p.id === fat.projectId)
        : null;
      if (proj) {
        resolvedOwner = resolvedOwner || proj.owner;
        resolvedShipyard = resolvedShipyard || proj.shipyard;
      }
    } catch (e) {
      console.error("Failed to fetch projects for owner/shipyard:", e);
    }
  }

  // --- Page 1: Main Report ---

  // 1. Header
  drawDocumentHeader(doc, margin, pageWidth, "FACTORY ACCEPTANCE TEST", reportReference);

  // 2. Info Grid (3x2, same as NCR)
  let y = 38;
  const colCount = 3;
  const colGap = 4;
  const colWidth = (usableWidth - colGap * (colCount - 1)) / colCount;
  const gridHeight = 32;

  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "F");
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.15);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "S");

  const dateStr = new Date(fat.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const gridItems = [
    { label: "Project", value: projectDisplayName },
    { label: "Hull Number", value: hullDisplayName },
    { label: "Owner", value: normalizeText(resolvedOwner) },
    { label: "Shipyard", value: normalizeText(resolvedShipyard) },
    { label: "Issue Date", value: dateStr },
    { label: "Discipline", value: normalizeText(fat.discipline) }
  ];

  gridItems.forEach((item, i) => {
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const itemX = margin + 5 + col * (colWidth + colGap);
    const itemY = y + (row * 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(item.label.toUpperCase(), itemX, itemY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (item.label === "Discipline") {
      doc.setTextColor(...COLORS.accent);
    } else {
      doc.setTextColor(...COLORS.dark);
    }
    doc.text(item.value || "-", itemX, itemY + 5.5);
  });

  // 3. Test Subject (left accent bar, same as NCR Report Subject)
  y = 72;
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1.5);
  const subjLines = wrapText(doc, normalizeText(fat.title), usableWidth - 12);
  const subjHeight = Math.max(14, subjLines.length * 7 + 6);
  doc.line(margin, y - 4, margin, y + subjHeight - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("TEST SUBJECT", margin + 6, y - 1);

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.dark);
  doc.text(subjLines, margin + 6, y + 5);

  y += subjHeight + 10;

  // 4. Test Description section
  const drawSection = (title: string, content: string, height: number) => {
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1);
    doc.line(margin, y - 4, margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text(title.toUpperCase(), margin + 4, y - 1);

    y += 2;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, y, usableWidth, height, 1, 1, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);

    const wrapped = wrapText(doc, content, usableWidth - 8);
    doc.text(wrapped, margin + 4, y + 6);

    y += height + 10;
  };

  // Description
  drawSection("Test Description", normalizeText(fat.content), 55);

  // 5. Result section (with colored badge)
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.line(margin, y - 4, margin, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  doc.text("RESULT", margin + 4, y - 1);

  y += 2;
  const resultValue = fat.result || "PENDING";
  const resultClr = getResultColor(fat.result);

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, usableWidth, 20, 1, 1, "S");

  // Result badge
  const badgeX = margin + 4;
  const badgeY = y + 5;
  doc.setFillColor(...resultClr);
  doc.roundedRect(badgeX, badgeY, 45, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.white);
  doc.text(resultValue, badgeX + 22.5, badgeY + 7, { align: "center" });

  // Remark
  const remarkText = normalizeText(fat.remark, "No remark");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  doc.text(`Remark: ${remarkText}`, badgeX + 55, badgeY + 7);

  y += 30;

  // 6. Signature Block (single column - no approval needed)
  const sigHeight = 25;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "F");
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "S");

  const drawSig = (x: number, title: string, name: string, personTitle: string, dateLabel: string, dateValue: string) => {
    const columnWidth = usableWidth - 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(title.toUpperCase(), x + 4, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    drawAdaptiveText(doc, {
      text: name,
      x: x + 4,
      y: y + 11,
      maxWidth: columnWidth,
      fontSize: 10.5,
      minFontSize: 8,
      maxLines: 1,
      lineHeight: 4,
      align: "left"
    });

    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLORS.dark);
    drawAdaptiveText(doc, {
      text: personTitle,
      x: x + 4,
      y: y + 15.5,
      maxWidth: columnWidth,
      fontSize: 8,
      minFontSize: 6.5,
      maxLines: 1,
      lineHeight: 3.4,
      align: "left"
    });

    doc.setDrawColor(...COLORS.border);
    doc.line(x + 4, y + 20, x + usableWidth - 4, y + 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${dateLabel}: ${dateValue}`, x + 4, y + 23.5);
  };

  const inspectorTitle = normalizeText(fat.authorTitle, "Inspector");
  const preparedDate = fat.createdAt ? new Date(fat.createdAt).toLocaleDateString() : "-";

  drawSig(
    margin,
    "Prepared By",
    normalizeText(fat.authorName, fat.authorId),
    inspectorTitle,
    "Date",
    preparedDate
  );

  // Footer (Page 1)
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("PG NEWBUILDING • FAT FORM • OFFICIAL DOCUMENT", margin, pageHeight - 10);
  doc.text("Page 1", pageWidth - margin, pageHeight - 10, { align: "right" });

  // --- Attachment Pages ---
  if (fat.imageAttachments && fat.imageAttachments.length > 0) {
    const imageWidthMm = usableWidth / 2 - 4;
    const imageHeightMm = 73;
    const attachmentTargetHeightPx = Math.round(ATTACHMENT_TARGET_WIDTH_PX * (imageHeightMm / imageWidthMm));

    const imageDataList: Array<{ dataUrl: string; index: number }> = [];
    for (let i = 0; i < fat.imageAttachments.length; i++) {
      const dataUrl = await downloadImageForPdf(
        fat.shipId,
        fat.imageAttachments[i],
        ATTACHMENT_TARGET_WIDTH_PX,
        attachmentTargetHeightPx
      );
      if (dataUrl) {
        imageDataList.push({ dataUrl, index: i });
      }
    }

    if (imageDataList.length > 0) {
      const imagesPerPage = 4;
      const totalPages = Math.ceil(imageDataList.length / imagesPerPage);

      for (let p = 0; p < totalPages; p++) {
        doc.addPage();
        drawDocumentHeader(doc, margin, pageWidth, "PHOTO ATTACHMENTS", reportReference);

        const pageImages = imageDataList.slice(p * imagesPerPage, (p + 1) * imagesPerPage);

        const imgY = 45;
        pageImages.forEach((imgData, i) => {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const imgX = margin + col * (usableWidth / 2 + 5);
          const currentY = imgY + row * 95;

          doc.setDrawColor(...COLORS.border);
          doc.roundedRect(imgX, currentY, usableWidth / 2 - 2, 75, 2, 2, "S");

          try {
            doc.addImage(imgData.dataUrl, "JPEG", imgX + 1, currentY + 1, imageWidthMm, imageHeightMm);
          } catch (e) {
            console.error("Failed to add image to PDF:", e);
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.muted);
            doc.text("Image Load Error", imgX + 10, currentY + 30);
          }

          doc.setFontSize(8);
          doc.setTextColor(...COLORS.dark);
          doc.text(`Photo ${imgData.index + 1}`, imgX, currentY + 82);
        });

        // Footer
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text(`PG NEWBUILDING • ATTACHMENT • ${hullDisplayName}`, margin, pageHeight - 10);
        doc.text(`Page ${p + 2}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }
    }
  }

  doc.save(pdfFilename);
}
