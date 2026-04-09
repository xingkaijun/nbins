import { jsPDF } from 'jspdf';
import type { InspectionItemDetailResponse } from '@nbins/shared';
import { PG_LOGO_B64 } from './pg-logo-b64';
// For simplicity, we just use text or a placeholder graphic right now, and refine later.
// We'll create a clean text-based report, using a generic graphic if possible, or leave it textual.

export function generateInspectionReport(detail: InspectionItemDetailResponse) {
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
  doc.addImage(PG_LOGO_B64, 'JPEG', margin, y, 22, 10);
  
  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // Dark blue gray
  doc.text('INSPECTION REPORT', pageWidth / 2, y, { align: 'center' });

  // Report Number / Reference
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`IR-${detail.id.substring(0, 8).toUpperCase()}`, pageWidth - margin, y, { align: 'right' });

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
  // Columns: Round (15), Date (30), Result (20), Inspector (30)
  doc.text('RND', margin, y);
  doc.text('DATE', margin + 15, y);
  doc.text('RESULT', margin + 45, y);
  doc.text('INSPECTOR', margin + 70, y);
  
  y += 2;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  if (detail.roundHistory && detail.roundHistory.length > 0) {
    detail.roundHistory.forEach(r => {
      doc.text(`${r.roundNumber}`, margin, y);
      doc.text(`${r.actualDate || '-'}`, margin + 15, y);
      doc.text(`${r.submittedResult || '-'}`, margin + 45, y);
      doc.text(`${r.inspectorDisplayName || r.submittedBy || '-'}`, margin + 70, y);
      y += 6;
    });
  } else {
    doc.text('No round history.', margin, y);
    y += 6;
  }

  y += 8;

  // --- SECTION 5: COMMENTS ---
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('COMMENTS / DEFICIENCIES', margin, y);
  y += 6;

  if (detail.comments && detail.comments.length > 0) {
    detail.comments.forEach((c, idx) => {
      // Manage page breaks
      if (y > pageHeight - 60) {
        doc.addPage();
        y = margin;
      }
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`#${idx + 1} - [${c.status.toUpperCase()}] Created: ${new Date(c.createdAt).toLocaleDateString()} by ${c.createdBy}`, margin, y);
      y += 5;
      
      doc.setFont('helvetica', 'normal');
      
      // Auto text wrapping for comment content
      const splitContent = doc.splitTextToSize(c.message, pageWidth - (margin * 2));
      doc.text(splitContent, margin, y);
      
      y += (splitContent.length * 4) + 4;
    });
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('No comments recorded.', margin, y);
    y += 8;
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
  
  // Signature 1: Yard QC (Left)
  doc.line(margin, y, margin + sigWidth, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('YARD QC INSPECTOR', margin, y + 5);
  doc.setFont('helvetica', 'normal');
  
  // Finding last inspector
  const lastRound = detail.roundHistory.length > 0 
    ? detail.roundHistory.reduce((prev, current) => (prev.roundNumber > current.roundNumber) ? prev : current, detail.roundHistory[0])
    : null;
  const inspectorName = lastRound?.inspectorDisplayName || detail.yardQc || '';
  
  doc.text(`Name: ${inspectorName}`, margin, y + 12);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, y + 18);

  // Signature 2: Owner Rep (Right)
  const rightSigX = pageWidth - margin - sigWidth;
  doc.line(rightSigX, y, rightSigX + sigWidth, y);
  doc.setFont('helvetica', 'bold');
  doc.text('OWNER REPRESENTATIVE', rightSigX, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Name: ______________________`, rightSigX, y + 12);
  doc.text(`Date: ______________________`, rightSigX, y + 18);

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
  
  // output the PDF down to client
  doc.save(fileName);
}
