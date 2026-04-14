import { jsPDF } from "jspdf";
import { PG_LOGO_B64 } from "./pg-logo-b64";
import type { NcrItemResponse } from "@nbins/shared";
import { downloadMedia } from "../api";

/**
 * NCR 高清矢量导出工具
 * 放弃 html2canvas 截图模式，改用全矢量绘制，确保文字绝对清晰。
 */

// PDF 颜色配置
const COLORS = {
  primary: [15, 118, 110] as [number, number, number], // #0f766e
  dark: [15, 23, 42] as [number, number, number], // #0f172a
  muted: [148, 163, 184] as [number, number, number], // #94a3b8
  border: [226, 232, 240] as [number, number, number], // #e2e8f0
  bg: [248, 250, 252] as [number, number, number], // #f8fafc
  white: [255, 255, 255] as [number, number, number],
  accent: [13, 148, 136] as [number, number, number] // #0d9488
};

const ATTACHMENT_TARGET_WIDTH_PX = 1400;

/**
 * 文本自动换行处理
 */
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text || "-", maxWidth);
}

function normalizeText(value: string | null | undefined, fallback = "-"): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

/**
 * 从对象键中提取文件名
 */
function extractFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
}

function ellipsizeText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) {
    return text;
  }

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
    text,
    x,
    y,
    maxWidth,
    fontSize,
    minFontSize = 6,
    maxLines = 1,
    lineHeight = fontSize * 0.42,
    align = "left"
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
    if (!context) {
      throw new Error("Failed to prepare canvas context");
    }

    const targetAspect = targetWidthPx / targetHeightPx;
    const imageAspect = image.width / image.height;

    let sx = 0;
    let sy = 0;
    let sWidth = image.width;
    let sHeight = image.height;

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

/**
 * 下载图片并转换为 cover 裁切后的 dataURL
 */
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

function getReportReference(ncr: NcrItemResponse): string {
  if (ncr.formattedSerial?.trim()) {
    return ncr.formattedSerial.trim();
  }

  const paddedSerial = String(ncr.serialNo).padStart(3, "0");
  if (ncr.hullNumber?.trim()) {
    return `NCR-${ncr.hullNumber.trim()}-${paddedSerial}`;
  }

  return `NCR-${paddedSerial}`;
}

function drawDocumentHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  title: string,
  reportReference: string
): void {
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.8);
  doc.line(margin, 35, pageWidth - margin, 35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.accent);
  doc.text("PG SHIPMANAGEMENT", margin, 20);

  doc.setFontSize(18);
  doc.setTextColor(...COLORS.dark);
  doc.text(title, margin, 28);

  const logoWidth = 8.25 * 1.2 * 1.2;
  const logoHeight = 8.25 * 1.2 * 1.2;
  doc.addImage(PG_LOGO_B64, "JPEG", pageWidth - margin - logoWidth, 20, logoWidth, logoHeight);

  const referenceRight = pageWidth - margin - logoWidth - 4;
  const referenceLeft = Math.max(margin + 96, referenceRight - 66);
  const referenceWidth = Math.max(36, referenceRight - referenceLeft);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("REPORT REFERENCE", referenceRight, 20, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(185, 28, 28);
  drawAdaptiveText(doc, {
    text: reportReference,
    x: referenceLeft,
    y: 27.5,
    maxWidth: referenceWidth,
    fontSize: 11,
    minFontSize: 8,
    maxLines: 2,
    lineHeight: 4,
    align: "right"
  });
}

export async function exportNcrToPdf(ncr: NcrItemResponse) {
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4"
  });

  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const reportReference = getReportReference(ncr);
  const projectDisplayName = normalizeText(ncr.projectName, normalizeText(ncr.projectId));
  const hullDisplayName = normalizeText(ncr.hullNumber, normalizeText(ncr.shipName));

  // --- 第一页: 主报告 ---

  // 1. Header (Logo & Title)
  drawDocumentHeader(doc, margin, pageWidth, "NON CONFORMITY REPORT", reportReference);

  // 2. Metadata Cards (布局)
  let y = 42;

  const drawCard = (x: number, title: string, data: { label: string; value: string }[]) => {
    const cardWidth = usableWidth / 2 - 4;
    const cardHeight = 24;
    const innerGap = 4;
    const itemWidth = (cardWidth - 8 - innerGap) / 2;

    doc.setFillColor(...COLORS.bg);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "F");
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.1);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.accent);
    doc.text(title, x + 4, y + 5);

    data.forEach((item, i) => {
      const itemX = x + 4 + (i * (itemWidth + innerGap));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.muted);
      doc.text(item.label, itemX, y + 10);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.dark);
      drawAdaptiveText(doc, {
        text: item.value,
        x: itemX,
        y: y + 14,
        maxWidth: itemWidth,
        fontSize: 9,
        minFontSize: 6.5,
        maxLines: 2,
        lineHeight: 3.6,
        align: "left"
      });
    });

    return cardHeight;
  };

  const dateStr = new Date(ncr.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const metadataCardHeight = drawCard(margin, "VESSEL & PROJECT", [
    { label: "PROJECT NAME", value: projectDisplayName },
    { label: "HULL NUMBER", value: hullDisplayName }
  ]);
  drawCard(margin + usableWidth / 2 + 4, "REPORT METADATA", [
    { label: "ISSUE DATE", value: dateStr },
    { label: "STATUS", value: normalizeText(ncr.status).toUpperCase() }
  ]);

  y += metadataCardHeight + 10;

  // 3. Section Drawing Function
  const drawSection = (title: string, content: string, height: number, fontSize = 11, isBold = false) => {
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

    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...COLORS.dark);

    const wrapped = wrapText(doc, content, usableWidth - 8);
    doc.text(wrapped, margin + 4, y + 6);

    y += height + 10;
  };

  // SUBJECT
  drawSection("Report Subject", normalizeText(ncr.title), 14, 14, true);

  // TO & DISCIPLINE (Split)
  const recipient = normalizeText(ncr.remark?.match(/To: (.*?) \|/)?.[1]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  doc.text("TO (RECIPIENT)", margin + 4, y - 1);
  doc.text("DISCIPLINE", margin + usableWidth * 0.6 + 4, y - 1);

  doc.roundedRect(margin, y, usableWidth * 0.6 - 5, 12, 1, 1, "S");
  doc.roundedRect(margin + usableWidth * 0.6, y, usableWidth * 0.4, 12, 1, 1, "S");

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.dark);
  drawAdaptiveText(doc, {
    text: recipient,
    x: margin + 4,
    y: y + 7,
    maxWidth: usableWidth * 0.6 - 13,
    fontSize: 11,
    minFontSize: 8,
    maxLines: 1,
    align: "left"
  });
  drawAdaptiveText(doc, {
    text: normalizeText(ncr.discipline),
    x: margin + usableWidth * 0.6 + 4,
    y: y + 7,
    maxWidth: usableWidth * 0.4 - 8,
    fontSize: 11,
    minFontSize: 8,
    maxLines: 1,
    align: "left"
  });

  y += 22;

  // DESCRIPTION
  drawSection("Description of Non-Conformity", normalizeText(ncr.content), 55);

  // RECTIFY
  drawSection("Requested Rectify", normalizeText(ncr.rectifyRequest), 35);

  // 4. Signature Block
  const sigHeight = 25;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "F");
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "S");
  doc.line(margin + usableWidth / 2, y, margin + usableWidth / 2, y + sigHeight);

  const drawSig = (x: number, title: string, name: string, detail: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(title.toUpperCase(), x + 4, y + 5);

    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    doc.text(name, x + 4, y + 12);

    doc.setDrawColor(...COLORS.border);
    doc.line(x + 4, y + 18, x + usableWidth / 2 - 4, y + 18);

    doc.setFontSize(6);
    doc.setTextColor(...COLORS.muted);
    doc.text(detail.toUpperCase(), x + 4, y + 22);
  };

  const approvedName = ncr.approvedByName || (ncr.status === "approved" ? "VERIFIED" : "PENDING REVIEW");
  const approvedDate = ncr.approvedAt ? new Date(ncr.approvedAt).toLocaleDateString() : "DATE TBD";

  drawSig(
    margin,
    "Prepared By (Inspector)",
    normalizeText(ncr.authorName, ncr.authorId),
    "Handwritten Signature & Title"
  );
  drawSig(
    margin + usableWidth / 2,
    "Approved By (Manager)",
    approvedName,
    `Authorized Signature & Date (${approvedDate})`
  );

  // Footer (Page 1)
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("PG SHIPMANAGEMENT • NCR FORM • OFFICIAL DOCUMENT", margin, pageHeight - 10);
  doc.text("Page 1", pageWidth - margin, pageHeight - 10, { align: "right" });

  // --- 后续页: 附件照片 ---
  if (ncr.imageAttachments && ncr.imageAttachments.length > 0) {
    const imageWidthMm = usableWidth / 2 - 4;
    const imageHeightMm = 73;
    const attachmentTargetHeightPx = Math.round(ATTACHMENT_TARGET_WIDTH_PX * (imageHeightMm / imageWidthMm));

    // 先下载所有图片并裁切为 cover 形式
    const imageDataList: Array<{ dataUrl: string; index: number }> = [];
    for (let i = 0; i < ncr.imageAttachments.length; i++) {
      const dataUrl = await downloadImageForPdf(
        ncr.shipId,
        ncr.imageAttachments[i],
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

          // 绘制图片容器
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
        doc.text(`PG SHIPMANAGEMENT • ATTACHMENT • ${hullDisplayName}`, margin, pageHeight - 10);
        doc.text(`Page ${p + 2}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }
    }
  }

  // 保存
  doc.save(`NCR-${ncr.formattedSerial || ncr.id}.pdf`);
}
