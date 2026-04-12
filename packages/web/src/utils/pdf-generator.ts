import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { InspectionItemDetailResponse, InspectionListItem } from '@nbins/shared';
import { PG_LOGO_B64 } from './pg-logo-b64';
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

  let y = margin;

  // --- HEADER ---
  // Company Logo
  drawPdfLogo(doc, margin, y);


  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Dark blue gray
  doc.text('INSPECTION REPORT', pageWidth / 2, y, { align: 'center' });

  y += 8;

  // Horizontal Line
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 12;

  // --- SECTION 1: PROJECT INFORMATION ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PROJECT INFORMATION', margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project Code: ${detail.projectCode}`, margin, y);
  doc.text(`Project Name: ${detail.projectName}`, margin + 80, y);
  y += 6;
  doc.text(`Class: ${detail.projectClass || 'N/A'}`, margin, y);
  doc.text(`Shipyard: ${detail.projectShipyard || 'N/A'}`, margin + 80, y);
  y += 10;

  // --- SECTION 2: VESSEL INFORMATION ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('VESSEL INFORMATION', margin, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Hull Number: ${detail.hullNumber}`, margin, y);
  doc.text(`Ship Name: ${detail.shipName}`, margin + 80, y);
  y += 10;

  // --- SECTION 3: INSPECTION DETAILS ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('INSPECTION ITEM DETAILS', margin, y);
  y += 6;

  // Simple bounding box for item details
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 250, 252); // light slate
  doc.rect(margin, y, pageWidth - (margin * 2), 24, 'FD');
  
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Item Name:`, margin + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${detail.itemName}`, margin + 28, y);

  doc.setFont('helvetica', 'bold');
  doc.text(`Discipline:`, margin + 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${detail.discipline}`, margin + 130, y);
  
  y += 8;
  const currentRoundObj = detail.roundHistory.find(r => r.roundNumber === detail.currentRound);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Result:`, margin + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${detail.lastRoundResult || 'Pending'}`, margin + 20, y);

  doc.setFont('helvetica', 'bold');
  doc.text(`Status:`, margin + 60, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${detail.workflowStatus.toUpperCase()}`, margin + 74, y);

  doc.setFont('helvetica', 'bold');
  doc.text(`Insp. Date:`, margin + 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${currentRoundObj?.actualDate || detail.plannedDate || 'N/A'}`, margin + 130, y);

  y += 18;

  // --- SECTION 4: ROUND HISTORY ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ROUND HISTORY', margin, y);
  y += 6;

  // Table Headers
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  // Tight columns: RND | DATE | RESULT | INSPECTOR
  doc.text('RND', margin, y);
  doc.text('DATE', margin + 12, y);
  doc.text('RESULT', margin + 36, y);
  doc.text('INSPECTOR', margin + 60, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  if (detail.roundHistory && detail.roundHistory.length > 0) {
    detail.roundHistory.forEach(r => {
      doc.text(`${r.roundNumber}`, margin, y);
      doc.text(`${r.actualDate || '-'}`, margin + 12, y);
      doc.text(`${r.submittedResult || '-'}`, margin + 36, y);
      doc.text(`${r.inspectorDisplayName || r.submittedBy || '-'}`, margin + 60, y);
      y += 5;
    });
  } else {
    doc.text('No round history.', margin, y);
    y += 6;
  }

  y += 6;

  // --- SECTION 5: COMMENTS ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('COMMENTS / DEFICIENCIES', margin, y);
  y += 6;

  if (detail.comments && detail.comments.length > 0) {
    detail.comments.forEach((c) => {
      // Manage page breaks
      if (y > pageHeight - 40) {
        doc.addPage();
        y = margin;
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`[${c.status.toUpperCase()}]`, margin, y);
      doc.setFont('helvetica', 'normal');
      const contentWidth = pageWidth - margin - 20;
      const splitContent = doc.splitTextToSize(c.message, contentWidth);
      doc.text(splitContent, margin + 20, y);
      y += splitContent.length * 4 + 3;
    });
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('No comments recorded.', margin, y);
    y += 6;
  }

  // --- SECTION 6: SIGNATURES ---
  // Always push signatures to the bottom or next page if no space
  if (y > pageHeight - 50) {
    doc.addPage();
    y = margin;
  } else {
    y = pageHeight - 50; // Pin to bottom
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);

  const sigWidth = 70;
  
  // Finding last round for both signatures
  const lastRound = detail.roundHistory.length > 0 
    ? detail.roundHistory.reduce((prev, current) => (prev.roundNumber > current.roundNumber) ? prev : current, detail.roundHistory[0])
    : null;
  
  // Signature 1: Yard QC (Left)
  doc.line(margin, y, margin + sigWidth, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('YARD QC INSPECTOR', margin, y + 5);
  doc.setFont('helvetica', 'normal');
  
  const inspectorName = lastRound?.inspectorDisplayName || detail.yardQc || '';
  
  doc.text(`Name: ${inspectorName}`, margin, y + 12);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y + 18);

  // Signature 2: Owner Rep (Right)
  const rightSigX = pageWidth - margin - sigWidth;
  doc.line(rightSigX, y, rightSigX + sigWidth, y);
  doc.setFont('helvetica', 'bold');
  doc.text('OWNER REPRESENTATIVE', rightSigX, y + 5);
  doc.setFont('helvetica', 'normal');
  
  const submitterName = lastRound?.inspectorDisplayName || lastRound?.submittedBy || '______________________';
  const submitDate = lastRound?.submittedAt 
    ? new Date(lastRound.submittedAt).toLocaleDateString() 
    : '______________________';
  
  // Generate HASH CODE using SHA-256
  let hashCode = '____________________';
  if (lastRound?.submittedAt && submitterName !== '______________________') {
    const text = `${submitterName}-${lastRound.submittedAt}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    hashCode = hashHex.substring(0, 20).toUpperCase();
  }
  
  doc.text(`Name: ${submitterName}`, rightSigX, y + 12);
  doc.text(`Date: ${submitDate}`, rightSigX, y + 18);
  
  // HASH CODE with smaller font
  doc.setFontSize(8);
  doc.text(`HASH CODE: ${hashCode}`, rightSigX, y + 24);
  doc.setFontSize(10); // Reset to default size

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Generated by NBINS System', margin, pageHeight - 10);
  
  // Determine components for filename
  const hullNum = detail.hullNumber || 'UNKNOWN';
  const discipline = detail.discipline || 'UNKNOWN';
  const itemName = detail.itemName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const roundText = `R${detail.currentRound}`;
  const resultText = detail.lastRoundResult || 'PENDING';
  
  const fileName = `${hullNum}-${discipline}-${itemName}-${roundText}-${resultText}.pdf`;
  
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

