import { jsPDF } from "jspdf";
import { PG_LOGO_B64 } from "./pg-logo-b64";
import type { FatItemResponse, FatComment } from "@nbins/shared";
import { downloadMedia } from "../api";

/**
 * FAT 高清矢量导出工具
 * 参考 NCR 报告样式，无审批区域
 * 支持结构化 Comments（open/closed 状态）
 */

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
  conditional: [217, 119, 6] as [number, number, number],
  openBg: [255, 251, 235] as [number, number, number],
  closedBg: [240, 253, 244] as [number, number, number]
};

const ATTACHMENT_TARGET_WIDTH_PX = 1400;
const FOOTER_RESERVE = 15;
const LINE_HEIGHT = 5;
const COMMENT_ITEM_HEIGHT = 10; // height per comment item in PDF

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
    case "CONDITIONAL":
    case "COMMENTS": return COLORS.conditional;
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
  const pageWidth = (doc.internal as any).pageSize.getWidth();
  const pageHeight = (doc.internal as any).pageSize.getHeight();
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

  // ---- PHASE 1: Calculate layout and total page count ----
  const tempDoc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  const RESULT_BLOCK_HEIGHT = 30;

  const descContent = normalizeText(fat.content);
  const descLines = wrapText(tempDoc, descContent, usableWidth - 8);
  const descHeight = Math.max(40, descLines.length * LINE_HEIGHT + 10);

  const comments = fat.comments || [];
  const openCount = comments.filter((c) => c.status === "open").length;

  // Calculate comments section height: each comment is a row with number + text + status
  const commentItemHeight = 8; // per comment row
  const commentsListHeight = comments.length > 0
    ? 4 + comments.length * commentItemHeight + 6 // padding + items + bottom
    : 16; // "No comments" text

  const headerHeight = 32;
  const eqHeight = Math.max(14, wrapText(tempDoc, normalizeText(fat.title), (usableWidth - 8) / 2 - 12).length * 7 + 6);
  const eqRowEndY = 72 + Math.max(eqHeight, 14) + 10;
  const commentsStartY = eqRowEndY + 6 + descHeight + 10; // desc title + desc + gap
  const commentsTitleHeight = 6;
  const page1UsableBottom = pageHeight - FOOTER_RESERVE;

  let reportPageCount = 1;
  const commentsAndResultNeed = commentsTitleHeight + commentsListHeight + 10 + RESULT_BLOCK_HEIGHT;
  let commentsOverflowPages = 0;

  if (commentsStartY + commentsTitleHeight + commentsAndResultNeed > page1UsableBottom) {
    const availableForComments = page1UsableBottom - commentsStartY - commentsTitleHeight - 8;
    const itemsThatFit = Math.max(0, Math.floor(availableForComments / commentItemHeight));
    let remaining = comments.length - itemsThatFit;
    const overflowUsableHeight = pageHeight - headerHeight - FOOTER_RESERVE - RESULT_BLOCK_HEIGHT - 10 - 14; // 14 for title + padding
    const itemsPerOverflowPage = Math.floor(overflowUsableHeight / commentItemHeight);

    while (remaining > 0) {
      commentsOverflowPages++;
      remaining -= itemsPerOverflowPage;
    }
    reportPageCount = 1 + commentsOverflowPages;
  }

  const hasImages = fat.imageAttachments && fat.imageAttachments.length > 0;
  const attachmentPageCount = hasImages ? Math.ceil(fat.imageAttachments!.length / 6) : 0;
  const totalPageCount = reportPageCount + attachmentPageCount;

  // ---- PHASE 2: Draw the PDF ----
  const drawFooter = (pageNum: number) => {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text("PG NEWBUILDING • FAT FORM • OFFICIAL DOCUMENT", margin, pageHeight - 10);
    doc.text(`Page ${pageNum} of ${totalPageCount}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  };

  let currentPageNum = 1;
  let y: number;

  // --- Page 1 ---
  drawDocumentHeader(doc, margin, pageWidth, "FACTORY ACCEPTANCE TEST", reportReference);

  // Info Grid
  y = 38;
  const colCount = 3;
  const colGap = 4;
  const colWidth = (usableWidth - colGap * (colCount - 1)) / colCount;
  const gridHeight = 32;

  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "F");
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.15);
  doc.roundedRect(margin, y - 4, usableWidth, gridHeight - 4, 2, 2, "S");

  const inspectionDateStr = fat.inspectionDate
    ? new Date(fat.inspectionDate).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric"
      })
    : "-";

  const gridItems = [
    { label: "Project", value: projectDisplayName },
    { label: "Hull Number", value: hullDisplayName },
    { label: "Owner", value: normalizeText(resolvedOwner) },
    { label: "Shipyard", value: normalizeText(resolvedShipyard) },
    { label: "Inspection Date", value: inspectionDateStr },
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

  // Equipment + Maker on same row
  y = 72;
  const halfWidth = (usableWidth - 8) / 2;

  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1.5);
  const eqLines = wrapText(doc, normalizeText(fat.title), halfWidth - 12);
  const eqH = Math.max(14, eqLines.length * 7 + 6);
  doc.line(margin, y - 4, margin, y + eqH - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text("EQUIPMENT", margin + 6, y - 1);

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.dark);
  doc.text(eqLines, margin + 6, y + 5);

  if (fat.maker) {
    const makerX = margin + halfWidth + 8;
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1.5);
    const makerLines = wrapText(doc, normalizeText(fat.maker), halfWidth - 12);
    const makerH = Math.max(14, makerLines.length * 7 + 6);
    doc.line(makerX, y - 4, makerX, y + makerH - 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("MAKER", makerX + 6, y - 1);

    doc.setFontSize(13);
    doc.setTextColor(...COLORS.dark);
    doc.text(makerLines, makerX + 6, y + 5);
  }

  y += Math.max(eqH, 14) + 10;

  // Test Description
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.line(margin, y - 4, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  doc.text("TEST DESCRIPTION", margin + 4, y - 1);

  y += 2;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, usableWidth, descHeight, 1, 1, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text(descLines, margin + 4, y + 6);

  y += descHeight + 10;

  // ---- Comments section (structured list) ----
  const drawCommentsTitle = (title: string) => {
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1);
    doc.line(margin, y - 4, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text(title, margin + 4, y - 1);
    y += 2;
  };

  const drawCommentItem = (comment: FatComment, index: number) => {
    const isOpen = comment.status === "open";
    const itemBg = isOpen ? COLORS.openBg : COLORS.closedBg;

    // Background row
    doc.setFillColor(...itemBg);
    doc.roundedRect(margin, y, usableWidth, commentItemHeight - 1, 1, 1, "F");

    // Number circle
    doc.setFillColor(...(isOpen ? COLORS.conditional : COLORS.pass));
    doc.circle(margin + 6, y + 4, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.white);
    doc.text(String(index + 1), margin + 6, y + 5, { align: "center" });

    // Comment text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    const commentText = ellipsizeText(doc, comment.content, usableWidth - 50);
    doc.text(commentText, margin + 12, y + 5);

    // Status badge
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const statusText = isOpen ? "OPEN" : "CLOSED";
    const statusColor = isOpen ? COLORS.conditional : COLORS.pass;
    doc.setTextColor(...statusColor);
    doc.text(statusText, margin + usableWidth - 4, y + 5, { align: "right" });

    y += commentItemHeight;
  };

  // Result + Prepared By block (drawn after comments, at page bottom)
  const inspectorTitle = normalizeText(fat.authorTitle, "Inspector");
  const preparedDate = fat.createdAt ? new Date(fat.createdAt).toLocaleDateString() : "-";
  const resultValue = fat.result || "PENDING";
  const resultClr = getResultColor(fat.result);

  const drawResultAndPreparedBy = () => {
    // Always draw at the bottom of the page, just above the footer
    y = pageHeight - FOOTER_RESERVE - RESULT_BLOCK_HEIGHT;

    // Result label
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1);
    doc.line(margin, y - 4, margin, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text("RESULT", margin + 4, y - 1);

    y += 2;

    // Result badge (left)
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, y, usableWidth, 20, 1, 1, "S");

    const badgeX = margin + 4;
    const badgeY = y + 5;
    doc.setFillColor(...resultClr);
    doc.roundedRect(badgeX, badgeY, 45, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.white);
    doc.text(resultValue, badgeX + 22.5, badgeY + 7, { align: "center" });

    // Prepared By card (right)
    const sigCardX = margin + usableWidth / 2;
    const sigCardWidth = usableWidth / 2;
    const sigCardHeight = 18;
    doc.setFillColor(...COLORS.bg);
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(sigCardX, y + 1, sigCardWidth - 2, sigCardHeight, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text("PREPARED BY", sigCardX + 6, y + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    drawAdaptiveText(doc, {
      text: normalizeText(fat.authorName, fat.authorId),
      x: sigCardX + 6, y: y + 10, maxWidth: sigCardWidth - 24,
      fontSize: 10, minFontSize: 8, maxLines: 1, lineHeight: 4, align: "left"
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${inspectorTitle} • ${preparedDate}`, sigCardX + 6, y + 15);
  };

  // Check if all fits on page 1
  const needForCommentsAndResult = 8 + commentsListHeight + 10 + RESULT_BLOCK_HEIGHT;
  const spaceAvailable = page1UsableBottom - y;

  if (needForCommentsAndResult <= spaceAvailable && comments.length <= 20) {
    // Everything fits on page 1
    drawCommentsTitle(`COMMENTS (${openCount} open / ${comments.length} total)`);
    if (comments.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.muted);
      doc.text("No comments.", margin + 4, y + 5);
      y += 16;
    } else {
      comments.forEach((c, i) => drawCommentItem(c, i));
      y += 10;
    }
    drawResultAndPreparedBy();
    drawFooter(currentPageNum);
  } else {
    // Comments overflow - paginate
    drawCommentsTitle(`COMMENTS (${openCount} open / ${comments.length} total)`);

    // How many items fit on this page (reserve space for result block on last page)
    const availableY = page1UsableBottom - y - RESULT_BLOCK_HEIGHT;
    const itemsThisPage = Math.max(0, Math.floor(availableY / commentItemHeight));
    const firstBatch = comments.slice(0, itemsThisPage);
    firstBatch.forEach((c, i) => drawCommentItem(c, i));

    // Draw result block at page bottom after first batch if all comments fit
    if (itemsThisPage >= comments.length) {
      drawResultAndPreparedBy();
    }
    drawFooter(currentPageNum);

    // Remaining items
    let remaining = comments.slice(itemsThisPage);
    const itemsPerOverflowPage = Math.floor((pageHeight - headerHeight - FOOTER_RESERVE - RESULT_BLOCK_HEIGHT - 20) / commentItemHeight);

    while (remaining.length > 0) {
      doc.addPage();
      currentPageNum++;
      drawDocumentHeader(doc, margin, pageWidth, "FACTORY ACCEPTANCE TEST", reportReference);
      y = 38;

      const batch = remaining.slice(0, itemsPerOverflowPage);
      drawCommentsTitle("COMMENTS (CONTINUED)");
      batch.forEach((c, i) => drawCommentItem(c, itemsThisPage + (remaining.length - remaining.length) + i));
      y += 4;

      remaining = remaining.slice(batch.length);

      // If this is the last batch, draw result block at page bottom
      if (remaining.length === 0) {
        drawResultAndPreparedBy();
      }
      drawFooter(currentPageNum);
    }
  }

  // --- Attachment Pages ---
  if (hasImages) {
    const imageWidthMm = usableWidth / 2 - 4;
    const imageHeightMm = 60;
    const attachmentTargetHeightPx = Math.round(ATTACHMENT_TARGET_WIDTH_PX * (imageHeightMm / imageWidthMm));

    const imageDataList: Array<{ dataUrl: string; index: number }> = [];
    for (let i = 0; i < fat.imageAttachments!.length; i++) {
      const dataUrl = await downloadImageForPdf(
        fat.shipId, fat.imageAttachments![i],
        ATTACHMENT_TARGET_WIDTH_PX, attachmentTargetHeightPx
      );
      if (dataUrl) {
        imageDataList.push({ dataUrl, index: i });
      }
    }

    if (imageDataList.length > 0) {
      const imagesPerPage = 6;

      for (let p = 0; p < Math.ceil(imageDataList.length / imagesPerPage); p++) {
        doc.addPage();
        currentPageNum++;
        drawDocumentHeader(doc, margin, pageWidth, "PHOTO ATTACHMENTS", reportReference);

        const pageImages = imageDataList.slice(p * imagesPerPage, (p + 1) * imagesPerPage);

        const imgY = 45;
        pageImages.forEach((imgData, i) => {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const imgX = margin + col * (usableWidth / 2 + 5);
          const currentY = imgY + row * 80;

          doc.setDrawColor(...COLORS.border);
          doc.roundedRect(imgX, currentY, usableWidth / 2 - 2, 62, 2, 2, "S");

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
          doc.text(`Photo ${imgData.index + 1}`, imgX, currentY + 68);
        });

        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text(`PG SHIPMANAGEMENT • ATTACHMENT • ${hullDisplayName}`, margin, pageHeight - 10);
        doc.text(`Page ${currentPageNum} of ${totalPageCount}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }
    }
  }

  doc.save(pdfFilename);
}
