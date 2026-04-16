import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { InspectionItemDetailResponse, InspectionListItem } from '@nbins/shared';
import { PG_LOGO_B64 } from './pg-logo-b64';
import { buildAsciiRow, padRight } from './export-tools';

// For simplicity, we just use text or a placeholder graphic right now, and refine later.
// We'll create a clean text-based report, using a generic graphic if possible, or leave it textual.

function drawPdfLogo(doc: jsPDF, x: number, y: number, targetHeight: number = 10) {
  const properties = doc.getImageProperties(PG_LOGO_B64);
  const aspectRatio = properties.width / (properties.height || 1);
  const targetWidth = targetHeight * aspectRatio;
  doc.addImage(PG_LOGO_B64, 'JPEG', x, y, targetWidth, targetHeight);
  return { width: targetWidth, height: targetHeight };
}

export async function buildInspectionReportDoc(detail: InspectionItemDetailResponse): Promise<{ doc: jsPDF, fileName: string }> {

  // Create an A4 document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Colors
  const colors = {
    primary: [0, 89, 97] as [number, number, number],
    primaryLight: [230, 243, 245] as [number, number, number],
    secondary: [80, 96, 111] as [number, number, number],
    tertiary: [117, 68, 30] as [number, number, number],
    tertiaryLight: [242, 233, 228] as [number, number, number],
    surfaceLow: [242, 244, 244] as [number, number, number],
    outline: [191, 200, 202] as [number, number, number],
    textMain: [25, 28, 29] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  let y = margin;

  // Generate HASH CODE early for top right (16 characters)
  const lastRound = detail.roundHistory.length > 0 
    ? detail.roundHistory.reduce((prev, current) => (prev.roundNumber > current.roundNumber) ? prev : current, detail.roundHistory[0])
    : null;
    
  const submitterName = lastRound?.inspectorDisplayName || lastRound?.submittedBy || 'SYSTEM';
  let hashCode = 'PENDING-VERIFICA';
  if (lastRound?.submittedAt) {
    const text = `${submitterName}-${lastRound.submittedAt}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // 16 characters: IA-YYYY-XXXXXXXX (3+1+4+1+8=17, so use IA-YY-XXXXXXXXXX = 3+1+2+1+10=17, or just 16 chars)
    hashCode = `IA-${new Date().getFullYear().toString().slice(-2)}-${hashHex.substring(0, 10).toUpperCase()}`;
  }

  // --- HEADER ---
  // Left side: Logo (Enlarged)
  drawPdfLogo(doc, margin, y - 6, 18);
  
  doc.setDrawColor(...colors.outline);
  doc.setLineWidth(0.5);
  doc.line(margin + 48, y - 2, margin + 48, y + 10);
  
  // Right side of pipe for Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...colors.primary);
  doc.text('INSPECTION REPORT', margin + 52, y + 8);

  // Right side: Document Hash only (grayed out, smaller font, 16 chars)
  const topY = margin;
  
  doc.setFontSize(6);
  doc.setTextColor(...colors.secondary);
  doc.text('DOCUMENT HASH', pageWidth - margin, topY + 2, { align: 'right' });
  
  doc.setFontSize(7);
  doc.setFont('courier', 'normal');
  doc.setTextColor(...colors.secondary);
  doc.text(hashCode, pageWidth - margin, topY + 6, { align: 'right' });

  y += 14;
  // Divider (moved up, closer to header)
  doc.setDrawColor(...colors.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;

  // --- INFO CARDS ---
  const cardHeight = 45;
  const leftCardWidth = 90;
  const rightCardWidth = 75;
  
  // Left Card: Vessel Info
  doc.setFillColor(...colors.surfaceLow);
  doc.roundedRect(margin, y, leftCardWidth, cardHeight, 1.5, 1.5, 'F');
  
  let cy = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...colors.primary);
  doc.text('VESSEL INFO', margin + 6, cy); 
  
  cy += 8;
  doc.setFontSize(6);
  doc.setTextColor(...colors.secondary);
  doc.text('PROJECT CODE', margin + 6, cy);
  doc.text('HULL NUMBER', margin + 45, cy);
  
  cy += 4;
  doc.setFontSize(10);
  doc.setTextColor(...colors.textMain);
  doc.text(detail.projectCode || '-', margin + 6, cy);
  // Hull Number (Style matched to project code)
  doc.text(detail.hullNumber || '-', margin + 45, cy);
  
  cy += 10;
  doc.setFontSize(6);
  doc.setTextColor(...colors.secondary);
  doc.text('SHIP OWNER', margin + 6, cy);
  doc.text('SHIPYARD', margin + 45, cy);
  
  cy += 4;
  doc.setFontSize(10);
  doc.setTextColor(...colors.textMain);
  doc.text('Pacific Gas', margin + 6, cy); 
  doc.text('JN Shipyard', margin + 45, cy);

  // Right Card: Inspection Data
  const rx = pageWidth - margin - rightCardWidth;
  doc.setFillColor(...colors.surfaceLow);
  doc.roundedRect(rx, y, rightCardWidth, cardHeight, 1.5, 1.5, 'F');
  
  cy = y + 8;
  doc.setFontSize(9);
  doc.setTextColor(...colors.primary);
  doc.text('INSPECTION DATA', rx + 6, cy);
  
  cy += 8;
  doc.setFontSize(6);
  doc.setTextColor(...colors.secondary);
  doc.text('ITEM', rx + 6, cy);
  
  cy += 4;
  doc.setFontSize(9);
  doc.setTextColor(...colors.textMain);
  const splitItem = doc.splitTextToSize(detail.itemName, rightCardWidth - 12);
  doc.text(splitItem, rx + 6, cy);
  
  // Calculate bottom row labels: QC / ROUND / DATE
  cy = y + cardHeight - 12; 
  
  doc.setFontSize(6);
  doc.setTextColor(...colors.secondary);
  doc.text('QC', rx + 6, cy);
  doc.text('ROUND', rx + 30, cy);
  doc.text('DATE', rx + rightCardWidth - 6, cy, { align: 'right' });
  
  cy += 4;
  doc.setFontSize(8);
  doc.setTextColor(...colors.textMain);
  // QC Value (Yard QC defined at import)
  const qcName = detail.yardQc || '-';
  doc.text(doc.splitTextToSize(qcName, 22), rx + 6, cy);
  
  // Round Value
  doc.text(`R${detail.currentRound}`, rx + 30, cy);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...colors.textMain);
  doc.text(detail.actualDate || detail.plannedDate || '-', rx + rightCardWidth - 6, cy, { align: 'right' });
  
  y += cardHeight + 12;

  // --- COMMENTS / DEFICIENCY ---
  doc.setFontSize(10);
  doc.setTextColor(...colors.primary);
  doc.text('COMMENTS / DEFICIENCY', margin, y);
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...colors.secondary);
  const totalComments = detail.comments.length;
  doc.text(totalComments > 0 ? `Items 01 - ${String(totalComments).padStart(2, '0')} recorded` : 'No items recorded', pageWidth - margin, y, { align: 'right' });
  
  y += 6;

  // Render comments
  if (totalComments > 0) {
    detail.comments.forEach((c, idx) => {
      // Height calculation - need more space for dates
      const contentWidth = pageWidth - margin * 2 - 35;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const splitContent = doc.splitTextToSize(c.message, contentWidth);
      const cardH = Math.max(18, splitContent.length * 4 + 10);
      
      if (y + cardH > pageHeight - 50) {
        doc.addPage();
        y = margin;
      }
      
      const isClosed = c.status === 'closed';
      const indicatorColor = isClosed ? colors.primary : colors.tertiary;
      const indicatorLight = isClosed ? colors.primaryLight : colors.tertiaryLight;
      
      // Card BG
      doc.setFillColor(...colors.white);
      doc.setDrawColor(...colors.outline);
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, y, pageWidth - margin * 2, cardH, 1, 1, 'FD');
      
      // Left border indicator
      doc.setFillColor(...indicatorColor);
      doc.rect(margin, y + 1, 1.5, cardH - 2, 'F');
      
      // Number box
      doc.setFillColor(...colors.surfaceLow);
      doc.roundedRect(margin + 4, y + (cardH - 8) / 2, 8, 8, 0.5, 0.5, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...indicatorColor);
      doc.text(String(idx + 1).padStart(2, '0'), margin + 8, y + (cardH - 8) / 2 + 5.5, { align: 'center' });
      
      // Content
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...colors.textMain);
      const textH = splitContent.length * 4;
      doc.text(splitContent, margin + 16, y + 4);
      
      // Issue Date and Close Date below content
      const dateY = y + 4 + textH + 3;
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...colors.secondary);
      doc.text('ISSUE:', margin + 16, dateY);
      doc.setFont('helvetica', 'normal');
      const issueDate = c.createdAt ? c.createdAt.slice(0, 10) : '-';
      doc.text(issueDate, margin + 26, dateY);
      
      doc.setFont('helvetica', 'bold');
      doc.text('CLOSE:', margin + 50, dateY);
      doc.setFont('helvetica', 'normal');
      const closeDate = c.resolvedAt ? c.resolvedAt.slice(0, 10) : '-';
      doc.text(closeDate, margin + 60, dateY);
      
      // Status Badge right side
      const badgeW = 14;
      const badgeX = pageWidth - margin - badgeW - 2;
      const badgeY = y + (cardH - 5) / 2;
      
      doc.setFillColor(...indicatorLight);
      doc.setDrawColor(...indicatorColor);
      doc.setLineWidth(0.1);
      doc.roundedRect(badgeX, badgeY, badgeW, 5, 0.5, 0.5, 'FD');
      
      doc.setFontSize(5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...indicatorColor);
      doc.text(c.status.toUpperCase(), badgeX + (badgeW / 2), badgeY + 3.5, { align: 'center' });
      
      y += cardH + 2;
    });
  }

  // --- DIGITAL SIGNATURE ---
  // Move up 2 rows (about 8mm) to avoid footer conflict
  if (y > pageHeight - 55) {
    doc.addPage();
    y = margin;
  } else {
    y = pageHeight - 48;
  }
  
  // Signature block background - full page width
  doc.setFillColor(...colors.surfaceLow);
  doc.setDrawColor(255, 255, 255);
  doc.rect(0, y, pageWidth, 30, 'F');
  
  let sy = y + 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colors.primary);
  doc.text('INSPECTION RESULT & SIGNATURE', margin + 8, sy);
  
  // --- RESULT BLOCK (NEW prominent placement) ---
  const resultText = detail.lastRoundResult || 'PENDING';
  let resultBg: [number, number, number] = [241, 245, 249]; 
  let resultFg: [number, number, number] = [71, 85, 105]; 
  let resultLabel = 'PENDING';
  let resultFull = 'RESULT PENDING';

  if (resultText === 'AA') {
    resultBg = [0, 89, 97]; // Primary dark green
    resultFg = [255, 255, 255]; 
    resultLabel = 'AA';
    resultFull = 'ACCEPTED (AA)';
  } else if (resultText === 'RJ') {
    resultBg = [159, 18, 57]; // Dark crimson
    resultFg = [255, 255, 255]; 
    resultLabel = 'RJ';
    resultFull = 'REJECTED (RJ)';
  } else if (resultText === 'OWC') {
    resultBg = [146, 64, 14]; 
    resultFg = [255, 255, 255]; 
    resultLabel = 'OWC';
    resultFull = 'REINSPECT (OWC)';
  } else if (resultText === 'QCC') {
    resultBg = [12, 74, 110]; 
    resultFg = [255, 255, 255]; 
    resultLabel = 'QCC';
    resultFull = 'CONDITION (QCC)';
  }

  // Prominent Result Badge
  doc.setFillColor(...resultBg);
  doc.roundedRect(margin + 8, sy + 4, 35, 12, 1, 1, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...resultFg);
  doc.setFont('helvetica', 'bold');
  doc.text(resultFull, margin + 8 + 17.5, sy + 11.5, { align: 'center' });

  // Left sig - Inspector
  sy += 18;
  doc.setDrawColor(...colors.outline);
  doc.setLineWidth(0.3);
  doc.line(margin + 55, sy, margin + 115, sy);
  
  doc.setFontSize(6);
  doc.setTextColor(...colors.primary);
  doc.text('INSPECTOR', margin + 55, sy + 4);
  
  let inspectorName = lastRound?.inspectorDisplayName || lastRound?.submittedBy || '';
  if (inspectorName) {
     doc.setFont('times', 'italic');
     doc.setFontSize(14);
     doc.setTextColor(...colors.textMain);
     doc.text(inspectorName, margin + 55, sy - 2);
  }
  
  // Add inspector title below signature line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...colors.secondary);
  const inspectorTitle = 'Quality Inspector';
  doc.text(inspectorTitle, margin + 55, sy + 8);

  // Right sig - Inspection Date
  doc.line(margin + 125, sy, margin + 175, sy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...colors.primary);
  doc.text('INSPECTION DATE', margin + 125, sy + 4);

  const inspectionDate = lastRound?.actualDate || detail.plannedDate || new Date().toLocaleDateString();
  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.setTextColor(...colors.textMain);
  doc.text(inspectionDate, margin + 125, sy - 2);

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...colors.primary);
    doc.text('NBINS-REPORT-v4', margin, pageHeight - 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.secondary);
    doc.text('|', margin + 22, pageHeight - 10);
    doc.text(`PAGE ${String(i).padStart(2, '0')} OF ${String(totalPages).padStart(2, '0')}`, margin + 26, pageHeight - 10);
    
    doc.text('© 2026 PG NEWBUILDING. ALL RIGHTS RESERVED.', pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  const hullNum = detail.hullNumber || 'UNKNOWN';
  const discipline = detail.discipline || 'UNKNOWN';
  const itemNameSafe = detail.itemName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const roundText = `R${detail.currentRound}`;
  const fileResultText = detail.lastRoundResult || 'PENDING';
  
  const fileName = `NBINS-${hullNum}-${discipline}-${itemNameSafe}-${roundText}-${fileResultText}.pdf`;
  
  return { doc, fileName };
}

export async function generateInspectionReport(detail: InspectionItemDetailResponse) {
  const { doc, fileName } = await buildInspectionReportDoc(detail);
  // output the PDF down to client
  doc.save(fileName);
}

export async function generateBatchZip(details: InspectionItemDetailResponse[], zipName: string = "Inspection_Reports.zip") {
  const zip = new JSZip();
  for (const detail of details) {
    const { doc, fileName } = await buildInspectionReportDoc(detail);
    const pdfArrayBuffer = doc.output('arraybuffer');
    zip.file(fileName, pdfArrayBuffer);
  }
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, zipName);
}

export function generateInspectionChecklistPdf(
  items: InspectionListItem[],
  filters: {
    date?: string;
    hull?: string;
    discipline?: string;
  }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const normalizedFilters = {
    date: filters.date?.trim() || 'ALL',
    hull: filters.hull?.trim() || 'ALL',
    discipline: filters.discipline?.trim() || 'ALL'
  };

  const drawHeader = (pageNumber: number) => {
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(70, 96, 125); // #46607d
    doc.text('INSPECTION CHECKLIST EXPORT', margin, 20);
    
    // Date & Records
    doc.setFontSize(8);
    doc.setTextColor(94, 95, 97); // #5e5f61
    doc.text(`DATE: ${normalizedFilters.date !== 'ALL' ? normalizedFilters.date : new Date().toISOString().slice(0, 10)}    RECORDS: ${items.length}`, margin, 26);
    
    // Top border line
    doc.setDrawColor(227, 226, 228); // #e3e2e4
    doc.setLineWidth(0.5);
    doc.line(margin, 30, pageWidth - margin, 30);
    
    // Table Header Background
    doc.setFillColor(227, 226, 228); // surface-container-highest
    doc.rect(margin, 34, pageWidth - margin * 2, 10, 'F');
    
    // First column # has primary background
    doc.setFillColor(70, 96, 125); // primary #46607d
    doc.rect(margin, 34, 12, 10, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    
    // # column
    doc.setTextColor(245, 248, 255); // on-primary
    doc.text('#', margin + 6, 40, { align: 'center' });
    
    doc.setTextColor(70, 96, 125); // primary text
    doc.text('PROJECT', margin + 14, 40);
    doc.text('HULL / SHIP', margin + 34, 40);
    doc.text('DISC', margin + 74, 40);
    doc.text('PLAN DATE', margin + 92, 40);
    doc.text('RND', margin + 116, 40);
    doc.text('ITEM / DESCRIPTION', margin + 128, 40);
    doc.text('RESULT', margin + 219, 40);
    doc.text('STATUS', margin + 243, 40);
    doc.text('C', margin + 268.5, 40, { align: 'center' });

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(94, 95, 97); // #5e5f61
    doc.text(`Confidential Industrial Report - Page ${pageNumber}`, margin, pageHeight - 10);
    doc.text(`Generated Date: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} GMT`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  if (items.length === 0) {
    drawHeader(1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No inspection items match the current filters.', margin, 48);
    doc.save(`NBINS_Checklist_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  let pageNumber = 1;
  let y = 44;
  drawHeader(pageNumber);

  items.forEach((item, index) => {
    const itemLines = doc.splitTextToSize(item.itemName || '-', 85);
    const shipLines = doc.splitTextToSize(`${item.hullNumber} / ${item.shipName}`, 38);
    const resultText = item.currentResult || 'PENDING';
    const statusText = item.workflowStatus.toUpperCase();
    const dynamicHeight = Math.max(itemLines.length, shipLines.length) * 4 + 6;
    const currentRowHeight = Math.max(10, dynamicHeight);

    if (y + currentRowHeight > pageHeight - 18) {
      doc.addPage();
      pageNumber += 1;
      drawHeader(pageNumber);
      y = 44;
    }

    if (index % 2 === 0) {
      doc.setFillColor(245, 243, 244); // surface-container-low
    } else {
      doc.setFillColor(255, 255, 255); // white
    }
    doc.rect(margin, y, pageWidth - margin * 2, currentRowHeight, 'F');
    
    // Ghost border
    doc.setDrawColor(178, 177, 180);
    doc.setLineWidth(0.2);
    doc.line(margin, y + currentRowHeight, pageWidth - margin, y + currentRowHeight);

    const textY = y + 6;
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(158, 156, 157); // inverse-on-surface
    doc.text(String(index + 1).padStart(2, '0'), margin + 6, textY, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(49, 50, 52); // on-surface
    doc.text(item.projectCode || '-', margin + 14, textY);
    
    doc.setFont('helvetica', 'normal');
    doc.text(shipLines, margin + 34, textY);
    doc.text(item.discipline, margin + 74, textY);
    doc.text(item.plannedDate || '-', margin + 92, textY);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`R${item.currentRound}`, margin + 116, textY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(itemLines, margin + 128, textY); 
    doc.setFontSize(8);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    if (resultText === 'AA') {
        doc.setFillColor(209, 250, 229); // emerald-100
        doc.rect(margin + 219, y + 2.5, 18, 5, 'F');
        doc.setTextColor(6, 95, 70); // emerald-800
        doc.text('PASSED', margin + 228, textY - 0.2, { align: 'center' });
    } else if (resultText === 'RJ') {
        doc.setFillColor(255, 228, 230); // rose-100
        doc.rect(margin + 219, y + 2.5, 18, 5, 'F');
        doc.setTextColor(159, 18, 57); // rose-800
        doc.text('FAILED', margin + 228, textY - 0.2, { align: 'center' });
    } else if (resultText === 'OWC') {
        doc.setFillColor(254, 243, 199); // amber-100
        doc.rect(margin + 219, y + 2.5, 18, 5, 'F');
        doc.setTextColor(146, 64, 14); // amber-800
        doc.text('REINSP', margin + 228, textY - 0.2, { align: 'center' });
    } else if (resultText === 'QCC') {
        doc.setFillColor(186, 230, 253); 
        doc.rect(margin + 219, y + 2.5, 18, 5, 'F');
        doc.setTextColor(12, 74, 110); 
        doc.text('QCC', margin + 228, textY - 0.2, { align: 'center' });
    } else {
        doc.setFillColor(241, 245, 249); 
        doc.rect(margin + 219, y + 2.5, 18, 5, 'F');
        doc.setTextColor(71, 85, 105); 
        doc.text('PENDING', margin + 228, textY - 0.2, { align: 'center' });
    }

    if (statusText === 'CLOSED') {
      doc.setFillColor(70, 96, 125); 
      doc.rect(margin + 243, y + 2.5, 18, 5, 'F');
      doc.setTextColor(245, 248, 255); 
    } else {
      doc.setFillColor(213, 227, 252); 
      doc.rect(margin + 243, y + 2.5, 18, 5, 'F');
      doc.setTextColor(69, 83, 103); 
    }
    doc.text(statusText, margin + 252, textY - 0.2, { align: 'center' });

    const commentCount = item.openComments ?? 0;
    doc.setFontSize(8);
    doc.setTextColor(commentCount > 0 ? 159 : 158, commentCount > 0 ? 24 : 156, commentCount > 0 ? 55 : 157); // red if > 0 else gray
    doc.text(String(commentCount), margin + 268.5, textY, { align: 'center' });

    y += currentRowHeight;
  });

  const safeDate = normalizedFilters.date.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeHull = normalizedFilters.hull.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDiscipline = normalizedFilters.discipline.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`NBINS_Checklist_${safeDate}_${safeHull}_${safeDiscipline}.pdf`);
}

export function generateInspectionChecklistAsciiPdf(
  items: InspectionListItem[],
  filters: {
    date?: string;
    hull?: string;
    discipline?: string;
  }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 12;
  
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);

  const linesPerPage = 56; 
  let currentLineIdx = 0;
  let pageNum = 1;
  const lineHeight = 3.2; 
  
  const normalizedFilters = {
    date: filters.date?.trim() || 'ALL',
    hull: filters.hull?.trim() || 'ALL',
    discipline: filters.discipline?.trim() || 'ALL'
  };

  const addPageHeader = () => {
    if (currentLineIdx > 0) {
      doc.addPage();
      pageNum++;
    }
    currentLineIdx = 0;
    const title = 'SITE INSPECTION CHECKLIST (ASCII)';
    const topBorder = "=".repeat(151);
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(title.padStart(75 + title.length/2, " "), margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    
    doc.text(`Project : ${padRight('ALL', 20)} Date : ${padRight(normalizedFilters.date, 20)} Hull : ${padRight(normalizedFilters.hull, 20)} Disc : ${padRight(normalizedFilters.discipline, 20)}`, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text("-".repeat(151), margin, margin + (currentLineIdx++ * lineHeight));
    
    doc.text(`Total Records: ${items.length}`, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text(topBorder, margin, margin + (currentLineIdx++ * lineHeight));
    doc.text("", margin, margin + (currentLineIdx++ * lineHeight)); 
  };

  const printLine = (text: string) => {
    if (currentLineIdx >= linesPerPage) {
      addPageHeader();
    }
    doc.text(text, margin, margin + (currentLineIdx * lineHeight));
    currentLineIdx++;
  };

  addPageHeader();

  const colWidths = [
    {text: "#", width: 4},
    {text: "PRJ", width: 10},
    {text: "HULL", width: 12},
    {text: "DISC", width: 7},
    {text: "DATE", width: 12},
    {text: "R", width: 3},
    {text: "ITEM / DESCRIPTION", width: 62},
    {text: "QC", width: 10},
    {text: "RES", width: 5},
    {text: "ST", width: 8},
    {text: "C", width: 3}
  ];

  const headBorder = "+----+----------+------------+-------+------------+---+--------------------------------------------------------------+----------+-----+--------+---+";
  printLine(headBorder);
  printLine(buildAsciiRow(colWidths.map(c => ({text: c.text, width: c.width})))[0]);
  printLine(headBorder);

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const cells = [
      {text: String(idx + 1), width: 4},
      {text: item.projectCode || '-', width: 10},
      {text: item.hullNumber || '-', width: 12},
      {text: item.discipline || '-', width: 7},
      {text: item.plannedDate || '-', width: 12},
      {text: String(item.currentRound || 1), width: 3},
      {text: item.itemName || '-', width: 62},
      {text: item.yardQc || '-', width: 10},
      {text: item.currentResult || '-', width: 5},
      {text: (item.workflowStatus || '-').substring(0, 8), width: 8},
      {text: String(item.openComments || 0), width: 3}
    ];
    
    const lines = buildAsciiRow(cells);
    if (currentLineIdx + lines.length > linesPerPage) {
      addPageHeader();
      printLine(headBorder);
      printLine(buildAsciiRow(colWidths.map(c => ({text: c.text, width: c.width})))[0]);
      printLine(headBorder);
    }
    for (const line of lines) { printLine(line); }
    printLine(headBorder);
  }

  // Draw footer page numbers
  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.getWidth() - margin - 30, doc.internal.pageSize.getHeight() - margin + 5);
  }
  
  const safeDate = normalizedFilters.date.replace(/\//g, '-');
  const safeHull = normalizedFilters.hull.replace(/[\s\/]/g, '_');
  const safeDiscipline = normalizedFilters.discipline;
  doc.save(`NBINS_Checklist_ASCII_${safeDate}_${safeHull}_${safeDiscipline}.pdf`);
}

