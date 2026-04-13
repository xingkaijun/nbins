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
  dark: [15, 23, 42] as [number, number, number],    // #0f172a
  muted: [148, 163, 184] as [number, number, number], // #94a3b8
  border: [226, 232, 240] as [number, number, number], // #e2e8f0
  bg: [248, 250, 252] as [number, number, number],    // #f8fafc
  white: [255, 255, 255] as [number, number, number],
  accent: [13, 148, 136] as [number, number, number],  // #0d9488
};

/**
 * 文本自动换行处理
 */
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text || "-", maxWidth);
}

/**
 * 从对象键中提取文件名
 */
function extractFilename(objectKey: string): string {
  const segments = objectKey.split("/");
  return segments[segments.length - 1] ?? objectKey;
}

/**
 * 将Blob转换为base64字符串
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 下载图片并转换为base64
 */
async function downloadImageAsBase64(shipId: string, objectKey: string): Promise<string | null> {
  try {
    const filename = extractFilename(objectKey);
    console.log(`Downloading image: ${filename} for ship ${shipId}`);
    const blob = await downloadMedia(shipId, filename);
    console.log(`Downloaded blob size: ${blob.size}, type: ${blob.type}`);
    const base64 = await blobToBase64(blob);
    console.log(`Converted to base64, length: ${base64.length}`);
    return base64;
  } catch (error) {
    console.error(`Failed to download image ${objectKey}:`, error);
    return null;
  }
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

  // --- 第一页: 主报告 ---
  
  // 1. Header (Logo & Title)
  doc.setDrawColor(...COLORS.dark);
  doc.setLineWidth(0.8);
  doc.line(margin, 35, pageWidth - margin, 35); // 分割线

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.accent);
  doc.text("PG SHIPMANAGEMENT", margin, 20);
  
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.dark);
  doc.text("NON CONFORMITY REPORT", margin, 30);

  // Logo
  doc.addImage(PG_LOGO_B64, "JPEG", pageWidth - margin - 40, 10, 40, 15);

  // Reference
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("REPORT REFERENCE", pageWidth - margin, 22, { align: "right" });
  doc.setFontSize(12);
  doc.setTextColor(185, 28, 28); // #b91c1c (Red)
  doc.text(ncr.formattedSerial || String(ncr.serialNo), pageWidth - margin, 28, { align: "right" });

  // 2. Metadata Cards (布局)
  let y = 42;
  
  const drawCard = (x: number, title: string, data: { label: string; value: string }[]) => {
    const cardWidth = usableWidth / 2 - 4;
    doc.setFillColor(...COLORS.bg);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, "F");
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.1);
    doc.roundedRect(x, y, cardWidth, 18, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.accent);
    doc.text(title, x + 4, y + 5);

    data.forEach((item, i) => {
      const itemX = x + 4 + (i * (cardWidth / 2 - 2));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.muted);
      doc.text(item.label, itemX, y + 10);
      
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);
      doc.text(item.value || "-", itemX, y + 14);
    });
  };

  const dateStr = new Date(ncr.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  drawCard(margin, "VESSEL & PROJECT", [
    { label: "PROJECT NAME", value: ncr.projectName || "-" },
    { label: "HULL NUMBER", value: ncr.hullNumber || "-" }
  ]);
  drawCard(margin + usableWidth / 2 + 4, "REPORT METADATA", [
    { label: "ISSUE DATE", value: dateStr },
    { label: "STATUS", value: ncr.status.toUpperCase() }
  ]);

  y += 28;

  // 3. Section Drawing Function
  const drawSection = (title: string, content: string, height: number, fontSize = 11, isBold = false) => {
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1);
    doc.line(margin, y - 4, margin, y); // Accent line
    
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
  drawSection("Report Subject", ncr.title, 14, 14, true);

  // TO & DISCIPLINE (Split)
  const recipient = ncr.remark?.match(/To: (.*?) \|/)?.[1] || "-";
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TO (RECIPIENT)", margin + 4, y - 1);
  doc.text("DISCIPLINE", margin + usableWidth * 0.6 + 4, y - 1);
  
  doc.roundedRect(margin, y, usableWidth * 0.6 - 5, 12, 1, 1, "S");
  doc.roundedRect(margin + usableWidth * 0.6, y, usableWidth * 0.4, 12, 1, 1, "S");
  
  doc.setFontSize(11);
  doc.text(recipient, margin + 4, y + 7);
  doc.text(ncr.discipline, margin + usableWidth * 0.6 + 4, y + 7);
  
  y += 22;

  // DESCRIPTION
  drawSection("Description of Non-Conformity", ncr.content, 55);

  // RECTIFY
  drawSection("Requested Rectify", ncr.rectifyRequest || "-", 35);

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

  const approvedName = ncr.approvedByName || (ncr.status === 'approved' ? 'VERIFIED' : 'PENDING REVIEW');
  const approvedDate = ncr.approvedAt ? new Date(ncr.approvedAt).toLocaleDateString() : 'DATE TBD';

  drawSig(margin, "Prepared By (Inspector)", ncr.authorName || ncr.authorId, "Handwritten Signature & Title");
  drawSig(margin + usableWidth / 2, "Approved By (Manager)", approvedName, `Authorized Signature & Date (${approvedDate})`);

  // Footer (Page 1)
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  doc.text("PG SHIPMANAGEMENT • NCR FORM • OFFICIAL DOCUMENT", margin, pageHeight - 10);
  doc.text("Page 1", pageWidth - margin, pageHeight - 10, { align: "right" });


  // --- 后续页: 附件照片 ---
  if (ncr.imageAttachments && ncr.imageAttachments.length > 0) {
    console.log(`Processing ${ncr.imageAttachments.length} image attachments for NCR ${ncr.id}`);
    console.log('Image attachments:', ncr.imageAttachments);
    
    // 先下载所有图片并转换为base64
    const imageBase64List: Array<{ base64: string; index: number }> = [];
    for (let i = 0; i < ncr.imageAttachments.length; i++) {
      const base64 = await downloadImageAsBase64(ncr.shipId, ncr.imageAttachments[i]);
      if (base64) {
        imageBase64List.push({ base64, index: i });
      }
    }

    console.log(`Successfully loaded ${imageBase64List.length} images out of ${ncr.imageAttachments.length}`);

    if (imageBase64List.length > 0) {
      const imagesPerPage = 4; // 矢量模式下，放 4 张大图效果更好
      const totalPages = Math.ceil(imageBase64List.length / imagesPerPage);

      for (let p = 0; p < totalPages; p++) {
        doc.addPage();
        
        // Attachment Page Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.accent);
        doc.text("PG SHIPMANAGEMENT", margin, 20);
        doc.setFontSize(22);
        doc.setTextColor(...COLORS.dark);
        doc.text("PHOTO ATTACHMENTS", margin, 30);
        doc.setDrawColor(...COLORS.dark);
        doc.setLineWidth(0.8);
        doc.line(margin, 35, pageWidth - margin, 35);

        const pageImages = imageBase64List.slice(p * imagesPerPage, (p + 1) * imagesPerPage);
        
        let imgY = 45;
        pageImages.forEach((imgData, i) => {
          const row = Math.floor(i / 2);
          const col = i % 2;
          const imgX = margin + col * (usableWidth / 2 + 5);
          const currentY = imgY + row * 95;
          
          // 绘制图片容器
          doc.setDrawColor(...COLORS.border);
          doc.roundedRect(imgX, currentY, usableWidth / 2 - 2, 75, 2, 2, "S");
          
          try {
            console.log(`Adding image ${imgData.index + 1} to PDF at position (${imgX}, ${currentY})`);
            doc.addImage(imgData.base64, "JPEG", imgX + 1, currentY + 1, usableWidth / 2 - 4, 73);
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
        doc.text(`PG SHIPMANAGEMENT • ATTACHMENT • ${ncr.hullNumber || '-'}`, margin, pageHeight - 10);
        doc.text(`Page ${p + 2}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      }
    } else {
      console.warn('No images were successfully loaded');
    }
  } else {
    console.log('No image attachments found');
  }

  // 保存
  doc.save(`NCR-${ncr.formattedSerial || ncr.id}.pdf`);
}
