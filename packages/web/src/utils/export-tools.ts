import { jsPDF } from 'jspdf';
import * as xlsx from 'xlsx';
import type { ObservationItem, InspectionCommentView } from '@nbins/shared';
import { PG_LOGO_B64 } from './pg-logo-b64';

export function exportObservationsPdf(items: ObservationItem[], comments: InspectionCommentView[], projectName: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Header
  doc.addImage(PG_LOGO_B64, 'JPEG', margin, y, 22, 10);
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('OBSERVATION & COMMENTS EXPORT', pageWidth / 2, y + 5, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`Project: ${projectName}`, pageWidth - margin, y + 5, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 10, { align: 'right' });

  y += 18;
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Print Observations
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. OBSERVATIONS', margin, y);
  y += 8;

  doc.setFontSize(9);
  if (items.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('No observations found.', margin, y);
    y += 10;
  } else {
    // Table Header
    doc.setFont('helvetica', 'bold');
    doc.text('#', margin, y);
    doc.text('TYPE', margin + 10, y);
    doc.text('DISC', margin + 35, y);
    doc.text('LOCATION', margin + 55, y);
    doc.text('DATE', margin + 95, y);
    doc.text('CONTENT', margin + 120, y);
    doc.text('STATUS', 265, y);
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    for (const item of items) {
       if (y > pageHeight - 20) { doc.addPage(); y = margin; }
       
       const contentLines = doc.splitTextToSize(item.content, 140);
       
       doc.text(String(item.serialNo), margin, y);
       doc.text(item.type, margin + 10, y);
       doc.text(item.discipline, margin + 35, y);
       const locationText = doc.splitTextToSize(item.location || '-', 38);
       doc.text(locationText, margin + 55, y);
       doc.text(item.date, margin + 95, y);
       doc.text(contentLines, margin + 120, y);
       doc.text(item.status.toUpperCase(), 265, y);

       const rowHeight = Math.max(contentLines.length, locationText.length) * 4 + 4;
       y += rowHeight;
       doc.setDrawColor(226, 232, 240);
       doc.line(margin, y - 2, pageWidth - margin, y - 2);
    }
  }

  y += 10;
  if (y > pageHeight - 40) { doc.addPage(); y = margin; }

  // Print Inspection Comments
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. INSPECTION COMMENTS', margin, y);
  y += 8;

  doc.setFontSize(9);
  if (comments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('No inspection comments found.', margin, y);
  } else {
    // Table Header
    doc.setFont('helvetica', 'bold');
    doc.text('ID', margin, y);
    doc.text('SHIP', margin + 15, y);
    doc.text('DISC', margin + 45, y);
    doc.text('ITEM', margin + 70, y);
    doc.text('CONTENT', margin + 120, y);
    doc.text('AUTHOR', 240, y);
    doc.text('STATUS', 265, y);
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    for (const cm of comments) {
       if (y > pageHeight - 20) { doc.addPage(); y = margin; }
       
       const itemLines = doc.splitTextToSize(cm.inspectionItemName, 45);
       const contentLines = doc.splitTextToSize(cm.content, 115);
       
       doc.text(String(cm.localId), margin, y);
       doc.text(cm.hullNumber, margin + 15, y);
       doc.text(cm.discipline, margin + 45, y);
       doc.text(itemLines, margin + 70, y);
       doc.text(contentLines, margin + 120, y);
       doc.text(cm.authorName, 240, y);
       doc.text(cm.status.toUpperCase(), 265, y);

       const rowHeight = Math.max(itemLines.length, contentLines.length) * 4 + 4;
       y += rowHeight;
       doc.setDrawColor(226, 232, 240);
       doc.line(margin, y - 2, pageWidth - margin, y - 2);
    }
  }

  doc.save(`NBINS_Export_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportObservationsExcel(items: ObservationItem[], comments: InspectionCommentView[], projectName: string) {
  // Observations Sheet
  const obsData = items.map(i => ({
    "Serial No": i.serialNo,
    "Type": i.type,
    "Discipline": i.discipline,
    "Location": i.location || "-",
    "Date": i.date,
    "Content": i.content,
    "Remark": i.remark || "-",
    "Author": i.authorName || i.authorId,
    "Status": i.status.toUpperCase(),
    "Closed At": i.closedAt ? new Date(i.closedAt).toLocaleDateString() : "-"
  }));
  const wsObs = xlsx.utils.json_to_sheet(obsData);

  // Inspection Comments Sheet
  const cmData = comments.map(c => ({
    "ID": c.localId,
    "Ship (Hull)": c.hullNumber,
    "Discipline": c.discipline,
    "Inspection Item": c.inspectionItemName,
    "Round": `R${c.roundNumber}`,
    "Content": c.content,
    "Author": c.authorName,
    "Status": c.status.toUpperCase(),
    "Closed At": c.closedAt ? new Date(c.closedAt).toLocaleDateString() : "-"
  }));
  const wsCm = xlsx.utils.json_to_sheet(cmData);

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, wsObs, "Observations");
  xlsx.utils.book_append_sheet(wb, wsCm, "Inspection Comments");

  xlsx.writeFile(wb, `NBINS_Export_${projectName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
