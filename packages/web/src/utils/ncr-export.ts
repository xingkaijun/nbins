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

function sanitizePdfFilename(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPdfFilename(ncr: NcrItemResponse, reportReference: string): string {
  const normalizedReference = sanitizePdfFilename(reportReference);
  if (normalizedReference) {
    return `${normalizedReference}.pdf`;
  }

  const hullDisplayName = sanitizePdfFilename(normalizeText(ncr.hullNumber, normalizeText(ncr.shipName, "SHIP")));
  const serial = String(ncr.serialNo).padStart(3, "0");
  return `NCR-${hullDisplayName}-${serial}.pdf`;
}

function getPdfStatusLabel(ncr: NcrItemResponse): string {
  if (ncr.closedAt) {
    return "Closed";
  }

  if (ncr.status === "rejected") {
    return "Rejected";
  }

  return "Pending";
}

function drawDocumentHeader(

  doc: jsPDF,
  margin: number,
  pageWidth: number,
  title: string,
  reportReference: string
): void {
  // Left: Logo
  const logoSize = 13;
  doc.addImage(PG_LOGO_B64, "JPEG", margin, 12, logoSize, logoSize);

  // Left: Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text("PG Newbuilding", margin + logoSize + 3, 18.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("Technical Intelligence System", margin + logoSize + 3, 24);

  // Right: Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.dark);
  doc.text(title.toUpperCase(), pageWidth - margin, 18, { align: "right" });

  // Right: REF
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`REF: ${reportReference}`, pageWidth - margin, 26, { align: "right" });

  // Separator line
  const headerBottom = 32;
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
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
  const pdfFilename = getPdfFilename(ncr, reportReference);
  const projectDisplayName = normalizeText(ncr.projectName);
  const hullDisplayName = normalizeText(ncr.hullNumber, normalizeText(ncr.shipName));

  // Fetch owner/shipyard from projects API if missing in NCR response
  let resolvedOwner = ncr.projectOwner ?? null;
  let resolvedShipyard = ncr.projectShipyard ?? null;
  console.log("[NCR-EXPORT] ncr.projectId:", ncr.projectId, "projectOwner:", ncr.projectOwner, "projectShipyard:", ncr.projectShipyard);
  if ((!resolvedOwner || !resolvedShipyard) && typeof window !== "undefined") {
    try {
      const { fetchProjects } = await import("../api");
      const projects = await fetchProjects();
      console.log("[NCR-EXPORT] projects from api.ts:", projects);
      const proj = Array.isArray(projects) && ncr.projectId
        ? projects.find((p: { id: string; owner: string | null; shipyard: string | null }) => p.id === ncr.projectId)
        : null;
      console.log("[NCR-EXPORT] matched project:", proj);
      if (proj) {
        resolvedOwner = resolvedOwner || proj.owner;
        resolvedShipyard = resolvedShipyard || proj.shipyard;
      }
    } catch (e) {
      console.error("Failed to fetch projects for owner/shipyard:", e);
    }
  }


  // --- 第一页: 主报告 ---

  // 1. Header (Logo & Title)
  drawDocumentHeader(doc, margin, pageWidth, "NON CONFORMITY REPORT", reportReference);

  // 2. Metadata Cards
  let y = 38;

  // Info grid: 3 columns x 2 rows with card background
  const colCount = 3;
  const colGap = 4;
  const colWidth = (usableWidth - colGap * (colCount - 1)) / colCount;
  const gridHeight = 32;

  // Draw background
  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "F");
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.15);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "S");

  const dateStr = new Date(ncr.createdAt).toLocaleDateString("en-GB", {
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
    { label: "Discipline", value: normalizeText(ncr.discipline) }
  ];

  gridItems.forEach((item, i) => {
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const itemX = margin + col * (colWidth + colGap);
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



  // 3. Section Drawing Function (used by Description & Rectify below)
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

  // 4. Report Subject (left accent bar style)
  y = 72;
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1.5);
  const subjLines = wrapText(doc, normalizeText(ncr.title), usableWidth - 12);
  const subjHeight = Math.max(14, subjLines.length * 7 + 6);
  doc.line(margin, y - 4, margin, y + subjHeight - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("REPORT SUBJECT", margin + 6, y - 1);

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.dark);
  doc.text(subjLines, margin + 6, y + 5);

  y += subjHeight + 10;

  // DESCRIPTION & RECTIFY (keep original drawSection)

  // DESCRIPTION
  drawSection("Description of Non-Conformity", normalizeText(ncr.content), 55);

  // RECTIFY
  drawSection("Requested Rectify", normalizeText(ncr.rectifyRequest), 35);

  // 4. Signature Block
  const sigHeight = 30;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "F");
  doc.roundedRect(margin, y, usableWidth, sigHeight, 3, 3, "S");
  doc.line(margin + usableWidth / 2, y, margin + usableWidth / 2, y + sigHeight);

  const drawSig = (x: number, title: string, name: string, personTitle: string, detail: string) => {
    const columnWidth = usableWidth / 2 - 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(title.toUpperCase(), x + 4, y + 5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.dark);
    drawAdaptiveText(doc, {
      text: name,
      x: x + 4,
      y: y + 11.5,
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
      y: y + 16,
      maxWidth: columnWidth,
      fontSize: 8,
      minFontSize: 6.5,
      maxLines: 1,
      lineHeight: 3.4,
      align: "left"
    });

    doc.setDrawColor(...COLORS.border);
    doc.line(x + 4, y + 22, x + usableWidth / 2 - 4, y + 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.muted);
    doc.text(detail.toUpperCase(), x + 4, y + 26);
  };

  const inspectorTitle = normalizeText(ncr.authorTitle, "Inspector");
  const approvedName = normalizeText(ncr.approvedByName, normalizeText(ncr.approvedBy, "Manager"));
  const managerTitle = normalizeText(ncr.approvedByTitle, "Manager");
  const approvedDate = ncr.approvedAt ? new Date(ncr.approvedAt).toLocaleDateString() : "DATE TBD";

  drawSig(
    margin,
    "Prepared By (Inspector)",
    normalizeText(ncr.authorName, ncr.authorId),
    inspectorTitle,
    "Handwritten Signature"
  );
  drawSig(
    margin + usableWidth / 2,
    "Approved By (Manager)",
    approvedName,
    managerTitle,
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
  doc.save(pdfFilename);
}

